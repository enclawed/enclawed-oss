import { postTrustedWebToolsJson, wrapWebContent } from "@enclawed/plugin-sdk/provider-web-search";
import { normalizeXaiModelId } from "../model-id.js";
import {
  buildXaiResponsesToolBody,
  extractXaiWebSearchContent,
  resolveXaiResponseTextCitationsAndInline,
  XAI_RESPONSES_ENDPOINT,
} from "./responses-tool-shared.js";
import { isRecord } from "./tool-config-shared.js";
import type { XaiWebSearchResponse } from "./web-search-response.types.js";
export { extractXaiWebSearchContent } from "./responses-tool-shared.js";
export type { XaiWebSearchResponse } from "./web-search-response.types.js";

const XAI_WEB_SEARCH_ENDPOINT = XAI_RESPONSES_ENDPOINT;
const XAI_DEFAULT_WEB_SEARCH_MODEL = "grok-4-1-fast";

type XaiWebSearchConfig = Record<string, unknown> & {
  model?: unknown;
  inlineCitations?: unknown;
};

type XaiWebSearchResult = {
  content: string;
  citations: string[];
  inlineCitations?: XaiWebSearchResponse["inline_citations"];
};

export function buildXaiWebSearchPayload(params: {
  query: string;
  provider: string;
  model: string;
  tookMs: number;
  content: string;
  citations: string[];
  inlineCitations?: XaiWebSearchResponse["inline_citations"];
}): Record<string, unknown> {
  return {
    query: params.query,
    provider: params.provider,
    model: params.model,
    tookMs: params.tookMs,
    externalContent: {
      untrusted: true,
      source: "web_search",
      provider: params.provider,
      wrapped: true,
    },
    content: wrapWebContent(params.content, "web_search"),
    citations: params.citations,
    ...(params.inlineCitations ? { inlineCitations: params.inlineCitations } : {}),
  };
}

function resolveXaiSearchConfig(searchConfig?: Record<string, unknown>): XaiWebSearchConfig {
  return (
    (isRecord(searchConfig?.grok) ? (searchConfig.grok as XaiWebSearchConfig) : undefined) ?? {}
  );
}

export function resolveXaiWebSearchModel(searchConfig?: Record<string, unknown>): string {
  const config = resolveXaiSearchConfig(searchConfig);
  return typeof config.model === "string" && config.model.trim()
    ? normalizeXaiModelId(config.model.trim())
    : XAI_DEFAULT_WEB_SEARCH_MODEL;
}

export function resolveXaiInlineCitations(searchConfig?: Record<string, unknown>): boolean {
  return resolveXaiSearchConfig(searchConfig).inlineCitations === true;
}

/**
 * The web search request (URL and body object, serialized by
 * `postTrustedWebToolsJson` as JSON.stringify; no credentials), shared by the
 * call and its declared observation.
 */
export function buildXaiWebSearchRequest(params: { query: string; model: string }): {
  url: string;
  body: Record<string, unknown>;
} {
  return {
    url: XAI_WEB_SEARCH_ENDPOINT,
    body: buildXaiResponsesToolBody({
      model: params.model,
      inputText: params.query,
      tools: [{ type: "web_search" }],
    }),
  };
}

export async function requestXaiWebSearch(params: {
  query: string;
  model: string;
  apiKey: string;
  timeoutSeconds: number;
  inlineCitations: boolean;
}): Promise<XaiWebSearchResult> {
  const request = buildXaiWebSearchRequest({ query: params.query, model: params.model });
  return await postTrustedWebToolsJson(
    {
      url: request.url,
      timeoutSeconds: params.timeoutSeconds,
      apiKey: params.apiKey,
      body: request.body,
      errorLabel: "xAI",
    },
    async (response) => {
      const data = (await response.json()) as XaiWebSearchResponse;
      return resolveXaiResponseTextCitationsAndInline(data, params.inlineCitations);
    },
  );
}
