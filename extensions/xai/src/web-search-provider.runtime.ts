import {
  DEFAULT_CACHE_TTL_MINUTES,
  DEFAULT_TIMEOUT_SECONDS,
  formatCliCommand,
  getScopedCredentialValue,
  mergeScopedSearchConfig,
  normalizeCacheKey,
  readCache,
  readNumberParam,
  readStringParam,
  resolveCacheTtlMs,
  resolveProviderWebSearchPluginConfig,
  resolveTimeoutSeconds,
  resolveWebSearchProviderCredential,
  type WebSearchProviderSetupContext,
  writeCache,
} from "@enclawed/plugin-sdk/provider-web-search";
import {
  buildXaiWebSearchPayload,
  buildXaiWebSearchRequest,
  extractXaiWebSearchContent,
  requestXaiWebSearch,
  resolveXaiInlineCitations,
  resolveXaiWebSearchModel,
} from "./web-search-shared.js";
import { resolveEffectiveXSearchConfig, setPluginXSearchConfigValue } from "./x-search-config.js";
import { XAI_DEFAULT_X_SEARCH_MODEL } from "./x-search-shared.js";

const XAI_WEB_SEARCH_CACHE = new Map<
  string,
  { value: Record<string, unknown>; insertedAt: number; expiresAt: number }
>();

const X_SEARCH_MODEL_OPTIONS = [
  {
    value: XAI_DEFAULT_X_SEARCH_MODEL,
    label: XAI_DEFAULT_X_SEARCH_MODEL,
    hint: "default · fast, no reasoning",
  },
  {
    value: "grok-4-1-fast",
    label: "grok-4-1-fast",
    hint: "fast with reasoning",
  },
] as const;

function resolveXSearchConfigRecord(
  config?: WebSearchProviderSetupContext["config"],
): Record<string, unknown> | undefined {
  return resolveEffectiveXSearchConfig(config);
}

export async function runXaiSearchProviderSetup(
  ctx: WebSearchProviderSetupContext,
): Promise<WebSearchProviderSetupContext["config"]> {
  const existingXSearch = resolveXSearchConfigRecord(ctx.config);
  if (existingXSearch?.enabled === false) {
    return ctx.config;
  }

  await ctx.prompter.note(
    [
      "x_search lets your agent search X (formerly Twitter) posts via xAI.",
      "It reuses the same xAI API key you just configured for Grok web search.",
      `You can change this later with ${formatCliCommand("enclawed configure --section web")}.`,
    ].join("\n"),
    "X search",
  );

  const enableChoice = await ctx.prompter.select<"yes" | "skip">({
    message: "Enable x_search too?",
    options: [
      {
        value: "yes",
        label: "Yes, enable x_search",
        hint: "Search X posts with the same xAI key",
      },
      {
        value: "skip",
        label: "Skip for now",
        hint: "Keep Grok web_search only",
      },
    ],
    initialValue: existingXSearch?.enabled === true || ctx.quickstartDefaults ? "yes" : "skip",
  });

  if (enableChoice === "skip") {
    return ctx.config;
  }

  const existingModel =
    typeof existingXSearch?.model === "string" && existingXSearch.model.trim()
      ? existingXSearch.model.trim()
      : "";
  const knownModel = X_SEARCH_MODEL_OPTIONS.find((entry) => entry.value === existingModel)?.value;
  const modelPick = await ctx.prompter.select<string>({
    message: "Grok model for x_search",
    options: [
      ...X_SEARCH_MODEL_OPTIONS,
      { value: "__custom__", label: "Enter custom model name", hint: "" },
    ],
    initialValue: knownModel ?? XAI_DEFAULT_X_SEARCH_MODEL,
  });

  let model = modelPick;
  if (modelPick === "__custom__") {
    const customModel = await ctx.prompter.text({
      message: "Custom Grok model name",
      initialValue: existingModel || XAI_DEFAULT_X_SEARCH_MODEL,
      placeholder: XAI_DEFAULT_X_SEARCH_MODEL,
    });
    model = customModel.trim() || XAI_DEFAULT_X_SEARCH_MODEL;
  }

  const next = structuredClone(ctx.config);
  setPluginXSearchConfigValue(next, "enabled", true);
  setPluginXSearchConfigValue(next, "model", model || XAI_DEFAULT_X_SEARCH_MODEL);
  return next;
}

function runXaiWebSearch(params: {
  query: string;
  model: string;
  apiKey: string;
  timeoutSeconds: number;
  inlineCitations: boolean;
  cacheTtlMs: number;
}): Promise<Record<string, unknown>> {
  const cacheKey = normalizeCacheKey(
    `grok:${params.model}:${String(params.inlineCitations)}:${params.query}`,
  );
  const cached = readCache(XAI_WEB_SEARCH_CACHE, cacheKey);
  if (cached) {
    return Promise.resolve({ ...cached.value, cached: true });
  }

  return (async () => {
    const startedAt = Date.now();
    const result = await requestXaiWebSearch({
      query: params.query,
      model: params.model,
      apiKey: params.apiKey,
      timeoutSeconds: params.timeoutSeconds,
      inlineCitations: params.inlineCitations,
    });
    const payload = buildXaiWebSearchPayload({
      query: params.query,
      provider: "grok",
      model: params.model,
      tookMs: Date.now() - startedAt,
      content: result.content,
      citations: result.citations,
      inlineCitations: result.inlineCitations,
    });

    writeCache(XAI_WEB_SEARCH_CACHE, cacheKey, payload, params.cacheTtlMs);
    return payload;
  })();
}

function resolveXaiToolSearchConfig(ctx: {
  config?: Record<string, unknown>;
  searchConfig?: Record<string, unknown>;
}) {
  return mergeScopedSearchConfig(
    ctx.searchConfig,
    "grok",
    resolveProviderWebSearchPluginConfig(ctx.config, "xai"),
  );
}

function resolveXaiWebSearchCredential(searchConfig?: Record<string, unknown>): string | undefined {
  return resolveWebSearchProviderCredential({
    credentialValue: getScopedCredentialValue(searchConfig, "grok"),
    path: "tools.web.search.grok.apiKey",
    envVars: ["XAI_API_KEY"],
  });
}

type XaiWebSearchPlan =
  | { kind: "answer"; payload: Record<string, unknown> }
  | {
      kind: "send";
      apiKey: string;
      query: string;
      model: string;
      searchConfig?: Record<string, unknown>;
    };

/**
 * Everything a call decides before it sends, shared by the call and its
 * declared observation: the payload it answers with locally (no API key), or
 * what it sends. Throws on a missing query.
 */
function planXaiWebSearch(
  ctx: { config?: Record<string, unknown>; searchConfig?: Record<string, unknown> },
  args: Record<string, unknown>,
): XaiWebSearchPlan {
  const searchConfig = resolveXaiToolSearchConfig(ctx);
  const apiKey = resolveXaiWebSearchCredential(searchConfig);

  if (!apiKey) {
    return {
      kind: "answer",
      payload: {
        error: "missing_xai_api_key",
        message:
          "web_search (grok) needs an xAI API key. Set XAI_API_KEY in the Gateway environment, or configure plugins.entries.xai.config.webSearch.apiKey.",
        docs: "https://github.com/enclawed/enclawed-oss/blob/main/docs/tools/web.md",
      },
    };
  }

  const query = readStringParam(args, "query", { required: true });
  // count is accepted for the generic schema but never sent.
  void readNumberParam(args, "count", { integer: true });
  return {
    kind: "send",
    apiKey,
    query,
    model: resolveXaiWebSearchModel(searchConfig),
    searchConfig,
  };
}

/**
 * The request a grok web_search call sends, for the egress action batcher:
 * null when the call answers without sending (no API key); throws when it
 * fails before sending (no query). Independent of the result cache. One
 * request per call: the search turns run at xAI, inside that request.
 */
export function observeXaiWebSearchProviderTool(
  ctx: { config?: Record<string, unknown>; searchConfig?: Record<string, unknown> },
  args: Record<string, unknown>,
): {
  type: "http";
  method: "POST";
  url: string;
  body: string;
  read: true;
  client: "web_search:grok";
} | null {
  const plan = planXaiWebSearch(ctx, args);
  if (plan.kind === "answer") {
    return null;
  }
  const request = buildXaiWebSearchRequest({ query: plan.query, model: plan.model });
  return {
    type: "http",
    method: "POST",
    url: request.url,
    // As `postTrustedWebToolsJson` serializes it.
    body: JSON.stringify(request.body),
    read: true,
    client: "web_search:grok",
  };
}

export async function executeXaiWebSearchProviderTool(
  ctx: { config?: Record<string, unknown>; searchConfig?: Record<string, unknown> },
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const plan = planXaiWebSearch(ctx, args);
  if (plan.kind === "answer") {
    return plan.payload;
  }
  const { searchConfig } = plan;
  return await runXaiWebSearch({
    query: plan.query,
    model: plan.model,
    apiKey: plan.apiKey,
    timeoutSeconds: resolveTimeoutSeconds(searchConfig?.timeoutSeconds, DEFAULT_TIMEOUT_SECONDS),
    inlineCitations: resolveXaiInlineCitations(searchConfig),
    cacheTtlMs: resolveCacheTtlMs(searchConfig?.cacheTtlMinutes, DEFAULT_CACHE_TTL_MINUTES),
  });
}

export const __testing = {
  buildXaiWebSearchPayload,
  extractXaiWebSearchContent,
  resolveXaiToolSearchConfig,
  resolveXaiInlineCitations,
  resolveXaiWebSearchCredential,
  resolveXaiWebSearchModel,
  requestXaiWebSearch,
};
