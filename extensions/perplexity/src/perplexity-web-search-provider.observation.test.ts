import type { EnclawedConfig } from "@enclawed/plugin-sdk/config-types";
import { mockPinnedHostnameResolution } from "@enclawed/plugin-sdk/test-env";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPerplexityWebSearchProvider } from "./perplexity-web-search-provider.js";

const TOOL_OBSERVATION = Symbol.for("enclawed.tool-observation");

type Sent = { method: string; url: string; body: string };
type Declare = (args: Record<string, unknown>) => Promise<unknown>;

// Search API transport: a direct pplx- key, no baseUrl/model override.
const DIRECT = { perplexity: { apiKey: "pplx-test-key" } };
// Chat completions transport: an OpenRouter key.
const OPENROUTER = { perplexity: { apiKey: "sk-or-v1-test-key" } };

function createTool(searchConfig: Record<string, unknown>) {
  const tool = createPerplexityWebSearchProvider().createTool({
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

describe("perplexity web_search observation", () => {
  const priorFetch = global.fetch;
  let ssrfMock: { mockRestore: () => void } | undefined;
  let sent: Sent[];

  beforeEach(() => {
    vi.stubEnv("PERPLEXITY_API_KEY", "");
    vi.stubEnv("OPENROUTER_API_KEY", "");
    ssrfMock = mockPinnedHostnameResolution();
    sent = [];
    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      sent.push({
        method: String(init?.method),
        url: input instanceof Request ? input.url : String(input),
        body: typeof init?.body === "string" ? init.body : "",
      });
      return new Response(
        JSON.stringify({ results: [], choices: [{ message: { content: "ok" } }] }),
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

  it("declares the Search API POST with every filter folded into the body", async () => {
    const { tool, declare } = createTool(DIRECT);
    expect(Object.getOwnPropertyDescriptor(tool, TOOL_OBSERVATION)?.enumerable).toBe(true);
    expect(
      await declare({
        query: " enclawed ",
        count: 3,
        country: "US",
        language: "en",
        date_after: "2025-01-02",
        date_before: "2025-03-04",
        domain_filter: ["a.test"],
        max_tokens: 100,
        max_tokens_per_page: 10,
      }),
    ).toEqual({
      type: "http",
      method: "POST",
      url: "https://api.perplexity.ai/search",
      body: JSON.stringify({
        query: "enclawed",
        max_results: 3,
        country: "US",
        search_domain_filter: ["a.test"],
        search_language_filter: ["en"],
        search_after_date: "1/2/2025",
        search_before_date: "3/4/2025",
        max_tokens: 100,
        max_tokens_per_page: 10,
      }),
      read: true,
      client: "web_search:perplexity",
    });
  });

  it("declares the chat completions POST on the OpenRouter transport", async () => {
    const { declare } = createTool(OPENROUTER);
    expect(await declare({ query: "q", freshness: "week" })).toEqual({
      type: "http",
      method: "POST",
      url: "https://openrouter.ai/api/v1/chat/completions",
      body: JSON.stringify({
        model: "perplexity/sonar-pro",
        messages: [{ role: "user", content: "q" }],
        search_recency_filter: "week",
      }),
      read: true,
      client: "web_search:perplexity",
    });
  });

  it("gives the same observation for calls that differ only off the wire", async () => {
    const direct = createTool(DIRECT);
    const base = await direct.declare({ query: "same", count: 4 });
    expect(await direct.declare({ query: "  same  ", count: 4.9, other: 1 })).toEqual(base);
    expect(await direct.declare({ query: "same", count: 40 })).toEqual(
      await direct.declare({ query: "same", count: 10 }),
    );
    expect(JSON.stringify(base)).not.toContain("pplx-test-key");
    // The chat transport sends no count at all.
    const chat = createTool(OPENROUTER);
    expect(await chat.declare({ query: "same", count: 2 })).toEqual(
      await chat.declare({ query: "same", count: 9 }),
    );
    expect(JSON.stringify(await chat.declare({ query: "same" }))).not.toContain("sk-or-v1");
  });

  it("changes with every parameter that reaches the wire", async () => {
    const { declare } = createTool(DIRECT);
    const base = await declare({ query: "q" });
    for (const extra of [
      { query: "q2" },
      { count: 7 },
      { freshness: "day" },
      { country: "DE" },
      { language: "fr" },
      { date_after: "2025-01-01" },
      { date_before: "2025-01-01" },
      { domain_filter: ["b.test"] },
      { max_tokens: 5 },
      { max_tokens_per_page: 5 },
    ]) {
      expect(await declare({ query: "q", ...extra }), JSON.stringify(extra)).not.toEqual(base);
    }
    const chat = createTool(OPENROUTER);
    const chatBase = await chat.declare({ query: "q" });
    expect(await chat.declare({ query: "q2" })).not.toEqual(chatBase);
    expect(await chat.declare({ query: "q", freshness: "month" })).not.toEqual(chatBase);
  });

  it("equals the request execute sends on both transports, also when cached", async () => {
    for (const [config, args] of [
      [DIRECT, { query: "pplx wire direct", count: 2, freshness: "year" }],
      [OPENROUTER, { query: "pplx wire chat", freshness: "day" }],
    ] as const) {
      const { tool, declare } = createTool(config);
      sent = [];
      await tool.execute(args);
      const declared = (await declare(args)) as Sent;
      expect(sent).toEqual([{ method: declared.method, url: declared.url, body: declared.body }]);
      sent = [];
      await tool.execute(args);
      expect(sent).toEqual([]);
      expect(await declare(args)).toEqual(declared);
    }
  });

  it("is null when execute answers without sending, and throws on a missing query", async () => {
    const direct = createTool(DIRECT);
    const chat = createTool(OPENROUTER);
    const answered: Array<[ReturnType<typeof createTool>, Record<string, unknown>, string]> = [
      [createTool({}), { query: "q" }, "missing_perplexity_api_key"],
      [direct, { query: "q", freshness: "decade" }, "invalid_freshness"],
      [chat, { query: "q", country: "US" }, "unsupported_country"],
      [direct, { query: "q", language: "eng" }, "invalid_language"],
      [
        direct,
        { query: "q", freshness: "day", date_after: "2025-01-01" },
        "conflicting_time_filters",
      ],
      [direct, { query: "q", date_after: "2025-13-45" }, "invalid_date"],
      [
        direct,
        { query: "q", date_after: "2025-02-01", date_before: "2025-01-01" },
        "invalid_date_range",
      ],
      [direct, { query: "q", domain_filter: ["a.test", "-b.test"] }, "invalid_domain_filter"],
    ];
    for (const [tool, args, error] of answered) {
      expect(await tool.tool.execute(args)).toMatchObject({ error });
      expect(await tool.declare(args), error).toBeNull();
    }
    await expect(direct.tool.execute({})).rejects.toThrow(/query required/);
    await expect(direct.declare({})).rejects.toThrow(/query required/);
    expect(sent).toEqual([]);
  });
});
