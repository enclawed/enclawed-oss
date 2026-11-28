import { afterEach, describe, expect, it, vi } from "vitest";
import { createDuckDuckGoWebSearchProvider } from "./ddg-search-provider.js";

const TOOL_OBSERVATION = Symbol.for("enclawed.tool-observation");

type Observe = (args: Record<string, unknown>) => Promise<unknown>;
type Sent = { method: string; url: string; body?: string };

function createTool(webSearch?: Record<string, unknown>) {
  const tool = createDuckDuckGoWebSearchProvider().createTool({
    config: webSearch ? { plugins: { entries: { duckduckgo: { config: { webSearch } } } } } : {},
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

// Captures every request the provider sends, answering with an empty result page.
function captureFetch(): Sent[] {
  const sent: Sent[] = [];
  global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    sent.push({
      method: init?.method ?? "GET",
      url: input instanceof Request ? input.url : input instanceof URL ? input.href : input,
      ...(typeof init?.body === "string" ? { body: init.body } : {}),
    });
    return new Response("<html><body>no results</body></html>", {
      status: 200,
      headers: { "content-type": "text/html" },
    });
  }) as typeof global.fetch;
  return sent;
}

describe("duckduckgo web_search declared observation", () => {
  const priorFetch = global.fetch;

  afterEach(() => {
    global.fetch = priorFetch;
  });

  it("declares a GET to the HTML endpoint", async () => {
    expect(await observerOf(createTool())({ query: "enclawed docs" })).toEqual({
      type: "http",
      method: "GET",
      url: "https://html.duckduckgo.com/html?q=enclawed+docs&kp=-1",
      client: "web_search:duckduckgo",
    });
  });

  it("gives the same observation to calls that differ only in what never leaves", async () => {
    const observe = observerOf(createTool());
    const base = await observe({ query: "enclawed docs" });
    // count only cuts the parsed results; the query is trimmed; moderate is
    // the default SafeSearch, and an unknown level falls back to it.
    expect(await observe({ query: " enclawed docs ", count: 9 })).toEqual(base);
    expect(await observe({ query: "enclawed docs", safeSearch: "moderate" })).toEqual(base);
    expect(await observe({ query: "enclawed docs", safeSearch: "bogus" })).toEqual(base);
    // A region argument equal to the configured one sends the same request.
    const configured = observerOf(createTool({ region: "de-de", safeSearch: "strict" }));
    expect(await configured({ query: "q" })).toEqual(
      await configured({ query: "q", region: "de-de", safeSearch: "strict" }),
    );
  });

  it("changes the observation with every parameter that reaches the wire", async () => {
    const observe = observerOf(createTool());
    const base = { query: "enclawed docs" };
    const variants: Array<Record<string, unknown>> = [
      { query: "other docs" },
      { region: "uk-en" },
      { safeSearch: "strict" },
      { safeSearch: "off" },
    ];
    const urls = new Set<string>();
    urls.add(((await observe(base)) as Sent).url);
    for (const variant of variants) {
      urls.add(((await observe({ ...base, ...variant })) as Sent).url);
    }
    expect(urls.size).toBe(variants.length + 1);
    // Config that reaches the wire changes it too.
    expect(await observerOf(createTool({ region: "fr-fr" }))(base)).not.toEqual(
      await observe(base),
    );
  });

  it("declares exactly the request execute sends", async () => {
    const cases: Array<Record<string, unknown>> = [
      { query: "ddg observation one", count: 3 },
      { query: "ddg observation two", region: "us-en", safeSearch: "off" },
    ];
    for (const args of cases) {
      const sent = captureFetch();
      const tool = createTool({ safeSearch: "strict" });
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
    const tool = createTool();
    await expect(observerOf(tool)({})).rejects.toThrow(/query required/);
    await expect(tool.execute({})).rejects.toThrow(/query required/);
  });
});
