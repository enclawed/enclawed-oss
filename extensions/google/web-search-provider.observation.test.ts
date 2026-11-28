import type { EnclawedConfig } from "@enclawed/plugin-sdk/config-types";
import { mockPinnedHostnameResolution } from "@enclawed/plugin-sdk/test-env";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGeminiWebSearchProvider } from "./src/gemini-web-search-provider.js";

const TOOL_OBSERVATION = Symbol.for("enclawed.tool-observation");

type Sent = { method: string; url: string; body: string };
type Declare = (args: Record<string, unknown>) => Promise<unknown>;

const URL_FLASH =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

function createTool(searchConfig: Record<string, unknown> = { gemini: { apiKey: "AIza-test" } }) {
  const tool = createGeminiWebSearchProvider().createTool({
    config: {} as EnclawedConfig,
    searchConfig,
  } as never);
  if (!tool) {
    throw new Error("Expected tool definition");
  }
  const declare = (tool as unknown as Record<symbol, unknown>)[TOOL_OBSERVATION];
  if (typeof declare !== "function") {
    throw new Error("Expected a declared observation");
  }
  return { tool, declare: declare as Declare };
}

function bodyFor(query: string): string {
  return JSON.stringify({
    contents: [{ parts: [{ text: query }] }],
    tools: [{ google_search: {} }],
  });
}

describe("gemini web_search observation", () => {
  const priorFetch = global.fetch;
  let ssrfMock: { mockRestore: () => void } | undefined;
  let sent: Sent[];

  beforeEach(() => {
    vi.stubEnv("GEMINI_API_KEY", "");
    ssrfMock = mockPinnedHostnameResolution();
    sent = [];
    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      sent.push({
        method: String(init?.method),
        url: input instanceof Request ? input.url : String(input),
        body: typeof init?.body === "string" ? init.body : "",
      });
      return new Response(
        JSON.stringify({ candidates: [{ content: { parts: [{ text: "answer" }] } }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch;
  });

  afterEach(() => {
    ssrfMock?.mockRestore();
    ssrfMock = undefined;
    global.fetch = priorFetch;
    vi.unstubAllEnvs();
  });

  it("is enumerable on the tool definition and declares the grounded POST", async () => {
    const { tool, declare } = createTool();
    expect(Object.getOwnPropertyDescriptor(tool, TOOL_OBSERVATION)?.enumerable).toBe(true);
    expect(await declare({ query: "enclawed" })).toEqual({
      type: "http",
      method: "POST",
      url: URL_FLASH,
      body: bodyFor("enclawed"),
      read: true,
      client: "web_search:gemini",
    });
  });

  it("gives the same observation for calls that differ only off the wire", async () => {
    const { declare } = createTool();
    const base = await declare({ query: "same" });
    // count only shapes the local cache key; the query is trimmed before sending.
    expect(await declare({ query: "same", count: 9 })).toEqual(base);
    expect(await declare({ query: "  same \n" })).toEqual(base);
    expect(await declare({ query: "same", extra: true })).toEqual(base);
    expect(JSON.stringify(base)).not.toContain("AIza-test");
  });

  it("changes with every parameter and config value that reaches the wire", async () => {
    const { declare } = createTool();
    const base = await declare({ query: "q" });
    expect(await declare({ query: "q2" })).not.toEqual(base);
    const pro = createTool({ gemini: { apiKey: "AIza-test", model: " gemini-2.5-pro " } });
    expect(await pro.declare({ query: "q" })).toEqual({
      ...(base as object),
      url: URL_FLASH.replace("gemini-2.5-flash", "gemini-2.5-pro"),
    });
  });

  it("equals the request execute sends, also when the result cache answers", async () => {
    const { tool, declare } = createTool();
    const args = { query: "gemini wire check" };
    await tool.execute(args);
    const declared = (await declare(args)) as Sent;
    expect(sent).toEqual([{ method: declared.method, url: declared.url, body: declared.body }]);
    sent = [];
    await tool.execute(args);
    expect(sent).toEqual([]);
    expect(await declare(args)).toEqual(declared);
  });

  it("sends only response-named citation HEADs after the declared request", async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      sent.push({
        method: String(init?.method),
        url: input instanceof Request ? input.url : String(input),
        body: typeof init?.body === "string" ? init.body : "",
      });
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: { parts: [{ text: "answer" }] },
              groundingMetadata: { groundingChunks: [{ web: { uri: "https://cite.test/r/1" } }] },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch;
    const { tool, declare } = createTool();
    const args = { query: "gemini citation follow-up" };
    await tool.execute(args);
    const declared = (await declare(args)) as Sent;
    expect(sent.map((r) => [r.method, r.url])).toEqual([
      ["POST", declared.url],
      ["HEAD", "https://cite.test/r/1"],
    ]);
  });

  it("is null when execute answers without sending, and throws on invalid args", async () => {
    const { tool, declare } = createTool();
    expect(await tool.execute({ query: "q", country: "US" })).toMatchObject({
      error: "unsupported_country",
    });
    expect(await declare({ query: "q", country: "US" })).toBeNull();
    const keyless = createTool({});
    expect(await keyless.tool.execute({ query: "q" })).toMatchObject({
      error: "missing_gemini_api_key",
    });
    expect(await keyless.declare({ query: "q" })).toBeNull();
    await expect(tool.execute({ query: "  " })).rejects.toThrow(/query required/);
    await expect(declare({ query: "  " })).rejects.toThrow(/query required/);
    expect(sent).toEqual([]);
  });
});
