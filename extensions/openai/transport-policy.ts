import type {
  ProviderResolveTransportTurnStateContext,
  ProviderResolveWebSocketSessionPolicyContext,
  ProviderTransportTurnState,
  ProviderWebSocketSessionPolicy,
} from "@enclawed/plugin-sdk/plugin-entry";
import { normalizeProviderId } from "@enclawed/plugin-sdk/provider-model-shared";
import { normalizeLowercaseStringOrEmpty } from "@enclawed/plugin-sdk/text-runtime";
import { isOpenAIApiBaseUrl, isOpenAICodexBaseUrl } from "./base-url.js";

const DEFAULT_OPENAI_WS_DEGRADE_COOLDOWN_MS = 60_000;
const AZURE_PROVIDER_IDS = new Set(["azure-openai", "azure-openai-responses"]);
const OPENAI_CODEX_PROVIDER_ID = "openai-codex";

function isAzureOpenAIBaseUrl(baseUrl?: string): boolean {
  const trimmed = baseUrl?.trim();
  if (!trimmed) {
    return false;
  }
  try {
    return normalizeLowercaseStringOrEmpty(new URL(trimmed).hostname).endsWith(".openai.azure.com");
  } catch {
    return false;
  }
}

function normalizeIdentityValue(value: string, maxLength = 160): string {
  const trimmed = value.trim().replace(/[\r\n]+/g, " ");
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
}

function usesKnownNativeOpenAIRoute(provider: string, baseUrl?: string): boolean {
  const normalizedProvider = normalizeProviderId(provider);
  if (!normalizedProvider) {
    return false;
  }
  if (normalizedProvider === "openai") {
    return !baseUrl || isOpenAIApiBaseUrl(baseUrl);
  }
  if (AZURE_PROVIDER_IDS.has(normalizedProvider)) {
    return !baseUrl || isAzureOpenAIBaseUrl(baseUrl);
  }
  if (normalizedProvider === OPENAI_CODEX_PROVIDER_ID) {
    return !baseUrl || isOpenAIApiBaseUrl(baseUrl) || isOpenAICodexBaseUrl(baseUrl);
  }
  return false;
}

function resolveSessionHeaders(params: {
  provider: string;
  baseUrl?: string;
  sessionId?: string;
}): Record<string, string> | undefined {
  if (!params.sessionId || !usesKnownNativeOpenAIRoute(params.provider, params.baseUrl)) {
    return undefined;
  }
  const sessionId = normalizeIdentityValue(params.sessionId);
  if (!sessionId) {
    return undefined;
  }
  // Only OpenAI's documented request-correlation header; no product-named
  // headers leave the process.
  return {
    "x-client-request-id": sessionId,
  };
}

export function resolveOpenAITransportTurnState(
  ctx: ProviderResolveTransportTurnStateContext,
): ProviderTransportTurnState | undefined {
  const sessionHeaders = resolveSessionHeaders({
    provider: ctx.provider,
    baseUrl: ctx.model?.baseUrl,
    sessionId: ctx.sessionId,
  });
  if (!sessionHeaders) {
    return undefined;
  }

  const turnId = normalizeIdentityValue(ctx.turnId);
  const attempt = String(Math.max(1, ctx.attempt));

  return {
    headers: {
      ...sessionHeaders,
    },
    metadata: {
      session_id: sessionHeaders["x-client-request-id"] ?? "",
      turn_id: turnId,
      turn_attempt: attempt,
      transport: ctx.transport,
    },
  };
}

export function resolveOpenAIWebSocketSessionPolicy(
  ctx: ProviderResolveWebSocketSessionPolicyContext,
): ProviderWebSocketSessionPolicy | undefined {
  if (!usesKnownNativeOpenAIRoute(ctx.provider, ctx.model?.baseUrl)) {
    return undefined;
  }
  return {
    headers: resolveSessionHeaders({
      provider: ctx.provider,
      baseUrl: ctx.model?.baseUrl,
      sessionId: ctx.sessionId,
    }),
    degradeCooldownMs: DEFAULT_OPENAI_WS_DEGRADE_COOLDOWN_MS,
  };
}
