import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBraveWebSearchProvider } from "./brave-web-search-provider.js";

const TOOL_OBSERVATION = Symbol.for("enclawed.tool-observation");

type Observe = (args: Record<string, unknown>) => Promise<unknown>;
type Sent = { method: string; url: string; body?: string };

function createTool(mode: "web" | "llm-context" = "web") {
  const tool = createBraveWebSearchProvider().createTool({
    config: {},
    searchConfig: { apiKey: "BSA-test-key", brave: { mode } },
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

// Captures every request the provider sends, answering with `responseBody`.
function captureFetch(responseBody: unknown): Sent[] {
  const sent: Sent[] = [];
  global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    sent.push({
      method: init?.method ?? "GET",
      url: input instanceof Request ? input.url : input instanceof URL ? input.href : input,
      ...(typeof init?.body === "string" ? { body: init.body } : {}),
    });
    return new Response(JSON.stringify(responseBody), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof global.fetch;
  return sent;
}

describe("brave web_search declared observation", () => {
  const priorFetch = global.fetch;

  beforeEach(() => {
    vi.stubEnv("BRAVE_API_KEY", "");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    global.fetch = priorFetch;
  });

  it("declares a GET to the web search endpoint without the API key", async () => {
    const observation = await observerOf(createTool())({ query: "gpu news", count: 3 });
    expect(observation).toEqual({
      type: "http",
      method: "GET",
      url: "https://api.search.brave.com/res/v1/web/search?q=gpu+news&count=3",
      client: "web_search:brave",
    });
    expect(JSON.stringify(observation)).not.toContain("BSA-test-key");
  });

  it("gives the same observation to calls that differ only in what never leaves", async () => {
    const observe = observerOf(createTool());
    const base = await observe({ query: "gpu news", search_lang: "en", country: "VN" });
    // Trimmed query, language shadowed by search_lang, unsupported countries
    // both sent as ALL.
    expect(
      await observe({ query: "  gpu news ", search_lang: "en", language: "de", country: "XX" }),
    ).toEqual(base);
    // count defaults to 5 and is clamped to 10 before it is sent.
    expect(await observe({ query: "q" })).toEqual(await observe({ query: "q", count: 5 }));
    expect(await observe({ query: "q", count: 50 })).toEqual(
      await observe({ query: "q", count: 10 }),
    );

    const llm = observerOf(createTool("llm-context"));
    // llm-context sends no count.
    expect(await llm({ query: "q", count: 2 })).toEqual(await llm({ query: "q", count: 9 }));
  });

  it("changes the observation with every parameter that reaches the wire (web)", async () => {
    const observe = observerOf(createTool());
    const base = { query: "gpu news" };
    const variants: Array<Record<string, unknown>> = [
      { query: "cpu news" },
      { count: 7 },
      { country: "DE" },
      { search_lang: "de" },
      { language: "fr" },
      { ui_lang: "de-DE" },
      { freshness: "week" },
      { date_after: "2026-01-01" },
      { date_before: "2026-02-01" },
      { date_after: "2026-01-01", date_before: "2026-02-01" },
    ];
    const urls = new Set<string>();
    urls.add(((await observe(base)) as Sent).url);
    for (const variant of variants) {
      urls.add(((await observe({ ...base, ...variant })) as Sent).url);
    }
    expect(urls.size).toBe(variants.length + 1);
  });

  it("changes the observation with every parameter that reaches the wire (llm-context)", async () => {
    const observe = observerOf(createTool("llm-context"));
    const base = { query: "gpu news" };
    const variants: Array<Record<string, unknown>> = [
      { query: "cpu news" },
      { country: "DE" },
      { search_lang: "de" },
    ];
    const urls = new Set<string>();
    urls.add(((await observe(base)) as Sent).url);
    for (const variant of variants) {
      urls.add(((await observe({ ...base, ...variant })) as Sent).url);
    }
    expect(urls.size).toBe(variants.length + 1);
    expect(((await observe(base)) as Sent).url).toBe(
      "https://api.search.brave.com/res/v1/llm/context?q=gpu+news",
    );
  });

  it("keys an open-ended date range on its open end, not on today's date", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-03-15T12:00:00Z"));
    const observe = observerOf(createTool());
    const after = (await observe({ query: "q", date_after: "2026-03-01" })) as Sent;
    expect(new URL(after.url).searchParams.get("freshness")).toBe("2026-03-01to<today>");
    // The same call after midnight is the same observation, so a sender
    // cannot re-send a repeat by waiting for the date to change.
    vi.setSystemTime(new Date("2026-03-16T00:30:00Z"));
    expect(await observe({ query: "q", date_after: "2026-03-01" })).toEqual(after);
    const before = (await observe({ query: "q", date_before: "2026-03-01" })) as Sent;
    expect(new URL(before.url).searchParams.get("freshness")).toBe("1970-01-01to2026-03-01");
  });

  it("declares exactly the request execute sends, in both modes", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-03-15T12:00:00Z"));
    const cases: Array<{ mode: "web" | "llm-context"; args: Record<string, unknown> }> = [
      {
        mode: "web",
        args: {
          query: "observation web case",
          count: 4,
          country: "de",
          search_lang: "en-US",
          ui_lang: "ja",
          date_after: "2026-03-01",
        },
      },
      { mode: "web", args: { query: "observation web freshness", freshness: "month" } },
      {
        mode: "llm-context",
        args: { query: "observation llm case", country: "FR", language: "fr", count: 3 },
      },
    ];
    for (const { mode, args } of cases) {
      const sent = captureFetch(
        mode === "web" ? { web: { results: [] } } : { grounding: { generic: [] } },
      );
      const tool = createTool(mode);
      const declared = await observerOf(tool)(args);
      await tool.execute(args);
      expect(sent).toHaveLength(1);
      // The wire carries today's date where the range is open; the
      // declaration keeps the open end (see the test above).
      const wire = new URL((sent[0] as Sent).url);
      if (typeof args.date_after === "string" && args.date_before === undefined) {
        expect(wire.searchParams.get("freshness")).toBe(`${args.date_after}to2026-03-15`);
        wire.searchParams.set("freshness", `${args.date_after}to<today>`);
      }
      expect(declared).toMatchObject({ ...(sent[0] as Sent), url: wire.href });
      expect((declared as Sent).body).toBeUndefined();
      // The provider's result cache now answers; the declaration still names
      // the request (the key must not depend on cache state).
      await tool.execute(args);
      expect(sent).toHaveLength(1);
      expect(await observerOf(tool)(args)).toEqual(declared);
    }
  });

  it("returns null when execute answers without sending", async () => {
    const sent = captureFetch({ web: { results: [] } });
    const keyless = createBraveWebSearchProvider().createTool({ config: {}, searchConfig: {} });
    if (!keyless) {
      throw new Error("Expected tool definition");
    }
    expect(await observerOf(keyless)({ query: "q" })).toBeNull();
    expect(await keyless.execute({ query: "q" })).toMatchObject({
      error: "missing_brave_api_key",
    });

    const web = observerOf(createTool());
    const llm = observerOf(createTool("llm-context"));
    expect(await web({ query: "q", freshness: "fortnight" })).toBeNull();
    expect(await web({ query: "q", search_lang: "xx" })).toBeNull();
    expect(await web({ query: "q", ui_lang: "en" })).toBeNull();
    expect(await web({ query: "q", freshness: "day", date_after: "2026-01-01" })).toBeNull();
    expect(
      await web({ query: "q", date_after: "2026-03-20", date_before: "2026-03-01" }),
    ).toBeNull();
    expect(await llm({ query: "q", ui_lang: "en-US" })).toBeNull();
    expect(await llm({ query: "q", freshness: "day" })).toBeNull();
    expect(await llm({ query: "q", date_after: "2026-01-01" })).toBeNull();
    expect(sent).toHaveLength(0);
  });

  it("throws when execute fails before sending", async () => {
    const tool = createTool();
    await expect(observerOf(tool)({})).rejects.toThrow(/query required/);
    await expect(observerOf(tool)({ query: "   " })).rejects.toThrow(/query required/);
    await expect(tool.execute({})).rejects.toThrow(/query required/);
  });
});
