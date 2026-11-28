import type { EnclawedConfig } from "../config/types.enclawed.js";
import { logVerbose } from "../globals.js";
import type {
  PluginWebSearchProviderEntry,
  WebSearchProviderToolDefinition,
} from "../plugins/web-provider-types.js";
import { resolvePluginWebSearchProviders } from "../plugins/web-search-providers.runtime.js";
import { resolveRuntimeWebSearchProviders } from "../plugins/web-search-providers.runtime.js";
import { sortWebSearchProvidersForAutoDetect } from "../plugins/web-search-providers.shared.js";
import { getActiveRuntimeWebToolsMetadata } from "../secrets/runtime-web-tools-state.js";
import type { RuntimeWebSearchMetadata } from "../secrets/runtime-web-tools.types.js";
import {
  normalizeLowercaseStringOrEmpty,
  normalizeOptionalLowercaseString,
} from "../shared/string-coerce.js";
import {
  hasWebProviderEntryCredential,
  providerRequiresCredential,
  readWebProviderEnvValue,
  resolveWebProviderConfig,
  resolveWebProviderDefinition,
} from "../web/provider-runtime-shared.js";
import type {
  ResolveWebSearchDefinitionParams,
  RunWebSearchParams,
  RunWebSearchResult,
  RuntimeWebSearchConfig as WebSearchConfig,
} from "./runtime-types.js";

export type {
  ListWebSearchProvidersParams,
  ResolveWebSearchDefinitionParams,
  RunWebSearchParams,
  RunWebSearchResult,
  RuntimeWebSearchConfig,
  RuntimeWebSearchProviderEntry,
  RuntimeWebSearchToolDefinition,
} from "./runtime-types.js";

function resolveSearchConfig(cfg?: EnclawedConfig): WebSearchConfig {
  return resolveWebProviderConfig<"search", NonNullable<WebSearchConfig>>(cfg, "search");
}

export function resolveWebSearchEnabled(params: {
  search?: WebSearchConfig;
  sandboxed?: boolean;
}): boolean {
  if (typeof params.search?.enabled === "boolean") {
    return params.search.enabled;
  }
  if (params.sandboxed) {
    return true;
  }
  return true;
}

function hasEntryCredential(
  provider: Pick<
    PluginWebSearchProviderEntry,
    | "credentialPath"
    | "id"
    | "envVars"
    | "getConfiguredCredentialValue"
    | "getCredentialValue"
    | "requiresCredential"
  >,
  config: EnclawedConfig | undefined,
  search: WebSearchConfig | undefined,
): boolean {
  return hasWebProviderEntryCredential({
    provider,
    config,
    toolConfig: search as Record<string, unknown> | undefined,
    resolveRawValue: ({ provider: currentProvider, config: currentConfig, toolConfig }) =>
      currentProvider.getConfiguredCredentialValue?.(currentConfig) ??
      (currentProvider.id === "brave" ? currentProvider.getCredentialValue(toolConfig) : undefined),
    resolveEnvValue: ({ provider: currentProvider, configuredEnvVarId }) =>
      (configuredEnvVarId ? readWebProviderEnvValue([configuredEnvVarId]) : undefined) ??
      readWebProviderEnvValue(currentProvider.envVars),
  });
}

export function isWebSearchProviderConfigured(params: {
  provider: Pick<
    PluginWebSearchProviderEntry,
    | "credentialPath"
    | "id"
    | "envVars"
    | "getConfiguredCredentialValue"
    | "getCredentialValue"
    | "requiresCredential"
  >;
  config?: EnclawedConfig;
}): boolean {
  return hasEntryCredential(params.provider, params.config, resolveSearchConfig(params.config));
}

export function listWebSearchProviders(params?: {
  config?: EnclawedConfig;
}): PluginWebSearchProviderEntry[] {
  return resolveRuntimeWebSearchProviders({
    config: params?.config,
    bundledAllowlistCompat: true,
  });
}

export function listConfiguredWebSearchProviders(params?: {
  config?: EnclawedConfig;
}): PluginWebSearchProviderEntry[] {
  return resolvePluginWebSearchProviders({
    config: params?.config,
    bundledAllowlistCompat: true,
  });
}

export function resolveWebSearchProviderId(params: {
  search?: WebSearchConfig;
  config?: EnclawedConfig;
  providers?: PluginWebSearchProviderEntry[];
}): string {
  const providers = sortWebSearchProvidersForAutoDetect(
    params.providers ??
      resolvePluginWebSearchProviders({
        config: params.config,
        bundledAllowlistCompat: true,
        origin: "bundled",
      }),
  );
  const raw =
    params.search && "provider" in params.search
      ? normalizeLowercaseStringOrEmpty(params.search.provider)
      : "";

  if (raw) {
    const explicit = providers.find((provider) => provider.id === raw);
    if (explicit) {
      return explicit.id;
    }
  }

  if (!raw) {
    let keylessFallbackProviderId = "";
    for (const provider of providers) {
      if (!providerRequiresCredential(provider)) {
        keylessFallbackProviderId ||= provider.id;
        continue;
      }
      if (!hasEntryCredential(provider, params.config, params.search)) {
        continue;
      }
      logVerbose(
        `web_search: no provider configured, auto-detected "${provider.id}" from available API keys`,
      );
      return provider.id;
    }
    if (keylessFallbackProviderId) {
      logVerbose(
        `web_search: no provider configured and no credentials found, falling back to keyless provider "${keylessFallbackProviderId}"`,
      );
      return keylessFallbackProviderId;
    }
  }

  return providers[0]?.id ?? "";
}

export function resolveWebSearchDefinition(
  options?: ResolveWebSearchDefinitionParams,
): { provider: PluginWebSearchProviderEntry; definition: WebSearchProviderToolDefinition } | null {
  const search = resolveSearchConfig(options?.config);
  const runtimeWebSearch = options?.runtimeWebSearch ?? getActiveRuntimeWebToolsMetadata()?.search;
  const providers = sortWebSearchProvidersForAutoDetect(
    options?.preferRuntimeProviders
      ? resolveRuntimeWebSearchProviders({
          config: options?.config,
          bundledAllowlistCompat: true,
        })
      : resolvePluginWebSearchProviders({
          config: options?.config,
          bundledAllowlistCompat: true,
          origin: "bundled",
        }),
  );
  return resolveWebProviderDefinition({
    config: options?.config,
    toolConfig: search as Record<string, unknown> | undefined,
    runtimeMetadata: runtimeWebSearch,
    sandboxed: options?.sandboxed,
    providerId: options?.providerId,
    providers,
    resolveEnabled: ({ toolConfig, sandboxed }) =>
      resolveWebSearchEnabled({
        search: toolConfig as WebSearchConfig | undefined,
        sandboxed,
      }),
    resolveAutoProviderId: ({ config, toolConfig, providers }) =>
      resolveWebSearchProviderId({
        config,
        search: toolConfig as WebSearchConfig | undefined,
        providers,
      }),
    resolveFallbackProviderId: ({ config, toolConfig, providers }) =>
      resolveWebSearchProviderId({
        config,
        search: toolConfig as WebSearchConfig | undefined,
        providers,
      }) || providers[0]?.id,
    createTool: ({ provider, config, toolConfig, runtimeMetadata }) =>
      provider.createTool({
        config,
        searchConfig: toolConfig,
        runtimeMetadata,
      }),
  });
}

function resolveWebSearchCandidates(
  options?: ResolveWebSearchDefinitionParams,
): PluginWebSearchProviderEntry[] {
  const search = resolveSearchConfig(options?.config);
  const runtimeWebSearch = options?.runtimeWebSearch ?? getActiveRuntimeWebToolsMetadata()?.search;
  if (!resolveWebSearchEnabled({ search, sandboxed: options?.sandboxed })) {
    return [];
  }

  const providers = sortWebSearchProvidersForAutoDetect(
    options?.preferRuntimeProviders
      ? resolveRuntimeWebSearchProviders({
          config: options?.config,
          bundledAllowlistCompat: true,
        })
      : resolvePluginWebSearchProviders({
          config: options?.config,
          bundledAllowlistCompat: true,
          origin: "bundled",
        }),
  ).filter(Boolean);
  if (providers.length === 0) {
    return [];
  }

  const preferredIds = [
    options?.providerId,
    runtimeWebSearch?.selectedProvider,
    runtimeWebSearch?.providerConfigured,
    resolveWebSearchProviderId({ config: options?.config, search, providers }),
  ].filter(
    (value, index, array): value is string => Boolean(value) && array.indexOf(value) === index,
  );

  const explicitProviderId = options?.providerId?.trim();
  if (explicitProviderId && !providers.some((entry) => entry.id === explicitProviderId)) {
    throw new Error(`Unknown web_search provider "${explicitProviderId}".`);
  }

  const orderedProviders = [
    ...preferredIds
      .map((id) => providers.find((entry) => entry.id === id))
      .filter((entry): entry is PluginWebSearchProviderEntry => Boolean(entry)),
    ...providers.filter((entry) => !preferredIds.includes(entry.id)),
  ];
  return orderedProviders;
}

function hasExplicitWebSearchSelection(params: {
  search?: WebSearchConfig;
  runtimeWebSearch?: RuntimeWebSearchMetadata;
  providerId?: string;
  providers?: PluginWebSearchProviderEntry[];
}): boolean {
  if (params.providerId?.trim()) {
    return true;
  }
  const availableProviderIds = new Set(
    (params.providers ?? []).map((provider) => normalizeLowercaseStringOrEmpty(provider.id)),
  );
  const configuredProviderId =
    params.search && "provider" in params.search && typeof params.search.provider === "string"
      ? normalizeLowercaseStringOrEmpty(params.search.provider)
      : "";
  if (configuredProviderId && availableProviderIds.has(configuredProviderId)) {
    return true;
  }
  const runtimeConfiguredId = normalizeOptionalLowercaseString(
    params.runtimeWebSearch?.selectedProvider ?? params.runtimeWebSearch?.providerConfigured,
  );
  if (
    params.runtimeWebSearch?.providerSource === "configured" &&
    runtimeConfiguredId &&
    availableProviderIds.has(runtimeConfiguredId)
  ) {
    return true;
  }
  return false;
}

export async function runWebSearch(params: RunWebSearchParams): Promise<RunWebSearchResult> {
  const search = resolveSearchConfig(params.config);
  const runtimeWebSearch = params.runtimeWebSearch ?? getActiveRuntimeWebToolsMetadata()?.search;
  const candidates = resolveWebSearchCandidates({
    ...params,
    runtimeWebSearch,
    preferRuntimeProviders: params.preferRuntimeProviders ?? true,
  });
  if (candidates.length === 0) {
    throw new Error("web_search is disabled or no provider is available.");
  }
  const allowFallback = !hasExplicitWebSearchSelection({
    search,
    runtimeWebSearch,
    providerId: params.providerId,
    providers: candidates,
  });
  let lastError: unknown;
  let sawUnavailableProvider = false;

  for (const candidate of candidates) {
    try {
      const definition = candidate.createTool({
        config: params.config,
        searchConfig: search as Record<string, unknown> | undefined,
        runtimeMetadata: runtimeWebSearch,
      });
      if (!definition) {
        if (!allowFallback) {
          throw new Error(`web_search provider "${candidate.id}" is not available.`);
        }
        sawUnavailableProvider = true;
        continue;
      }
      return {
        provider: candidate.id,
        result: await definition.execute(params.args),
      };
    } catch (error) {
      lastError = error;
      if (!allowFallback) {
        throw error;
      }
    }
  }

  if (sawUnavailableProvider && lastError === undefined) {
    throw new Error("web_search is enabled but no provider is currently available.");
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/** Key of a provider tool definition's own declared observation (see `observeWebSearch`). */
export const WEB_SEARCH_OBSERVATION = Symbol.for("enclawed.tool-observation");

type DeclaredRequest = {
  type: "http";
  method: string;
  url: string;
  body?: string;
  read?: boolean;
  client?: string;
};

function isDeclaredRequest(value: unknown): value is DeclaredRequest {
  const r = value as Record<string, unknown> | null;
  return (
    !!r &&
    r.type === "http" &&
    typeof r.method === "string" &&
    typeof r.url === "string" &&
    (r.body === undefined || typeof r.body === "string")
  );
}

/**
 * The observation of a web_search call, for the egress action batcher: the
 * request the selected provider sends, as that provider declares it on its
 * tool definition (`WEB_SEARCH_OBSERVATION`: a function from the call's
 * arguments to the request, or null when the call sends nothing). When
 * providers may fall back to one another, the call may send every available
 * provider's request in order, so all of them are part of the observation.
 * Returns `{ type: "none" }` when the call sends no request at all (every
 * provider answers locally or fails before sending), and null when any
 * provider that could be used declares nothing: such a call has no
 * observation and the batcher does not key it.
 */
export async function observeWebSearch(
  params: RunWebSearchParams,
): Promise<
  | (DeclaredRequest & { also?: Array<{ method: string; url: string; body?: string }> })
  | { type: "none" }
  | null
> {
  const search = resolveSearchConfig(params.config);
  const runtimeWebSearch = params.runtimeWebSearch ?? getActiveRuntimeWebToolsMetadata()?.search;
  const candidates = resolveWebSearchCandidates({
    ...params,
    runtimeWebSearch,
    preferRuntimeProviders: params.preferRuntimeProviders ?? true,
  });
  const allowFallback = !hasExplicitWebSearchSelection({
    search,
    runtimeWebSearch,
    providerId: params.providerId,
    providers: candidates,
  });
  const requests: DeclaredRequest[] = [];
  for (const candidate of candidates) {
    let definition: WebSearchProviderToolDefinition | null;
    try {
      definition = candidate.createTool({
        config: params.config,
        searchConfig: search as Record<string, unknown> | undefined,
        runtimeMetadata: runtimeWebSearch,
      });
    } catch {
      if (!allowFallback) {
        break;
      }
      continue;
    }
    if (!definition) {
      if (!allowFallback) {
        break;
      }
      continue;
    }
    const declare = (definition as unknown as Record<symbol, unknown>)[WEB_SEARCH_OBSERVATION];
    if (typeof declare !== "function") {
      return null;
    }
    // Contract: the declaration returns the request the provider sends, null
    // when it answers without sending anything (its call then succeeds and no
    // fallback follows), and throws when its call fails before sending (the
    // next provider is then tried, as `runWebSearch` does).
    let request: unknown;
    try {
      request = await declare(params.args);
    } catch {
      if (!allowFallback) {
        break;
      }
      continue;
    }
    if (request === null) {
      break;
    }
    if (!isDeclaredRequest(request)) {
      return null;
    }
    requests.push(request);
    if (!allowFallback) {
      break;
    }
  }
  const [first, ...rest] = requests;
  if (!first) {
    // Nothing leaves: every usable provider answers locally or fails first.
    return { type: "none" };
  }
  const safe = (r: DeclaredRequest) =>
    r.read === true || ["GET", "HEAD", "OPTIONS"].includes(r.method.trim().toUpperCase());
  return {
    ...first,
    ...(requests.every(safe) ? { read: true } : { read: undefined }),
    ...(rest.length > 0
      ? {
          also: rest.map((r) => ({
            method: r.method,
            url: r.url,
            ...(r.body === undefined ? {} : { body: r.body }),
          })),
        }
      : {}),
  };
}

export const __testing = {
  resolveSearchConfig,
  resolveSearchProvider: resolveWebSearchProviderId,
  resolveWebSearchProviderId,
  resolveWebSearchCandidates,
  hasExplicitWebSearchSelection,
};
