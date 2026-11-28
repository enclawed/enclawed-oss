import { i as normalizeLowercaseStringOrEmpty } from "./string-coerce-BUSzWgUA.js";
import { n as findNormalizedProviderValue } from "./provider-id-DtGJ5VJz.js";
import { n as DEFAULT_MODEL, r as DEFAULT_PROVIDER } from "./defaults-Bvw4wDfw.js";
import { n as resolveAgentModelPrimaryValue, t as resolveAgentModelFallbackValues } from "./model-input-DJbMYxJG.js";
import { t as hasAnyAuthProfileStoreSource } from "./source-check-D-oEuH7m.js";
import { n as ensureAuthProfileStore } from "./store-BEvLnewG.js";
import { d as resolveConfiguredModelRef } from "./model-selection-BbR_dk2S.js";
import { t as resolveEnvApiKey } from "./model-auth-env-BFWoegJy.js";
import { n as estimateBase64DecodedBytes } from "./base64-DJbDulky.js";
import "./auth-profiles-BWmG-M7n.js";
import { n as listProfilesForProvider } from "./profiles-FqvT5frh.js";
import "./model-auth-Dv14QGJP.js";
import { t as extractAssistantText } from "./pi-embedded-utils-DQhNtSqD.js";
//#region src/agents/tools/model-config.helpers.ts
function hasToolModelConfig(model) {
	return Boolean(model?.primary?.trim() || (model?.fallbacks ?? []).some((entry) => entry.trim().length > 0));
}
function resolveDefaultModelRef(cfg) {
	if (cfg) {
		const resolved = resolveConfiguredModelRef({
			cfg,
			defaultProvider: DEFAULT_PROVIDER,
			defaultModel: DEFAULT_MODEL
		});
		return {
			provider: resolved.provider,
			model: resolved.model
		};
	}
	return {
		provider: DEFAULT_PROVIDER,
		model: DEFAULT_MODEL
	};
}
function hasAuthForProvider(params) {
	if (resolveEnvApiKey(params.provider)?.apiKey) return true;
	const agentDir = params.agentDir?.trim();
	if (!agentDir) return false;
	if (!hasAnyAuthProfileStoreSource(agentDir)) return false;
	return listProfilesForProvider(ensureAuthProfileStore(agentDir, { allowKeychainPrompt: false }), params.provider).length > 0;
}
function coerceToolModelConfig(model) {
	const primary = resolveAgentModelPrimaryValue(model);
	const fallbacks = resolveAgentModelFallbackValues(model);
	return {
		...primary?.trim() ? { primary: primary.trim() } : {},
		...fallbacks.length > 0 ? { fallbacks } : {}
	};
}
function buildToolModelConfigFromCandidates(params) {
	if (hasToolModelConfig(params.explicit)) return params.explicit;
	const deduped = [];
	for (const candidate of params.candidates) {
		const trimmed = candidate?.trim();
		if (!trimmed || !trimmed.includes("/")) continue;
		const provider = trimmed.slice(0, trimmed.indexOf("/")).trim();
		const providerConfigured = params.isProviderConfigured?.(provider) ?? hasAuthForProvider({
			provider,
			agentDir: params.agentDir
		});
		if (!provider || !providerConfigured) continue;
		if (!deduped.includes(trimmed)) deduped.push(trimmed);
	}
	if (deduped.length === 0) return null;
	return {
		primary: deduped[0],
		...deduped.length > 1 ? { fallbacks: deduped.slice(1) } : {}
	};
}
//#endregion
//#region src/agents/tools/image-tool.helpers.ts
function decodeDataUrl(dataUrl, opts) {
	const trimmed = dataUrl.trim();
	const match = /^data:([^;,]+);base64,([a-z0-9+/=\r\n]+)$/i.exec(trimmed);
	if (!match) throw new Error("Invalid data URL (expected base64 data: URL).");
	const mimeType = normalizeLowercaseStringOrEmpty(match[1]);
	if (!mimeType.startsWith("image/")) throw new Error(`Unsupported data URL type: ${mimeType || "unknown"}`);
	const b64 = (match[2] ?? "").trim();
	if (typeof opts?.maxBytes === "number" && estimateBase64DecodedBytes(b64) > opts.maxBytes) throw new Error("Invalid data URL: payload exceeds size limit.");
	const buffer = Buffer.from(b64, "base64");
	if (buffer.length === 0) throw new Error("Invalid data URL: empty payload.");
	return {
		buffer,
		mimeType,
		kind: "image"
	};
}
/**
* Returns true when the assistant message only contains reasoning/thinking
* content (no visible assistant text). The image-description retry path uses
* this to fall back to a "disable reasoning" request when an image model
* silently emitted reasoning blocks instead of a descriptive answer.
*/
function hasImageReasoningOnlyResponse(message) {
	if (extractAssistantText(message).trim().length > 0) return false;
	const content = message.content;
	if (!Array.isArray(content)) return false;
	return content.some((block) => block && typeof block === "object" && block.type === "thinking");
}
function coerceImageAssistantText(params) {
	const stop = params.message.stopReason;
	const errorMessage = params.message.errorMessage?.trim();
	if (stop === "error" || stop === "aborted") throw new Error(errorMessage ? `Image model failed (${params.provider}/${params.model}): ${errorMessage}` : `Image model failed (${params.provider}/${params.model})`);
	if (errorMessage) throw new Error(`Image model failed (${params.provider}/${params.model}): ${errorMessage}`);
	const text = extractAssistantText(params.message);
	if (text.trim()) return text.trim();
	throw new Error(`Image model returned no text (${params.provider}/${params.model}).`);
}
function coerceImageModelConfig(cfg) {
	return coerceToolModelConfig(cfg?.agents?.defaults?.imageModel);
}
function resolveProviderVisionModelFromConfig(params) {
	const id = ((findNormalizedProviderValue(params.cfg?.models?.providers, params.provider)?.models ?? []).find((m) => Boolean((m?.id ?? "").trim()) && m.input?.includes("image"))?.id ?? "").trim();
	return id ? `${params.provider}/${id}` : null;
}
//#endregion
export { resolveProviderVisionModelFromConfig as a, hasAuthForProvider as c, hasImageReasoningOnlyResponse as i, hasToolModelConfig as l, coerceImageModelConfig as n, buildToolModelConfigFromCandidates as o, decodeDataUrl as r, coerceToolModelConfig as s, coerceImageAssistantText as t, resolveDefaultModelRef as u };
