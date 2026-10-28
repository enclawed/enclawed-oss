import type { EnclawedConfig } from "@enclawed/plugin-sdk/config-types";
import { canResolveEnvSecretRefInReadOnlyPath } from "@enclawed/plugin-sdk/extension-shared";
import {
  coerceSecretRef,
  resolveNonEnvSecretRefApiKeyMarker,
} from "@enclawed/plugin-sdk/provider-auth";
import {
  readProviderEnvValue,
  resolveProviderWebSearchPluginConfig,
} from "@enclawed/plugin-sdk/provider-web-search";
import {
  normalizeSecretInputString,
  resolveSecretInputString,
} from "@enclawed/plugin-sdk/secret-input";

type XaiFallbackAuth = {
  apiKey: string;
  source: string;
};
const XAI_API_KEY_ENV_VAR = "XAI_API_KEY";

type ConfiguredRuntimeApiKeyResolution =
  | { status: "available"; value: string }
  | { status: "missing" }
  | { status: "blocked" };

function readConfiguredOrManagedApiKey(value: unknown): string | undefined {
  const literal = normalizeSecretInputString(value);
  if (literal) {
    return literal;
  }
  const ref = coerceSecretRef(value);
  return ref ? resolveNonEnvSecretRefApiKeyMarker(ref.source) : undefined;
}

function readLegacyGrokFallbackAuth(cfg?: EnclawedConfig): XaiFallbackAuth | undefined {
  const search = cfg?.tools?.web?.search;
  if (!search || typeof search !== "object") {
    return undefined;
  }
  const grok = (search as Record<string, unknown>).grok;
  const apiKey = readConfiguredOrManagedApiKey(
    grok && typeof grok === "object" ? (grok as Record<string, unknown>).apiKey : undefined,
  );
  return apiKey ? { apiKey, source: "tools.web.search.grok.apiKey" } : undefined;
}

function readConfiguredRuntimeApiKey(
  value: unknown,
  path: string,
  cfg?: EnclawedConfig,
): ConfiguredRuntimeApiKeyResolution {
  const resolved = resolveSecretInputString({
    value,
    path,
    defaults: cfg?.secrets?.defaults,
    mode: "inspect",
  });
  if (resolved.status === "available") {
    return { status: "available", value: resolved.value };
  }
  if (resolved.status === "missing") {
    return { status: "missing" };
  }
  if (resolved.ref.source !== "env") {
    return { status: "blocked" };
  }
  const envVarName = resolved.ref.id.trim();
  if (envVarName !== XAI_API_KEY_ENV_VAR) {
    return { status: "blocked" };
  }
  if (
    !canResolveEnvSecretRefInReadOnlyPath({
      cfg,
      provider: resolved.ref.provider,
      id: envVarName,
    })
  ) {
    return { status: "blocked" };
  }
  const envValue = normalizeSecretInputString(process.env[envVarName]);
  return envValue ? { status: "available", value: envValue } : { status: "missing" };
}

function readLegacyGrokApiKeyResult(cfg?: EnclawedConfig): ConfiguredRuntimeApiKeyResolution {
  const search = cfg?.tools?.web?.search;
  if (!search || typeof search !== "object") {
    return { status: "missing" };
  }
  const grok = (search as Record<string, unknown>).grok;
  return readConfiguredRuntimeApiKey(
    grok && typeof grok === "object" ? (grok as Record<string, unknown>).apiKey : undefined,
    "tools.web.search.grok.apiKey",
    cfg,
  );
}

function readPluginXaiWebSearchApiKeyResult(
  cfg?: EnclawedConfig,
): ConfiguredRuntimeApiKeyResolution {
  return readConfiguredRuntimeApiKey(
    resolveProviderWebSearchPluginConfig(cfg as Record<string, unknown> | undefined, "xai")?.apiKey,
    "plugins.entries.xai.config.webSearch.apiKey",
    cfg,
  );
}

export function resolveFallbackXaiAuth(cfg?: EnclawedConfig): XaiFallbackAuth | undefined {
  const pluginApiKey = readConfiguredOrManagedApiKey(
    resolveProviderWebSearchPluginConfig(cfg as Record<string, unknown> | undefined, "xai")?.apiKey,
  );
  if (pluginApiKey) {
    return {
      apiKey: pluginApiKey,
      source: "plugins.entries.xai.config.webSearch.apiKey",
    };
  }
  return readLegacyGrokFallbackAuth(cfg);
}

export function resolveFallbackXaiApiKey(cfg?: EnclawedConfig): string | undefined {
  const plugin = readPluginXaiWebSearchApiKeyResult(cfg);
  if (plugin.status === "available") {
    return plugin.value;
  }
  if (plugin.status === "blocked") {
    return undefined;
  }
  const legacy = readLegacyGrokApiKeyResult(cfg);
  return legacy.status === "available" ? legacy.value : undefined;
}

export function resolveXaiToolApiKey(params: {
  runtimeConfig?: EnclawedConfig;
  sourceConfig?: EnclawedConfig;
}): string | undefined {
  const runtimePlugin = readPluginXaiWebSearchApiKeyResult(params.runtimeConfig);
  if (runtimePlugin.status === "available") {
    return runtimePlugin.value;
  }
  if (runtimePlugin.status === "blocked") {
    return undefined;
  }
  const runtimeLegacy = readLegacyGrokApiKeyResult(params.runtimeConfig);
  if (runtimeLegacy.status === "available") {
    return runtimeLegacy.value;
  }
  if (runtimeLegacy.status === "blocked") {
    return undefined;
  }
  const sourcePlugin = readPluginXaiWebSearchApiKeyResult(params.sourceConfig);
  if (sourcePlugin.status === "available") {
    return sourcePlugin.value;
  }
  if (sourcePlugin.status === "blocked") {
    return undefined;
  }
  const sourceLegacy = readLegacyGrokApiKeyResult(params.sourceConfig);
  if (sourceLegacy.status === "available") {
    return sourceLegacy.value;
  }
  if (sourceLegacy.status === "blocked") {
    return undefined;
  }
  return readProviderEnvValue([XAI_API_KEY_ENV_VAR]);
}

export function isXaiToolEnabled(params: {
  enabled?: boolean;
  runtimeConfig?: EnclawedConfig;
  sourceConfig?: EnclawedConfig;
}): boolean {
  if (params.enabled === false) {
    return false;
  }
  return Boolean(resolveXaiToolApiKey(params));
}
