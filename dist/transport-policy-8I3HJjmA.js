import { i as normalizeLowercaseStringOrEmpty } from "./string-coerce-BUSzWgUA.js";
import { r as normalizeProviderId } from "./provider-id-JqYiEozY.js";
import "./provider-model-shared-B5LoHGGO.js";
import "./text-runtime-BSsrP5ac.js";
import { i as isOpenAICodexBaseUrl, r as isOpenAIApiBaseUrl } from "./base-url-DrQuHBCg.js";
//#region extensions/openai/transport-policy.ts
const DEFAULT_OPENAI_WS_DEGRADE_COOLDOWN_MS = 6e4;
const AZURE_PROVIDER_IDS = new Set(["azure-openai", "azure-openai-responses"]);
const OPENAI_CODEX_PROVIDER_ID = "openai-codex";
function isAzureOpenAIBaseUrl(baseUrl) {
	const trimmed = baseUrl?.trim();
	if (!trimmed) return false;
	try {
		return normalizeLowercaseStringOrEmpty(new URL(trimmed).hostname).endsWith(".openai.azure.com");
	} catch {
		return false;
	}
}
function normalizeIdentityValue(value, maxLength = 160) {
	const trimmed = value.trim().replace(/[\r\n]+/g, " ");
	return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
}
function usesKnownNativeOpenAIRoute(provider, baseUrl) {
	const normalizedProvider = normalizeProviderId(provider);
	if (!normalizedProvider) return false;
	if (normalizedProvider === "openai") return !baseUrl || isOpenAIApiBaseUrl(baseUrl);
	if (AZURE_PROVIDER_IDS.has(normalizedProvider)) return !baseUrl || isAzureOpenAIBaseUrl(baseUrl);
	if (normalizedProvider === OPENAI_CODEX_PROVIDER_ID) return !baseUrl || isOpenAIApiBaseUrl(baseUrl) || isOpenAICodexBaseUrl(baseUrl);
	return false;
}
function resolveSessionHeaders(params) {
	if (!params.sessionId || !usesKnownNativeOpenAIRoute(params.provider, params.baseUrl)) return;
	const sessionId = normalizeIdentityValue(params.sessionId);
	if (!sessionId) return;
	return {
		"x-client-request-id": sessionId,
		"x-enclawed-session-id": sessionId
	};
}
function resolveOpenAITransportTurnState(ctx) {
	const sessionHeaders = resolveSessionHeaders({
		provider: ctx.provider,
		baseUrl: ctx.model?.baseUrl,
		sessionId: ctx.sessionId
	});
	if (!sessionHeaders) return;
	const turnId = normalizeIdentityValue(ctx.turnId);
	const attempt = String(Math.max(1, ctx.attempt));
	return {
		headers: {
			...sessionHeaders,
			"x-enclawed-turn-id": turnId,
			"x-enclawed-turn-attempt": attempt
		},
		metadata: {
			enclawed_session_id: sessionHeaders["x-enclawed-session-id"] ?? "",
			enclawed_turn_id: turnId,
			enclawed_turn_attempt: attempt,
			enclawed_transport: ctx.transport
		}
	};
}
function resolveOpenAIWebSocketSessionPolicy(ctx) {
	if (!usesKnownNativeOpenAIRoute(ctx.provider, ctx.model?.baseUrl)) return;
	return {
		headers: resolveSessionHeaders({
			provider: ctx.provider,
			baseUrl: ctx.model?.baseUrl,
			sessionId: ctx.sessionId
		}),
		degradeCooldownMs: DEFAULT_OPENAI_WS_DEGRADE_COOLDOWN_MS
	};
}
//#endregion
export { resolveOpenAIWebSocketSessionPolicy as n, resolveOpenAITransportTurnState as t };
