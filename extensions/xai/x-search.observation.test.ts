import { withFetchPreconnect } from "@enclawed/plugin-sdk/test-env";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createXaiWebSearchProvider } from "./web-search.js";
import { createXSearchTool } from "./x-search.js";

const TOOL_OBSERVATION = Symbol.for("enclawed.tool-observation");

type Sent = { method: string; url: string; body: string };
type Declare = (args: Record<string, unknown>) => unknown;

const XAI_RESPONSE = {
  output: [{ type: "message", content: [{ type: "output_text", text: "ok", annotations: [] }] }],
  citations: [],
};

function xaiConfig(xSearch?: Record<string, unknown>) {
  return {
    plugins: {
      entries: {
        xai: {
          config: {
            webSearch: { apiKey: "xai-test-key" }, // pragma: allowlist secret
            ...(xSearch ? { xSearch } : {}),
          },
        },
      },
    },
  };
}

function declarationOf(tool: unknown): Declare {
  const declare = (tool as Record<symbol, unknown>)[TOOL_OBSERVATION];
  if (typeof declare !== "function") {
    throw new Error("Expected a declared observation");
  }
  return declare as Declare;
}

function createX(xSearch?: Record<string, unknown>) {
  const tool = createXSearchTool({ config: xaiConfig(xSearch), runtimeConfig: null });
  if (!tool) {
    throw new Error("Expected x_search tool");
  }
  return { tool, declare: declarationOf(tool) };
}

function xBody(params: {
  query: string;
  model?: string;
  tool?: Record<string, unknown>;
  maxTurns?: number;
}): string {
  return JSON.stringify({
    model: params.model ?? "grok-4-1-fast-non-reasoning",
    input: [{ role: "user", content: params.query }],
    tools: [{ type: "x_search", ...params.tool }],
    ...(params.maxTurns ? { max_turns: params.maxTurns } : {}),
  });
}

let sent: Sent[];
const priorFetch = global.fetch;

beforeEach(() => {
  vi.stubEnv("XAI_API_KEY", "");
  sent = [];
  global.fetch = withFetchPreconnect(
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      sent.push({
        method: String(init?.method),
        url: input instanceof Request ? input.url : String(input),
        body: typeof init?.body === "string" ? init.body : "",
      });
      return new Response(JSON.stringify(XAI_RESPONSE), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
});

afterEach(() => {
  global.fetch = priorFetch;
  vi.unstubAllEnvs();
});

describe("x_search observation", () => {
  it("is enumerable on the agent tool and declares the Responses POST", () => {
    const { tool, declare } = createX({ maxTurns: 2 });
    expect(Object.getOwnPropertyDescriptor(tool, TOOL_OBSERVATION)?.enumerable).toBe(true);
    expect(
      declare({
        query: " posts ",
        allowed_x_handles: ["enclawed"],
        excluded_x_handles: ["spam"],
        from_date: "2026-03-01",
        to_date: " 2026-03-20 ",
        enable_image_understanding: true,
        enable_video_understanding: true,
      }),
    ).toEqual({
      type: "http",
      method: "POST",
      url: "https://api.x.ai/v1/responses",
      body: xBody({
        query: "posts",
        maxTurns: 2,
        tool: {
          allowed_x_handles: ["enclawed"],
          excluded_x_handles: ["spam"],
          from_date: "2026-03-01",
          to_date: "2026-03-20",
          enable_image_understanding: true,
          enable_video_understanding: true,
        },
      }),
      read: true,
      client: "x_search",
    });
  });

  it("gives the same observation for calls that differ only off the wire", () => {
    // inlineCitations only shapes the local result; it is never sent.
    const plain = createX();
    const inline = createX({ inlineCitations: true });
    const base = plain.declare({ query: "same" });
    expect(inline.declare({ query: "same" })).toEqual(base);
    expect(plain.declare({ query: "  same ", unknown: 1 })).toEqual(base);
    expect(plain.declare({ query: "same", enable_image_understanding: "yes" })).toEqual(base);
    expect(plain.declare({ query: "same", allowed_x_handles: [] })).toEqual(base);
    expect(plain.declare({ query: "same", from_date: "  " })).toEqual(base);
    expect(JSON.stringify(base)).not.toContain("xai-test-key");
  });

  it("changes with every parameter and config value that reaches the wire", () => {
    const { declare } = createX();
    const base = declare({ query: "q" });
    for (const extra of [
      { query: "q2" },
      { allowed_x_handles: ["a"] },
      { excluded_x_handles: ["b"] },
      { from_date: "2026-01-01" },
      { to_date: "2026-01-01" },
      { enable_image_understanding: true },
      { enable_video_understanding: true },
    ]) {
      expect(declare({ query: "q", ...extra }), JSON.stringify(extra)).not.toEqual(base);
    }
    expect(createX({ model: "grok-4-1-fast" }).declare({ query: "q" })).not.toEqual(base);
    expect(createX({ maxTurns: 3 }).declare({ query: "q" })).not.toEqual(base);
  });

  it("equals the request execute sends, also when the result cache answers", async () => {
    const { tool, declare } = createX({ maxTurns: 2 });
    const args = { query: "x_search wire check", from_date: "2026-02-01" };
    await tool.execute("c1", args);
    const declared = declare(args) as Sent;
    expect(sent).toEqual([{ method: declared.method, url: declared.url, body: declared.body }]);
    sent = [];
    await tool.execute("c2", args);
    expect(sent).toEqual([]);
    expect(declare(args)).toEqual(declared);
  });

  it("declares no request without a key, and throws on invalid args as execute does", async () => {
    // Enabled by an environment key that is gone by the time of the call:
    // the call answers with the missing-key payload and sends nothing.
    vi.stubEnv("XAI_API_KEY", "xai-env-key");
    const envTool = createXSearchTool({ config: {}, runtimeConfig: null });
    if (!envTool) {
      throw new Error("Expected x_search tool");
    }
    vi.stubEnv("XAI_API_KEY", "");
    expect((await envTool.execute("c0", { query: "q" })).details).toMatchObject({
      error: "missing_xai_api_key",
    });
    expect(declarationOf(envTool)({ query: "q" })).toEqual({ type: "none" });
    const { tool, declare } = createX();
    for (const args of [
      {},
      { query: "q", from_date: "2026-1-1" },
      { query: "q", from_date: "2026-02-30" },
      { query: "q", from_date: "2026-03-02", to_date: "2026-03-01" },
    ]) {
      await expect(tool.execute("c", args)).rejects.toThrow();
      expect(() => declare(args)).toThrow();
    }
    expect(sent).toEqual([]);
  });
});

describe("grok web_search observation", () => {
  function createGrok(
    searchConfig: Record<string, unknown> = { grok: { apiKey: "xai-test-key" } },
  ) {
    const tool = createXaiWebSearchProvider().createTool({ config: {}, searchConfig } as never);
    if (!tool) {
      throw new Error("Expected tool definition");
    }
    return { tool, declare: declarationOf(tool) };
  }

  function grokBody(query: string, model = "grok-4-1-fast"): string {
    return JSON.stringify({
      model,
      input: [{ role: "user", content: query }],
      tools: [{ type: "web_search" }],
    });
  }

  it("is enumerable on the tool definition and declares the Responses POST", async () => {
    const { tool, declare } = createGrok();
    expect(Object.getOwnPropertyDescriptor(tool, TOOL_OBSERVATION)?.enumerable).toBe(true);
    expect(await declare({ query: "enclawed" })).toEqual({
      type: "http",
      method: "POST",
      url: "https://api.x.ai/v1/responses",
      body: grokBody("enclawed"),
      read: true,
      client: "web_search:grok",
    });
  });

  it("gives the same observation for calls that differ only off the wire", async () => {
    const { declare } = createGrok();
    const base = await declare({ query: "same" });
    // count is accepted but never sent; inlineCitations only shapes the result.
    expect(await declare({ query: "same", count: 9 })).toEqual(base);
    expect(await declare({ query: " same  " })).toEqual(base);
    const inline = createGrok({ grok: { apiKey: "xai-test-key", inlineCitations: true } });
    expect(await inline.declare({ query: "same" })).toEqual(base);
    expect(JSON.stringify(base)).not.toContain("xai-test-key");
  });

  it("changes with every parameter and config value that reaches the wire", async () => {
    const { declare } = createGrok();
    const base = await declare({ query: "q" });
    expect(await declare({ query: "q2" })).not.toEqual(base);
    const other = createGrok({ grok: { apiKey: "xai-test-key", model: "grok-4-fast" } });
    expect(await other.declare({ query: "q" })).toEqual({
      ...(base as object),
      body: grokBody("q", "grok-4-fast"),
    });
  });

  it("equals the request execute sends, also when the result cache answers", async () => {
    const { tool, declare } = createGrok();
    const args = { query: "grok wire check" };
    await tool.execute(args);
    const declared = (await declare(args)) as Sent;
    expect(sent).toEqual([{ method: declared.method, url: declared.url, body: declared.body }]);
    sent = [];
    await tool.execute(args);
    expect(sent).toEqual([]);
    expect(await declare(args)).toEqual(declared);
  });

  it("is null when execute answers without sending, and throws on a missing query", async () => {
    const keyless = createGrok({});
    expect(await keyless.tool.execute({ query: "q" })).toMatchObject({
      error: "missing_xai_api_key",
    });
    expect(await keyless.declare({ query: "q" })).toBeNull();
    const { tool, declare } = createGrok();
    await expect(tool.execute({ query: " " })).rejects.toThrow(/query required/);
    await expect(declare({ query: " " })).rejects.toThrow(/query required/);
    expect(sent).toEqual([]);
  });
});
