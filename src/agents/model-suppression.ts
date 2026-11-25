import type { EnclawedConfig } from "../config/types.enclawed.js";
import { resolveProviderBuiltInModelSuppression } from "../plugins/provider-runtime.js";
import { normalizeLowercaseStringOrEmpty } from "../shared/string-coerce.js";
import {
  buildDeniedModelProviderError,
  isDeniedModelProviderRef,
} from "./model-provider-denylist.js";
import { normalizeProviderId } from "./provider-id.js";

function resolveBuiltInModelSuppression(params: {
  provider?: string | null;
  id?: string | null;
  baseUrl?: string | null;
  config?: EnclawedConfig;
}) {
  // Policy denial runs before plugin hooks and does not need a model id, so a
  // denied provider can never be listed, selected, or resolved.
  if (isDeniedModelProviderRef({ provider: params.provider, baseUrl: params.baseUrl })) {
    return {
      suppress: true,
      errorMessage: buildDeniedModelProviderError(params.provider),
    };
  }
  const provider = normalizeProviderId(params.provider ?? "");
  const modelId = normalizeLowercaseStringOrEmpty(params.id);
  if (!provider || !modelId) {
    return undefined;
  }
  return resolveProviderBuiltInModelSuppression({
    ...(params.config ? { config: params.config } : {}),
    env: process.env,
    context: {
      ...(params.config ? { config: params.config } : {}),
      env: process.env,
      provider,
      modelId,
      ...(params.baseUrl ? { baseUrl: params.baseUrl } : {}),
    },
  });
}

export function shouldSuppressBuiltInModel(params: {
  provider?: string | null;
  id?: string | null;
  baseUrl?: string | null;
  config?: EnclawedConfig;
}) {
  return resolveBuiltInModelSuppression(params)?.suppress ?? false;
}

export function buildSuppressedBuiltInModelError(params: {
  provider?: string | null;
  id?: string | null;
  baseUrl?: string | null;
  config?: EnclawedConfig;
}): string | undefined {
  return resolveBuiltInModelSuppression(params)?.errorMessage;
}
