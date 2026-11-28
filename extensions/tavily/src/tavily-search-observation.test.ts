import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTavilyWebSearchProvider } from "./tavily-search-provider.js";

const TOOL_OBSERVATION = Symbol.for("enclawed.tool-observation");

type Observe = (args: Record<string, unknown>) => Promise<unknown>;
type Sent = { method: string; url: string; body?: string };

function createTool(webSearch: Record<string, unknown> = { apiKey: "tvly-test-key" }) {
  const tool = createTavilyWebSearchProvider().createTool({
    config: { plugins: { entries: { tavily: { config: { webSearch } } } } },
  });
  if (!tool) {
    throw new Error("Expected tool definition");
  }
  return tool;
}

function observerOf(tool: unknown): Observe {
  const descriptor = Object.getOwnPropertyDescriptor(tool, TOOL_OBSERVATION);
  if (!descriptor?.enumerable || typeof descriptor.value !== "function") {
    throw new Error("Expected an enumerable declared observation");
  }
  return descriptor.value as Observe;
}

// Captures every request the provider sends, answering with no results.
function captureFetch(): Sent[] {
  const sent: Sent[] = [];
  global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    sent.push({
      method: init?.method ?? "GET",
      url: input instanceof Request ? input.url : input instanceof URL ? input.href : input,
      ...(typeof init?.body === "string" ? { body: init.body } : {}),
    });
    return new Response(JSON.stringify({ results: [] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof global.fetch;
  return sent;
}

describe("tavily web_search declared observation", () => {
  const priorFetch = global.fetch;

  beforeEach(() => {
    vi.stubEnv("TAVILY_API_KEY", "");
    vi.stubEnv("TAVILY_BASE_URL", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    global.fetch = priorFetch;
  });

  it("declares a POST read of the search endpoint without the API key", async () => {
    const observation = await observerOf(createTool())({ query: "weather sf", count: 7 });
    expect(observation).toEqual({
      type: "http",
      method: "POST",
      url: "https://api.tavily.com/search",
      body: '{"query":"weather sf","max_results":7}',
      read: true,
      client: "web_search:tavily",
    });
    expect(JSON.stringify(observation)).not.toContain("tvly-test-key");
  });

  it("gives the same observation to calls that differ only in what never leaves", async () => {
    const observe = observerOf(createTool());
    // count defaults to 5, is floored and clamped to 1..20 before it is sent.
    expect(await observe({ query: "q" })).toEqual(await observe({ query: "q", count: 5 }));
    expect(await observe({ query: "q", count: 7.9 })).toEqual(
      await observe({ query: "q", count: 7 }),
    );
    expect(await observe({ query: "q", count: 99 })).toEqual(
      await observe({ query: "q", count: 20 }),
    );
    // A non-number count is not read.
    expect(await observe({ query: "q", count: "9" })).toEqual(await observe({ query: "q" }));
  });

  it("changes the observation with every parameter that reaches the wire", async () => {
    const observe = observerOf(createTool());
    const base = { query: "weather sf" };
    const variants: Array<Record<string, unknown>> = [
      { query: "weather nyc" },
      // web_search sends the query untrimmed.
      { query: " weather sf" },
      { count: 3 },
    ];
    const bodies = new Set<string>();
    bodies.add(((await observe(base)) as Sent).body ?? "");
    for (const variant of variants) {
      bodies.add(((await observe({ ...base, ...variant })) as Sent).body ?? "");
    }
    expect(bodies.size).toBe(variants.length + 1);
    // The configured base URL is the destination.
    expect(
      await observerOf(createTool({ apiKey: "k", baseUrl: "https://proxy.example/tavily/" }))(base),
    ).toEqual(expect.objectContaining({ url: "https://proxy.example/tavily/search" }));
  });

  it("declares exactly the request execute sends", async () => {
    const cases: Array<Record<string, unknown>> = [
      { query: "tavily observation one", count: 12 },
      { query: "tavily observation two" },
    ];
    for (const args of cases) {
      const sent = captureFetch();
      const tool = createTool();
      const declared = await observerOf(tool)(args);
      await tool.execute(args);
      expect(sent).toHaveLength(1);
      expect(declared).toEqual({
        type: "http",
        ...sent[0],
        read: true,
        client: "web_search:tavily",
      });
      // The result cache now answers; the declaration still names the request.
      await tool.execute(args);
      expect(sent).toHaveLength(1);
      expect(await observerOf(tool)(args)).toEqual(declared);
    }
  });

  it("throws when execute fails before sending", async () => {
    const sent = captureFetch();
    const keyless = createTool({});
    await expect(observerOf(keyless)({ query: "q" })).rejects.toThrow(/Tavily API key/);
    await expect(keyless.execute({ query: "q" })).rejects.toThrow(/Tavily API key/);
    expect(sent).toHaveLength(0);
  });
});
