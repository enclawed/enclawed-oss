import {
  createProviderHttpError,
  formatProviderHttpErrorMessage,
} from "@enclawed/plugin-sdk/provider-http";
import {
  buildSearchCacheKey,
  buildUnsupportedSearchFilterResponse,
  DEFAULT_SEARCH_COUNT,
  readCachedSearchPayload,
  readConfiguredSecretString,
  readNumberParam,
  readProviderEnvValue,
  readStringParam,
  resolveCitationRedirectUrl,
  resolveSearchCacheTtlMs,
  resolveSearchCount,
  resolveSearchTimeoutSeconds,
  type SearchConfigRecord,
  withTrustedWebSearchEndpoint,
  wrapWebContent,
  writeCachedSearchPayload,
} from "@enclawed/plugin-sdk/provider-web-search";
import { DEFAULT_GOOGLE_API_BASE_URL } from "../api.js";
import {
  resolveGeminiConfig,
  resolveGeminiModel,
  type GeminiConfig,
} from "./gemini-web-search-provider.shared.js";

const GEMINI_API_BASE = DEFAULT_GOOGLE_API_BASE_URL;

type GeminiGroundingResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
    groundingMetadata?: {
      groundingChunks?: Array<{
        web?: {
          uri?: string;
          title?: string;
        };
      }>;
    };
  }>;
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
};

export function resolveGeminiRuntimeApiKey(gemini?: GeminiConfig): string | undefined {
  return (
    readConfiguredSecretString(gemini?.apiKey, "tools.web.search.gemini.apiKey") ??
    readProviderEnvValue(["GEMINI_API_KEY"])
  );
}

/** The grounded generateContent request (URL and exact body; no credentials). */
export function buildGeminiSearchRequest(params: { query: string; model: string }): {
  url: string;
  body: string;
} {
  return {
    url: `${GEMINI_API_BASE}/models/${params.model}:generateContent`,
    body: JSON.stringify({
      contents: [{ parts: [{ text: params.query }] }],
      tools: [{ google_search: {} }],
    }),
  };
}

async function runGeminiSearch(params: {
  request: { url: string; body: string };
  apiKey: string;
  timeoutSeconds: number;
}): Promise<{ content: string; citations: Array<{ url: string; title?: string }> }> {
  return withTrustedWebSearchEndpoint(
    {
      url: params.request.url,
      timeoutSeconds: params.timeoutSeconds,
      init: {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": params.apiKey,
        },
        body: params.request.body,
      },
    },
    async (res) => {
      if (!res.ok) {
        const error = await createProviderHttpError(res, "Gemini API error");
        throw new Error(error.message.replace(/key=[^&\s]+/giu, "key=***"));
      }

      let data: GeminiGroundingResponse;
      try {
        data = (await res.json()) as GeminiGroundingResponse;
      } catch (error) {
        const safeError = String(error).replace(/key=[^&\s]+/giu, "key=***");
        throw new Error(`Gemini API returned invalid JSON: ${safeError}`, { cause: error });
      }

      if (data.error) {
        const rawMessage = data.error.message || data.error.status || "unknown";
        throw new Error(
          formatProviderHttpErrorMessage({
            label: "Gemini API error",
            status: data.error.code ?? 0,
            detail: rawMessage.replace(/key=[^&\s]+/giu, "key=***"),
          }),
        );
      }

      const candidate = data.candidates?.[0];
      const content =
        candidate?.content?.parts
          ?.map((part) => part.text)
          .filter(Boolean)
          .join("\n") ?? "No response";
      const rawCitations = (candidate?.groundingMetadata?.groundingChunks ?? [])
        .filter((chunk) => chunk.web?.uri)
        .map((chunk) => ({
          url: chunk.web!.uri!,
          title: chunk.web?.title || undefined,
        }));

      const citations: Array<{ url: string; title?: string }> = [];
      for (let index = 0; index < rawCitations.length; index += 10) {
        const batch = rawCitations.slice(index, index + 10);
        const resolved = await Promise.all(
          batch.map(async (citation) =>
            Object.assign({}, citation, { url: await resolveCitationRedirectUrl(citation.url) }),
          ),
        );
        citations.push(...resolved);
      }

      return { content, citations };
    },
  );
}

type GeminiSearchPlan =
  | { kind: "answer"; payload: Record<string, unknown> }
  | {
      kind: "send";
      apiKey: string;
      query: string;
      model: string;
      cacheKey: string;
      request: { url: string; body: string };
    };

/**
 * Everything a call decides before it sends, shared by `executeGeminiSearch`
 * and its declared observation (`observeGeminiSearch`): either the payload it
 * answers with locally, or the request it sends. Throws on invalid args.
 */
function planGeminiSearch(
  args: Record<string, unknown>,
  searchConfig?: SearchConfigRecord,
): GeminiSearchPlan {
  const unsupportedResponse = buildUnsupportedSearchFilterResponse(args, "gemini");
  if (unsupportedResponse) {
    return { kind: "answer", payload: unsupportedResponse };
  }

  const geminiConfig = resolveGeminiConfig(searchConfig);
  const apiKey = resolveGeminiRuntimeApiKey(geminiConfig);
  if (!apiKey) {
    return {
      kind: "answer",
      payload: {
        error: "missing_gemini_api_key",
        message:
          "web_search (gemini) needs an API key. Set GEMINI_API_KEY in the Gateway environment, or configure tools.web.search.gemini.apiKey.",
        docs: "https://github.com/enclawed/enclawed-oss/blob/main/docs/tools/web.md",
      },
    };
  }

  const query = readStringParam(args, "query", { required: true });
  const count =
    readNumberParam(args, "count", { integer: true }) ?? searchConfig?.maxResults ?? undefined;
  const model = resolveGeminiModel(geminiConfig);
  const cacheKey = buildSearchCacheKey([
    "gemini",
    query,
    resolveSearchCount(count, DEFAULT_SEARCH_COUNT),
    model,
  ]);
  return {
    kind: "send",
    apiKey,
    query,
    model,
    cacheKey,
    request: buildGeminiSearchRequest({ query, model }),
  };
}

/**
 * The request a gemini web_search call sends, for the egress action batcher:
 * null when the call answers without sending (unsupported filter, no API
 * key); throws when it fails before sending (no query). Independent of the
 * result cache. After the response, the call also sends a HEAD to each
 * citation URL the response names (`resolveCitationRedirectUrl`): those
 * follow-ups are a function of the response alone.
 */
export function observeGeminiSearch(
  args: Record<string, unknown>,
  searchConfig?: SearchConfigRecord,
): {
  type: "http";
  method: "POST";
  url: string;
  body: string;
  read: true;
  client: "web_search:gemini";
} | null {
  const plan = planGeminiSearch(args, searchConfig);
  if (plan.kind === "answer") {
    return null;
  }
  return {
    type: "http",
    method: "POST",
    url: plan.request.url,
    body: plan.request.body,
    read: true,
    client: "web_search:gemini",
  };
}

export async function executeGeminiSearch(
  args: Record<string, unknown>,
  searchConfig?: SearchConfigRecord,
): Promise<Record<string, unknown>> {
  const plan = planGeminiSearch(args, searchConfig);
  if (plan.kind === "answer") {
    return plan.payload;
  }
  const { apiKey, query, model, cacheKey } = plan;
  const cached = readCachedSearchPayload(cacheKey);
  if (cached) {
    return cached;
  }

  const start = Date.now();
  const result = await runGeminiSearch({
    request: plan.request,
    apiKey,
    timeoutSeconds: resolveSearchTimeoutSeconds(searchConfig),
  });
  const payload = {
    query,
    provider: "gemini",
    model,
    tookMs: Date.now() - start,
    externalContent: {
      untrusted: true,
      source: "web_search",
      provider: "gemini",
      wrapped: true,
    },
    content: wrapWebContent(result.content),
    citations: result.citations,
  };
  writeCachedSearchPayload(cacheKey, payload, resolveSearchCacheTtlMs(searchConfig));
  return payload;
}
