// Provider seam: the executive assistant must behave identically whichever
// model answers it, and two security properties must survive the abstraction.
//
// Everything here drives a stubbed fetch, so it is deterministic and needs no
// network and no API key.

import { afterEach, describe, expect, it } from "vitest";
import {
  AnthropicProvider,
  OpenAiProvider,
  ProviderError,
} from "../../enclawed-apps/executive-assistant/src/tools/llm-provider.ts";

type Captured = { url: string; init: RequestInit; body: Record<string, unknown> };

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** Install a fetch that records the request and replies with `payload`. */
function stubFetch(payload: unknown, status = 200): Captured[] {
  const calls: Captured[] = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    // RequestInit.body is BodyInit and url is RequestInfo; both stringify to
    // "[object …]" for the non-string members. Everything this suite sends is
    // a string body to a string URL, so read those shapes and ignore the rest.
    const raw = typeof init?.body === "string" ? init.body : "{}";
    const href = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
    const body = JSON.parse(raw) as Record<string, unknown>;
    calls.push({ url: href, init: init ?? {}, body });
    return new Response(JSON.stringify(payload), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return calls;
}

const TOOL = {
  type: "function" as const,
  function: {
    name: "send_reply",
    description: "send a reply",
    parameters: { type: "object", properties: {} },
  },
};

describe("provider seam: security properties", () => {
  it("chat() never sends a tool surface (anthropic)", async () => {
    // Stage-0 calls chat() precisely because there is no mechanism to call a
    // tool. A provider that quietly attached tools would remove that with no
    // call site changing.
    const calls = stubFetch({ content: [{ type: "text", text: "ok" }] });
    const p = new AnthropicProvider({ apiKey: "k", baseUrl: "https://example.invalid" });
    await p.chat({ model: "m", messages: [{ role: "user", content: "hi" }] });
    expect(calls[0].body).not.toHaveProperty("tools");
  });

  it("chat() never sends a tool surface (openai)", async () => {
    const calls = stubFetch({ choices: [{ message: { content: "ok" } }] });
    const p = new OpenAiProvider({ apiKey: "k", baseUrl: "https://example.invalid" });
    await p.chat({ model: "m", messages: [{ role: "user", content: "hi" }] });
    expect(calls[0].body).not.toHaveProperty("tools");
  });

  it("resolves globalThis.fetch at call time, so the egress guard applies", async () => {
    // The guard installs itself by replacing the global AFTER providers are
    // constructed. Capturing fetch in the constructor would route provider
    // traffic around the allowlist.
    const p = new AnthropicProvider({ apiKey: "k", baseUrl: "https://example.invalid" });
    const calls = stubFetch({ content: [{ type: "text", text: "late" }] });
    const out = await p.chat({ model: "m", messages: [{ role: "user", content: "hi" }] });
    expect(out).toBe("late");
    expect(calls).toHaveLength(1);
  });
});

describe("anthropic mapping", () => {
  it("lifts the leading system turn out of messages", async () => {
    // Anthropic rejects a system role inside messages.
    const calls = stubFetch({ content: [{ type: "text", text: "" }] });
    const p = new AnthropicProvider({ apiKey: "k", baseUrl: "https://example.invalid" });
    await p.chat({
      model: "m",
      messages: [
        { role: "system", content: "you are an assistant" },
        { role: "user", content: "hello" },
      ],
    });
    expect(calls[0].body.system).toBe("you are an assistant");
    const msgs = calls[0].body.messages as Array<{ role: string }>;
    expect(msgs).toHaveLength(1);
    expect(msgs[0].role).toBe("user");
  });

  it("sends a sanitised image as a base64 source block", async () => {
    const calls = stubFetch({ content: [{ type: "text", text: "" }] });
    const p = new AnthropicProvider({ apiKey: "k", baseUrl: "https://example.invalid" });
    await p.chat({
      model: "m",
      messages: [{ role: "user", content: "what is this", images: ["QUJD"] }],
    });
    const msgs = calls[0].body.messages as Array<{ content: Array<Record<string, unknown>> }>;
    const image = msgs[0].content.find((b) => b.type === "image");
    expect(image).toBeDefined();
    expect((image!.source as { data: string }).data).toBe("QUJD");
  });

  it("concatenates text blocks and maps tool_use calls", async () => {
    stubFetch({
      content: [
        { type: "text", text: "on it" },
        { type: "tool_use", name: "send_reply", input: { to: "a@b.c" } },
      ],
    });
    const p = new AnthropicProvider({ apiKey: "k", baseUrl: "https://example.invalid" });
    const r = await p.chatWithTools({
      model: "m",
      messages: [{ role: "user", content: "reply please" }],
      tools: [TOOL],
    });
    expect(r.content).toBe("on it");
    expect(r.toolCalls).toHaveLength(1);
    expect(r.toolCalls[0].function.name).toBe("send_reply");
    expect(r.toolCalls[0].function.arguments).toEqual({ to: "a@b.c" });
  });

  it("reports a failed request as a ProviderError carrying the status", async () => {
    stubFetch({ error: { message: "overloaded" } }, 529);
    const p = new AnthropicProvider({ apiKey: "k", baseUrl: "https://example.invalid" });
    await expect(
      p.chat({ model: "m", messages: [{ role: "user", content: "hi" }] }),
    ).rejects.toBeInstanceOf(ProviderError);
  });
});

describe("openai mapping", () => {
  it("parses tool arguments, which arrive as a JSON string", async () => {
    stubFetch({
      choices: [
        {
          message: {
            content: "sure",
            tool_calls: [{ function: { name: "send_reply", arguments: '{"to":"a@b.c"}' } }],
          },
        },
      ],
    });
    const p = new OpenAiProvider({ apiKey: "k", baseUrl: "https://example.invalid" });
    const r = await p.chatWithTools({
      model: "m",
      messages: [{ role: "user", content: "reply" }],
      tools: [TOOL],
    });
    expect(r.toolCalls[0].function.arguments).toEqual({ to: "a@b.c" });
  });

  it("drops a tool call whose arguments are malformed rather than throwing", async () => {
    // A model emitting broken JSON must not take the assistant down; no call
    // is the safe reading, and the caller sees the text instead.
    stubFetch({
      choices: [
        {
          message: {
            content: "text still usable",
            tool_calls: [{ function: { name: "send_reply", arguments: "{not json" } }],
          },
        },
      ],
    });
    const p = new OpenAiProvider({ apiKey: "k", baseUrl: "https://example.invalid" });
    const r = await p.chatWithTools({
      model: "m",
      messages: [{ role: "user", content: "reply" }],
      tools: [TOOL],
    });
    expect(r.toolCalls).toHaveLength(0);
    expect(r.content).toBe("text still usable");
  });

  it("sends an image as a data URL alongside the text", async () => {
    const calls = stubFetch({ choices: [{ message: { content: "" } }] });
    const p = new OpenAiProvider({ apiKey: "k", baseUrl: "https://example.invalid" });
    await p.chat({
      model: "m",
      messages: [{ role: "user", content: "what is this", images: ["QUJD"] }],
    });
    const msgs = calls[0].body.messages as Array<{ content: Array<Record<string, unknown>> }>;
    const image = msgs[0].content.find((b) => b.type === "image_url");
    expect((image!.image_url as { url: string }).url).toContain("base64,QUJD");
  });

  it("returns empty text rather than undefined when the model says nothing", async () => {
    stubFetch({ choices: [{ message: { content: null } }] });
    const p = new OpenAiProvider({ apiKey: "k", baseUrl: "https://example.invalid" });
    expect(await p.chat({ model: "m", messages: [{ role: "user", content: "hi" }] })).toBe("");
  });
});

describe("provider identity", () => {
  it("declares cloud locality, which the setup flow warns on", async () => {
    expect(new AnthropicProvider({ apiKey: "k" }).locality).toBe("cloud");
    expect(new OpenAiProvider({ apiKey: "k" }).locality).toBe("cloud");
  });

  it("reports the endpoint it will talk to", () => {
    expect(new OpenAiProvider({ apiKey: "k" }).apiBase()).toBe("https://api.openai.com");
    expect(new AnthropicProvider({ apiKey: "k", baseUrl: "https://proxy/" }).apiBase()).toBe(
      "https://proxy",
    );
  });

  it("ping reports unreachable without throwing", async () => {
    globalThis.fetch = (async () => {
      throw new Error("ENOTFOUND");
    }) as unknown as typeof fetch;
    const health = await new AnthropicProvider({ apiKey: "k" }).ping(10);
    expect(health.ok).toBe(false);
    expect(health.reason).toContain("ENOTFOUND");
  });
});
