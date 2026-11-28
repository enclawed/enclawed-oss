import type { SearchConfigRecord } from "@enclawed/plugin-sdk/provider-web-search";
import {
  buildSearchCacheKey,
  DEFAULT_SEARCH_COUNT,
  formatCliCommand,
  normalizeFreshness,
  parseIsoDateRange,
  readCachedSearchPayload,
  readConfiguredSecretString,
  readNumberParam,
  readProviderEnvValue,
  readStringParam,
  resolveSearchCacheTtlMs,
  resolveSearchCount,
  resolveSearchTimeoutSeconds,
  resolveSiteName,
  withTrustedWebSearchEndpoint,
  wrapWebContent,
  writeCachedSearchPayload,
} from "@enclawed/plugin-sdk/provider-web-search";
import {
  type BraveLlmContextResponse,
  mapBraveLlmContextResults,
  normalizeBraveCountry,
  normalizeBraveLanguageParams,
  resolveBraveConfig,
  resolveBraveMode,
} from "./brave-web-search-provider.shared.js";

const BRAVE_SEARCH_ENDPOINT = "https://api.search.brave.com/res/v1/web/search";
const BRAVE_LLM_CONTEXT_ENDPOINT = "https://api.search.brave.com/res/v1/llm/context";

type BraveSearchResult = {
  title?: string;
  url?: string;
  description?: string;
  age?: string;
};

type BraveSearchResponse = {
  web?: {
    results?: BraveSearchResult[];
  };
};

function resolveBraveApiKey(searchConfig?: SearchConfigRecord): string | undefined {
  return (
    readConfiguredSecretString(searchConfig?.apiKey, "tools.web.search.apiKey") ??
    readProviderEnvValue(["BRAVE_API_KEY"])
  );
}

function missingBraveKeyPayload() {
  return {
    error: "missing_brave_api_key",
    message: `web_search (brave) needs a Brave Search API key. Run \`${formatCliCommand("enclawed configure --section web")}\` to store it, or set BRAVE_API_KEY in the Gateway environment.`,
    docs: "https://github.com/enclawed/enclawed-oss/blob/main/docs/tools/web.md",
  };
}

async function runBraveLlmContextSearch(params: {
  url: string;
  apiKey: string;
  timeoutSeconds: number;
}): Promise<{
  results: Array<{
    url: string;
    title: string;
    snippets: string[];
    siteName?: string;
  }>;
  sources?: BraveLlmContextResponse["sources"];
}> {
  return withTrustedWebSearchEndpoint(
    {
      url: params.url,
      timeoutSeconds: params.timeoutSeconds,
      init: {
        method: "GET",
        headers: {
          Accept: "application/json",
          "X-Subscription-Token": params.apiKey,
        },
      },
    },
    async (response) => {
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(
          `Brave LLM Context API error (${response.status}): ${detail || response.statusText}`,
        );
      }

      const data = (await response.json()) as BraveLlmContextResponse;
      return { results: mapBraveLlmContextResults(data), sources: data.sources };
    },
  );
}

async function runBraveWebSearch(params: {
  url: string;
  apiKey: string;
  timeoutSeconds: number;
}): Promise<Array<Record<string, unknown>>> {
  return withTrustedWebSearchEndpoint(
    {
      url: params.url,
      timeoutSeconds: params.timeoutSeconds,
      init: {
        method: "GET",
        headers: {
          Accept: "application/json",
          "X-Subscription-Token": params.apiKey,
        },
      },
    },
    async (response) => {
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(
          `Brave Search API error (${response.status}): ${detail || response.statusText}`,
        );
      }

      const data = (await response.json()) as BraveSearchResponse;
      const results = Array.isArray(data.web?.results) ? (data.web?.results ?? []) : [];
      return results.map((entry) => {
        const description = entry.description ?? "";
        const title = entry.title ?? "";
        const url = entry.url ?? "";
        return {
          title: title ? wrapWebContent(title, "web_search") : "",
          url,
          description: description ? wrapWebContent(description, "web_search") : "",
          published: entry.age || undefined,
          siteName: resolveSiteName(url) || undefined,
        };
      });
    },
  );
}

/** The Brave web search URL for normalized parameters. */
function buildBraveWebSearchUrl(params: {
  query: string;
  count: number;
  country?: string;
  search_lang?: string;
  ui_lang?: string;
  freshness?: string;
  dateAfter?: string;
  dateBefore?: string;
}): string {
  const url = new URL(BRAVE_SEARCH_ENDPOINT);
  url.searchParams.set("q", params.query);
  url.searchParams.set("count", String(params.count));
  if (params.country) {
    url.searchParams.set("country", params.country);
  }
  if (params.search_lang) {
    url.searchParams.set("search_lang", params.search_lang);
  }
  if (params.ui_lang) {
    url.searchParams.set("ui_lang", params.ui_lang);
  }
  // Brave takes a date range as freshness "<from>to<to>"; an open bound is
  // closed with the epoch start or the current date.
  if (params.freshness) {
    url.searchParams.set("freshness", params.freshness);
  } else if (params.dateAfter && params.dateBefore) {
    url.searchParams.set("freshness", `${params.dateAfter}to${params.dateBefore}`);
  } else if (params.dateAfter) {
    url.searchParams.set(
      "freshness",
      `${params.dateAfter}to${new Date().toISOString().slice(0, 10)}`,
    );
  } else if (params.dateBefore) {
    url.searchParams.set("freshness", `1970-01-01to${params.dateBefore}`);
  }
  return url.toString();
}

/** The Brave LLM Context URL for normalized parameters. */
function buildBraveLlmContextUrl(params: {
  query: string;
  country?: string;
  search_lang?: string;
  freshness?: string;
}): string {
  const url = new URL(BRAVE_LLM_CONTEXT_ENDPOINT);
  url.searchParams.set("q", params.query);
  if (params.country) {
    url.searchParams.set("country", params.country);
  }
  if (params.search_lang) {
    url.searchParams.set("search_lang", params.search_lang);
  }
  if (params.freshness) {
    url.searchParams.set("freshness", params.freshness);
  }
  return url.toString();
}

/**
 * What a Brave search call does for these arguments: answer locally (missing
 * key, invalid arguments), or send one GET to `url`. Shared by the execute
 * path and the tool's declared observation, so both see the same request.
 * Throws when a required argument is missing, as execute does.
 */
type BraveSearchPlan =
  | { kind: "answer"; payload: Record<string, unknown> }
  | {
      kind: "send";
      mode: "web" | "llm-context";
      apiKey: string;
      query: string;
      url: string;
      cacheKey: string;
    };

function planBraveSearch(
  args: Record<string, unknown>,
  searchConfig?: SearchConfigRecord,
): BraveSearchPlan {
  const apiKey = resolveBraveApiKey(searchConfig);
  if (!apiKey) {
    return { kind: "answer", payload: missingBraveKeyPayload() };
  }

  const braveConfig = resolveBraveConfig(searchConfig);
  const braveMode = resolveBraveMode(braveConfig);
  const query = readStringParam(args, "query", { required: true });
  const count =
    readNumberParam(args, "count", { integer: true }) ?? searchConfig?.maxResults ?? undefined;
  const country = normalizeBraveCountry(readStringParam(args, "country"));
  const language = readStringParam(args, "language");
  const search_lang = readStringParam(args, "search_lang");
  const ui_lang = readStringParam(args, "ui_lang");
  const normalizedLanguage = normalizeBraveLanguageParams({
    search_lang: search_lang || language,
    ui_lang,
  });

  if (normalizedLanguage.invalidField === "search_lang") {
    return {
      kind: "answer",
      payload: {
        error: "invalid_search_lang",
        message:
          "search_lang must be a Brave-supported language code like 'en', 'en-gb', 'zh-hans', or 'zh-hant'.",
        docs: "https://github.com/enclawed/enclawed-oss/blob/main/docs/tools/web.md",
      },
    };
  }
  if (normalizedLanguage.invalidField === "ui_lang") {
    return {
      kind: "answer",
      payload: {
        error: "invalid_ui_lang",
        message: "ui_lang must be a language-region locale like 'en-US'.",
        docs: "https://github.com/enclawed/enclawed-oss/blob/main/docs/tools/web.md",
      },
    };
  }
  if (normalizedLanguage.ui_lang && braveMode === "llm-context") {
    return {
      kind: "answer",
      payload: {
        error: "unsupported_ui_lang",
        message:
          "ui_lang is not supported by Brave llm-context mode. Remove ui_lang or use Brave web mode for locale-based UI hints.",
        docs: "https://github.com/enclawed/enclawed-oss/blob/main/docs/tools/web.md",
      },
    };
  }

  const rawFreshness = readStringParam(args, "freshness");
  if (rawFreshness && braveMode === "llm-context") {
    return {
      kind: "answer",
      payload: {
        error: "unsupported_freshness",
        message:
          "freshness filtering is not supported by Brave llm-context mode. Remove freshness or use Brave web mode.",
        docs: "https://github.com/enclawed/enclawed-oss/blob/main/docs/tools/web.md",
      },
    };
  }
  const freshness = rawFreshness ? normalizeFreshness(rawFreshness, "brave") : undefined;
  if (rawFreshness && !freshness) {
    return {
      kind: "answer",
      payload: {
        error: "invalid_freshness",
        message: "freshness must be day, week, month, or year.",
        docs: "https://github.com/enclawed/enclawed-oss/blob/main/docs/tools/web.md",
      },
    };
  }

  const rawDateAfter = readStringParam(args, "date_after");
  const rawDateBefore = readStringParam(args, "date_before");
  if (rawFreshness && (rawDateAfter || rawDateBefore)) {
    return {
      kind: "answer",
      payload: {
        error: "conflicting_time_filters",
        message:
          "freshness and date_after/date_before cannot be used together. Use either freshness (day/week/month/year) or a date range (date_after/date_before), not both.",
        docs: "https://github.com/enclawed/enclawed-oss/blob/main/docs/tools/web.md",
      },
    };
  }
  if ((rawDateAfter || rawDateBefore) && braveMode === "llm-context") {
    return {
      kind: "answer",
      payload: {
        error: "unsupported_date_filter",
        message:
          "date_after/date_before filtering is not supported by Brave llm-context mode. Use Brave web mode for date filters.",
        docs: "https://github.com/enclawed/enclawed-oss/blob/main/docs/tools/web.md",
      },
    };
  }

  const parsedDateRange = parseIsoDateRange({
    rawDateAfter,
    rawDateBefore,
    invalidDateAfterMessage: "date_after must be YYYY-MM-DD format.",
    invalidDateBeforeMessage: "date_before must be YYYY-MM-DD format.",
    invalidDateRangeMessage: "date_after must be before date_before.",
  });
  if ("error" in parsedDateRange) {
    return { kind: "answer", payload: parsedDateRange };
  }

  const { dateAfter, dateBefore } = parsedDateRange;
  const resolvedCount = resolveSearchCount(count, DEFAULT_SEARCH_COUNT);
  const cacheKey = buildSearchCacheKey([
    "brave",
    braveMode,
    query,
    resolvedCount,
    country,
    normalizedLanguage.search_lang,
    normalizedLanguage.ui_lang,
    freshness,
    dateAfter,
    dateBefore,
  ]);
  // llm-context sends no count (it was always dropped there) and never takes
  // ui_lang or a time filter (refused above).
  const url =
    braveMode === "llm-context"
      ? buildBraveLlmContextUrl({
          query,
          country: country ?? undefined,
          search_lang: normalizedLanguage.search_lang,
          freshness,
        })
      : buildBraveWebSearchUrl({
          query,
          count: resolvedCount,
          country: country ?? undefined,
          search_lang: normalizedLanguage.search_lang,
          ui_lang: normalizedLanguage.ui_lang,
          freshness,
          dateAfter,
          dateBefore,
        });
  return { kind: "send", mode: braveMode, apiKey, query, url, cacheKey };
}

/**
 * The request a Brave search call sends for these arguments (the tool's
 * declared observation), null when it answers without sending. The API key
 * travels in a header and is left out.
 */
export function observeBraveSearch(
  args: Record<string, unknown>,
  searchConfig?: SearchConfigRecord,
): { type: "http"; method: "GET"; url: string; client: "web_search:brave" } | null {
  const plan = planBraveSearch(args, searchConfig);
  if (plan.kind === "answer") {
    return null;
  }
  // A range open at the end is closed with today's date, from the host clock,
  // not from any parameter. Keying on it would let a sender re-send a repeat
  // by waiting for midnight; the key keeps the open end instead (the
  // batcher's scheduled refresh re-issues the call with a current date).
  const url = new URL(plan.url);
  const freshness = url.searchParams.get("freshness");
  const openEnded =
    freshness !== null &&
    /^\d{4}-\d{2}-\d{2}to\d{4}-\d{2}-\d{2}$/.test(freshness) &&
    readStringParam(args, "date_before") === undefined;
  if (openEnded) {
    url.searchParams.set("freshness", `${freshness.slice(0, 10)}to<today>`);
  }
  return { type: "http", method: "GET", url: url.href, client: "web_search:brave" };
}

export async function executeBraveSearch(
  args: Record<string, unknown>,
  searchConfig?: SearchConfigRecord,
): Promise<Record<string, unknown>> {
  const plan = planBraveSearch(args, searchConfig);
  if (plan.kind === "answer") {
    return plan.payload;
  }
  const { apiKey, query, url, cacheKey } = plan;
  const cached = readCachedSearchPayload(cacheKey);
  if (cached) {
    return cached;
  }

  const start = Date.now();
  const timeoutSeconds = resolveSearchTimeoutSeconds(searchConfig);
  const cacheTtlMs = resolveSearchCacheTtlMs(searchConfig);

  if (plan.mode === "llm-context") {
    const { results, sources } = await runBraveLlmContextSearch({ url, apiKey, timeoutSeconds });
    const payload = {
      query,
      provider: "brave",
      mode: "llm-context" as const,
      count: results.length,
      tookMs: Date.now() - start,
      externalContent: {
        untrusted: true,
        source: "web_search",
        provider: "brave",
        wrapped: true,
      },
      results: results.map((entry) => ({
        title: entry.title ? wrapWebContent(entry.title, "web_search") : "",
        url: entry.url,
        snippets: entry.snippets.map((snippet) => wrapWebContent(snippet, "web_search")),
        siteName: entry.siteName,
      })),
      sources,
    };
    writeCachedSearchPayload(cacheKey, payload, cacheTtlMs);
    return payload;
  }

  const results = await runBraveWebSearch({ url, apiKey, timeoutSeconds });
  const payload = {
    query,
    provider: "brave",
    count: results.length,
    tookMs: Date.now() - start,
    externalContent: {
      untrusted: true,
      source: "web_search",
      provider: "brave",
      wrapped: true,
    },
    results,
  };
  writeCachedSearchPayload(cacheKey, payload, cacheTtlMs);
  return payload;
}
