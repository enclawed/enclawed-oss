import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createExaWebSearchProvider } from "./exa-web-search-provider.js";

const TOOL_OBSERVATION = Symbol.for("enclawed.tool-observation");

type Observe = (args: Record<string, unknown>) => Promise<unknown>;
type Sent = { method: string; url: string; body?: string };

function createTool() {
  const tool = createExaWebSearchProvider().createTool({
    config: {
      plugins: { entries: { exa: { config: { webSearch: { apiKey: "exa-test-key" } } } } },
    },
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

function sentBody(observation: unknown): Record<string, unknown> {
  return JSON.parse((observation as Sent).body ?? "null") as Record<string, unknown>;
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

describe("exa web_search declared observation", () => {
  const priorFetch = global.fetch;

  beforeEach(() => {
    vi.stubEnv("EXA_API_KEY", "");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    global.fetch = priorFetch;
  });

  it("declares a POST read of the search endpoint without the API key", async () => {
    const observation = await observerOf(createTool())({ query: "exa docs" });
    expect(observation).toEqual({
      type: "http",
      method: "POST",
      url: "https://api.exa.ai/search",
      body: '{"query":"exa docs","numResults":5,"type":"auto","contents":{"highlights":true}}',
      read: true,
      client: "web_search:exa",
    });
    expect(JSON.stringify(observation)).not.toContain("exa-test-key");
  });

  it("gives the same observation to calls that differ only in what never leaves", async () => {
    const observe = observerOf(createTool());
    const base = await observe({ query: "exa docs" });
    // Trimmed query; type and count defaults; unknown type sent as auto; an
    // empty contents object sends the default highlights.
    expect(await observe({ query: " exa docs " })).toEqual(base);
    expect(await observe({ query: "exa docs", type: "auto", count: 5 })).toEqual(base);
    expect(await observe({ query: "exa docs", type: "bogus" })).toEqual(base);
    expect(await observe({ query: "exa docs", contents: {} })).toEqual(base);
    expect(await observe({ query: "q", count: 500 })).toEqual(
      await observe({ query: "q", count: 100 }),
    );
  });

  it("changes the observation with every parameter that reaches the wire", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-03-15T12:00:00Z"));
    const observe = observerOf(createTool());
    const base = { query: "exa docs" };
    const variants: Array<Record<string, unknown>> = [
      { query: "other docs" },
      { count: 9 },
      { type: "neural" },
      { freshness: "week" },
      { freshness: "year" },
      { date_after: "2026-01-01" },
      { date_before: "2026-02-01" },
      { contents: { text: true } },
      { contents: { text: { maxCharacters: 500 } } },
      { contents: { highlights: { numSentences: 2 } } },
      { contents: { summary: { query: "key points" } } },
    ];
    const bodies = new Set<string>();
    bodies.add(((await observe(base)) as Sent).body ?? "");
    for (const variant of variants) {
      bodies.add(((await observe({ ...base, ...variant })) as Sent).body ?? "");
    }
    expect(bodies.size).toBe(variants.length + 1);
    // A freshness window is sent as a start date computed from the clock; the
    // key keeps the window itself, so a repeat cannot be re-sent by waiting.
    expect(sentBody(await observe({ ...base, freshness: "week" })).startPublishedDate).toBe(
      "now-week",
    );
  });

  it("declares exactly the request execute sends", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-03-15T12:00:00Z"));
    const cases: Array<Record<string, unknown>> = [
      { query: "exa observation one", count: 12, type: "fast", freshness: "month" },
      {
        query: "exa observation two",
        date_after: "2026-01-01",
        date_before: "2026-02-01",
        contents: { highlights: { maxCharacters: 300, query: "x" }, summary: true },
      },
    ];
    for (const args of cases) {
      const sent = captureFetch();
      const tool = createTool();
      const declared = await observerOf(tool)(args);
      await tool.execute(args);
      expect(sent).toHaveLength(1);
      const wire = sent[0] as { body: string };
      const body = JSON.parse(wire.body) as Record<string, unknown>;
      if (typeof args.freshness === "string") {
        expect(body.startPublishedDate).toBe("2026-02-15T12:00:00.000Z");
        body.startPublishedDate = `now-${args.freshness}`;
      }
      expect(declared).toEqual({
        type: "http",
        ...sent[0],
        body: JSON.stringify(body),
        read: true,
        client: "web_search:exa",
      });
      // The result cache now answers; the declaration still names the request.
      await tool.execute(args);
      expect(sent).toHaveLength(1);
      expect(await observerOf(tool)(args)).toEqual(declared);
    }
  });

  it("returns null when execute answers without sending", async () => {
    const sent = captureFetch();
    const keyless = createExaWebSearchProvider().createTool({ config: {}, searchConfig: {} });
    if (!keyless) {
      throw new Error("Expected tool definition");
    }
    expect(await observerOf(keyless)({ query: "q" })).toBeNull();
    expect(await keyless.execute({ query: "q" })).toMatchObject({ error: "missing_exa_api_key" });

    const observe = observerOf(createTool());
    expect(await observe({ query: "q", freshness: "fortnight" })).toBeNull();
    expect(await observe({ query: "q", freshness: "day", date_after: "2026-01-01" })).toBeNull();
    expect(await observe({ query: "q", date_after: "2026-13-01" })).toBeNull();
    expect(await observe({ query: "q", contents: { video: true } })).toBeNull();
    expect(await observe({ query: "q", contents: { text: { maxCharacters: -1 } } })).toBeNull();
    expect(sent).toHaveLength(0);
  });

  it("throws when execute fails before sending", async () => {
    const tool = createTool();
    await expect(observerOf(tool)({})).rejects.toThrow(/query required/);
    await expect(tool.execute({})).rejects.toThrow(/query required/);
  });
});
