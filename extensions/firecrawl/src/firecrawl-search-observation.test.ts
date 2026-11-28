import type { EnclawedConfig } from "@enclawed/plugin-sdk/config-types";
import { mockPinnedHostnameResolution } from "@enclawed/plugin-sdk/test-env";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFirecrawlWebSearchProvider } from "./firecrawl-search-provider.js";

const TOOL_OBSERVATION = Symbol.for("enclawed.tool-observation");

type Sent = { method: string; url: string; body: string };
type Declare = (args: Record<string, unknown>) => Promise<unknown>;

const CONFIG = {
  plugins: { entries: { firecrawl: { config: { webSearch: { apiKey: "fc-test-key" } } } } },
} as unknown as EnclawedConfig;

function createTool(config: EnclawedConfig = CONFIG) {
  const tool = createFirecrawlWebSearchProvider().createTool({ config } as never);
  if (!tool) {
    throw new Error("Expected tool definition");
  }
  const declare = (tool as unknown as Record<symbol, unknown>)[TOOL_OBSERVATION];
  if (typeof declare !== "function") {
    throw new Error("Expected a declared observation");
  }
  return { tool, declare: declare as Declare };
}

describe("firecrawl web_search observation", () => {
  const priorFetch = global.fetch;
  let ssrfMock: { mockRestore: () => void } | undefined;
  let sent: Sent[];

  beforeEach(() => {
    vi.stubEnv("FIRECRAWL_API_KEY", "");
    vi.stubEnv("FIRECRAWL_BASE_URL", "");
    ssrfMock = mockPinnedHostnameResolution();
    sent = [];
    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      sent.push({
        method: String(init?.method),
        url: input instanceof Request ? input.url : String(input),
        body: typeof init?.body === "string" ? init.body : "",
      });
      return new Response(JSON.stringify({ success: true, data: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;
  });

  afterEach(() => {
    ssrfMock?.mockRestore();
    ssrfMock = undefined;
    global.fetch = priorFetch;
    vi.unstubAllEnvs();
  });

  it("is enumerable on the tool definition and declares the POST it sends", async () => {
    const { tool, declare } = createTool();
    expect(Object.getOwnPropertySymbols(tool)).toContain(TOOL_OBSERVATION);
    expect(Object.getOwnPropertyDescriptor(tool, TOOL_OBSERVATION)?.enumerable).toBe(true);
    expect(await declare({ query: "enclawed docs", count: 3 })).toEqual({
      type: "http",
      method: "POST",
      url: "https://api.firecrawl.dev/v2/search",
      body: JSON.stringify({ query: "enclawed docs", limit: 3 }),
      read: true,
      client: "web_search:firecrawl",
    });
  });

  it("gives the same observation for calls that differ only off the wire", async () => {
    const { declare } = createTool();
    const base = await declare({ query: "same", count: 4 });
    // Unknown args never leave; a fractional count is floored before sending.
    expect(await declare({ query: "same", count: 4, ignored: "x" })).toEqual(base);
    expect(await declare({ query: "same", count: 4.7 })).toEqual(base);
    // Out-of-range counts are clamped, a non-number count is the default.
    expect(await declare({ query: "same", count: 50 })).toEqual(
      await declare({ query: "same", count: 10 }),
    );
    expect(await declare({ query: "same", count: "7" })).toEqual(await declare({ query: "same" }));
    // The API key never appears in the observation.
    expect(JSON.stringify(base)).not.toContain("fc-test-key");
  });

  it("changes with every parameter that reaches the wire", async () => {
    const { declare } = createTool();
    const base = await declare({ query: "q", count: 3 });
    expect(await declare({ query: "q2", count: 3 })).not.toEqual(base);
    expect(await declare({ query: "q", count: 4 })).not.toEqual(base);
  });

  it("equals the request execute sends, also when the result cache answers", async () => {
    const { tool, declare } = createTool();
    for (const args of [{ query: "wire check one", count: 2 }, { query: "wire check two" }]) {
      sent = [];
      await tool.execute(args);
      const declared = (await declare(args)) as Sent;
      expect(sent).toEqual([{ method: declared.method, url: declared.url, body: declared.body }]);
      // A cached second call sends nothing but declares the same request.
      sent = [];
      await tool.execute(args);
      expect(sent).toEqual([]);
      expect(await declare(args)).toEqual(declared);
    }
  });

  it("throws where execute fails before sending", async () => {
    const { tool, declare } = createTool({} as EnclawedConfig);
    await expect(tool.execute({ query: "x" })).rejects.toThrow(/API key/);
    await expect(declare({ query: "x" })).rejects.toThrow(/API key/);
    const badHost = {
      plugins: {
        entries: {
          firecrawl: {
            config: { webSearch: { apiKey: "fc-test-key", baseUrl: "https://evil.example" } },
          },
        },
      },
    } as unknown as EnclawedConfig;
    const bad = createTool(badHost);
    await expect(bad.tool.execute({ query: "x" })).rejects.toThrow(/not allowed/);
    await expect(bad.declare({ query: "x" })).rejects.toThrow(/not allowed/);
    expect(sent).toEqual([]);
  });
});
