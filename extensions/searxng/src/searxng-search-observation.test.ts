import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSearxngWebSearchProvider } from "./searxng-search-provider.js";

const TOOL_OBSERVATION = Symbol.for("enclawed.tool-observation");
// An IP literal on loopback: the plain-http private-network check needs no DNS.
const BASE_URL = "http://127.0.0.1:8080";

type Observe = (args: Record<string, unknown>) => Promise<unknown>;
type Sent = { method: string; url: string; body?: string };

function createTool(webSearch: Record<string, unknown> = { baseUrl: BASE_URL }) {
  const tool = createSearxngWebSearchProvider().createTool({
    config: { plugins: { entries: { searxng: { config: { webSearch } } } } },
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

describe("searxng web_search declared observation", () => {
  const priorFetch = global.fetch;

  beforeEach(() => {
    vi.stubEnv("SEARXNG_BASE_URL", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    global.fetch = priorFetch;
  });

  it("declares a GET to the instance's search endpoint", async () => {
    expect(await observerOf(createTool())({ query: "enclawed" })).toEqual({
      type: "http",
      method: "GET",
      url: "http://127.0.0.1:8080/search?q=enclawed&format=json",
      client: "web_search:searxng",
    });
  });

  it("gives the same observation to calls that differ only in what never leaves", async () => {
    const observe = observerOf(createTool());
    const base = await observe({ query: "enclawed" });
    // count only cuts the parsed results; the query is trimmed.
    expect(await observe({ query: " enclawed ", count: 9 })).toEqual(base);
    // Arguments equal to the configured defaults send the same request.
    const configured = observerOf(
      createTool({ baseUrl: `${BASE_URL}/`, categories: "news", language: "de" }),
    );
    expect(await configured({ query: "q" })).toEqual(
      await configured({ query: "q", categories: "news", language: "de" }),
    );
  });

  it("changes the observation with every parameter that reaches the wire", async () => {
    const observe = observerOf(createTool());
    const base = { query: "enclawed" };
    const variants: Array<Record<string, unknown>> = [
      { query: "other" },
      { categories: "science" },
      { language: "fr" },
    ];
    const urls = new Set<string>();
    urls.add(((await observe(base)) as Sent).url);
    for (const variant of variants) {
      urls.add(((await observe({ ...base, ...variant })) as Sent).url);
    }
    expect(urls.size).toBe(variants.length + 1);
    // The configured instance is the destination.
    expect(await observerOf(createTool({ baseUrl: "http://127.0.0.1:9090/sx" }))(base)).toEqual(
      expect.objectContaining({ url: "http://127.0.0.1:9090/sx/search?q=enclawed&format=json" }),
    );
  });

  it("declares exactly the request execute sends", async () => {
    const cases: Array<Record<string, unknown>> = [
      { query: "searxng observation one", count: 2 },
      { query: "searxng observation two", categories: "news", language: "en" },
    ];
    for (const args of cases) {
      const sent = captureFetch();
      const tool = createTool({ baseUrl: BASE_URL, categories: "general" });
      const declared = await observerOf(tool)(args);
      await tool.execute(args);
      expect(sent).toHaveLength(1);
      expect(declared).toMatchObject(sent[0] as Sent);
      expect((declared as Sent).body).toBeUndefined();
      // The result cache now answers; the declaration still names the request.
      await tool.execute(args);
      expect(sent).toHaveLength(1);
      expect(await observerOf(tool)(args)).toEqual(declared);
    }
  });

  it("throws when execute fails before sending", async () => {
    const sent = captureFetch();
    const failures: Array<{ tool: ReturnType<typeof createTool>; args: Record<string, unknown> }> =
      [
        { tool: createTool(), args: {} },
        { tool: createTool({}), args: { query: "q" } },
        { tool: createTool({ baseUrl: "ftp://127.0.0.1" }), args: { query: "q" } },
        { tool: createTool({ baseUrl: "http://8.8.8.8" }), args: { query: "q" } },
      ];
    for (const { tool, args } of failures) {
      await expect(observerOf(tool)(args)).rejects.toThrow();
      await expect(tool.execute(args)).rejects.toThrow();
    }
    expect(sent).toHaveLength(0);
  });
});
