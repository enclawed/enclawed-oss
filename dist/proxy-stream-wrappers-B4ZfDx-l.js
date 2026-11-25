import { d as readStringValue, i as normalizeLowercaseStringOrEmpty, o as normalizeOptionalLowercaseString } from "./string-coerce-BUSzWgUA.js";
import { a as resolveProviderRequestPolicy } from "./provider-attribution-DS_eIFrA.js";
import { r as streamWithPayloadPatch } from "./moonshot-thinking-stream-wrappers-Cv1vh-V8.js";
import { E as isAnthropicModelRef, O as applyAnthropicEphemeralCacheControlMarkers, y as stripNullHeaderValues } from "./provider-stream-shared-CqZkNfYb.js";
import { o as patchCodexNativeWebSearchPayload, s as resolveCodexNativeSearchActivation } from "./codex-native-web-search-BBUV9pgl.js";
import { n as resolveOpenAIResponsesPayloadPolicy, r as flattenCompletionMessagesToStringContent, t as applyOpenAIResponsesPayloadPolicy } from "./openai-responses-payload-policy-CLuLsCOJ.js";
import { l as resolveProviderRequestPolicyConfig } from "./provider-request-config-BytRZKWq.js";
import { t as log } from "./logger-QvWAYLSb.js";
import { l as isProxyReasoningUnsupportedModelHint } from "./provider-model-shared-Chi1KYWw.js";
import { streamSimple } from "@mariozechner/pi-ai/compat";
//#region src/agents/pi-embedded-runner/openai-stream-wrappers.ts
function resolveOpenAIRequestCapabilities(model) {
	return resolveProviderRequestPolicyConfig({
		provider: readStringValue(model.provider),
		api: readStringValue(model.api),
		baseUrl: readStringValue(model.baseUrl),
		compat: model.compat,
		capability: "llm",
		transport: "stream"
	}).capabilities;
}
function shouldApplyOpenAIAttributionHeaders(model) {
	const attributionProvider = resolveOpenAIRequestCapabilities(model).attributionProvider;
	return attributionProvider === "openai" || attributionProvider === "openai-codex" ? attributionProvider : void 0;
}
function shouldApplyOpenAIServiceTier(model) {
	return resolveOpenAIResponsesPayloadPolicy(model, { storeMode: "disable" }).allowsServiceTier;
}
function shouldApplyOpenAIReasoningCompatibility(model) {
	const api = readStringValue(model.api);
	const provider = readStringValue(model.provider);
	if (!api || !provider) return false;
	return resolveOpenAIRequestCapabilities(model).supportsOpenAIReasoningCompatPayload;
}
function shouldFlattenOpenAICompletionMessages(model) {
	const compat = model.compat && typeof model.compat === "object" ? model.compat : void 0;
	return model.api === "openai-completions" && compat?.requiresStringContent === true;
}
function normalizeOpenAIServiceTier(value) {
	if (typeof value !== "string") return;
	const normalized = normalizeOptionalLowercaseString(value);
	if (normalized === "auto" || normalized === "default" || normalized === "flex" || normalized === "priority") return normalized;
}
function resolveOpenAIServiceTier(extraParams) {
	const raw = extraParams?.serviceTier ?? extraParams?.service_tier;
	const normalized = normalizeOpenAIServiceTier(raw);
	if (raw !== void 0 && normalized === void 0) {
		const rawSummary = typeof raw === "string" ? raw : typeof raw;
		log.warn(`ignoring invalid OpenAI service tier param: ${rawSummary}`);
	}
	return normalized;
}
function normalizeOpenAITextVerbosity(value) {
	if (typeof value !== "string") return;
	const normalized = normalizeOptionalLowercaseString(value);
	if (normalized === "low" || normalized === "medium" || normalized === "high") return normalized;
}
function resolveOpenAITextVerbosity(extraParams) {
	const raw = extraParams?.textVerbosity ?? extraParams?.text_verbosity;
	const normalized = normalizeOpenAITextVerbosity(raw);
	if (raw !== void 0 && normalized === void 0) {
		const rawSummary = typeof raw === "string" ? raw : typeof raw;
		log.warn(`ignoring invalid OpenAI text verbosity param: ${rawSummary}`);
	}
	return normalized;
}
function normalizeOpenAIFastMode(value) {
	if (typeof value === "boolean") return value;
	const normalized = normalizeOptionalLowercaseString(value);
	if (!normalized) return;
	if (normalized === "on" || normalized === "true" || normalized === "yes" || normalized === "1" || normalized === "fast") return true;
	if (normalized === "off" || normalized === "false" || normalized === "no" || normalized === "0" || normalized === "normal") return false;
}
function resolveOpenAIFastMode(extraParams) {
	const raw = extraParams?.fastMode ?? extraParams?.fast_mode;
	const normalized = normalizeOpenAIFastMode(raw);
	if (raw !== void 0 && normalized === void 0) {
		const rawSummary = typeof raw === "string" ? raw : typeof raw;
		log.warn(`ignoring invalid OpenAI fast mode param: ${rawSummary}`);
	}
	return normalized;
}
function applyOpenAIFastModePayloadOverrides(params) {
	if (params.payloadObj.service_tier === void 0 && shouldApplyOpenAIServiceTier(params.model)) params.payloadObj.service_tier = "priority";
}
function createOpenAIResponsesContextManagementWrapper(baseStreamFn, extraParams) {
	const underlying = baseStreamFn ?? streamSimple;
	return (model, context, options) => {
		const policy = resolveOpenAIResponsesPayloadPolicy(model, {
			extraParams,
			enablePromptCacheStripping: true,
			enableServerCompaction: true,
			storeMode: "provider-policy"
		});
		if (policy.explicitStore === void 0 && !policy.useServerCompaction && !policy.shouldStripStore && !policy.shouldStripPromptCache && !policy.shouldStripDisabledReasoningPayload) return underlying(model, context, options);
		const originalOnPayload = options?.onPayload;
		return underlying(model, context, {
			...options,
			onPayload: (payload) => {
				if (payload && typeof payload === "object") applyOpenAIResponsesPayloadPolicy(payload, policy);
				return originalOnPayload?.(payload, model);
			}
		});
	};
}
function createOpenAIReasoningCompatibilityWrapper(baseStreamFn) {
	const underlying = baseStreamFn ?? streamSimple;
	return (model, context, options) => {
		if (!shouldApplyOpenAIReasoningCompatibility(model)) return underlying(model, context, options);
		return streamWithPayloadPatch(underlying, model, context, options, (payloadObj) => {
			applyOpenAIResponsesPayloadPolicy(payloadObj, resolveOpenAIResponsesPayloadPolicy(model, { storeMode: "preserve" }));
		});
	};
}
function createOpenAIStringContentWrapper(baseStreamFn) {
	const underlying = baseStreamFn ?? streamSimple;
	return (model, context, options) => {
		if (!shouldFlattenOpenAICompletionMessages(model)) return underlying(model, context, options);
		return streamWithPayloadPatch(underlying, model, context, options, (payloadObj) => {
			if (!Array.isArray(payloadObj.messages)) return;
			payloadObj.messages = flattenCompletionMessagesToStringContent(payloadObj.messages);
		});
	};
}
function createOpenAIFastModeWrapper(baseStreamFn) {
	const underlying = baseStreamFn ?? streamSimple;
	return (model, context, options) => {
		if (model.api !== "openai-responses" && model.api !== "openai-codex-responses" && model.api !== "azure-openai-responses" || model.provider !== "openai" && model.provider !== "openai-codex") return underlying(model, context, options);
		const originalOnPayload = options?.onPayload;
		return underlying(model, context, {
			...options,
			onPayload: (payload) => {
				if (payload && typeof payload === "object") applyOpenAIFastModePayloadOverrides({
					payloadObj: payload,
					model
				});
				return originalOnPayload?.(payload, model);
			}
		});
	};
}
function createOpenAIServiceTierWrapper(baseStreamFn, serviceTier) {
	const underlying = baseStreamFn ?? streamSimple;
	return (model, context, options) => {
		if (!shouldApplyOpenAIServiceTier(model)) return underlying(model, context, options);
		return streamWithPayloadPatch(underlying, model, context, options, (payloadObj) => {
			if (payloadObj.service_tier === void 0) payloadObj.service_tier = serviceTier;
		});
	};
}
function createOpenAITextVerbosityWrapper(baseStreamFn, verbosity) {
	const underlying = baseStreamFn ?? streamSimple;
	return (model, context, options) => {
		if (model.api !== "openai-responses" && model.api !== "openai-codex-responses") return underlying(model, context, options);
		const shouldOverrideExistingVerbosity = model.api === "openai-codex-responses";
		const originalOnPayload = options?.onPayload;
		return underlying(model, context, {
			...options,
			onPayload: (payload) => {
				if (payload && typeof payload === "object") {
					const payloadObj = payload;
					const existingText = payloadObj.text && typeof payloadObj.text === "object" ? payloadObj.text : {};
					if (shouldOverrideExistingVerbosity || existingText.verbosity === void 0) payloadObj.text = {
						...existingText,
						verbosity
					};
				}
				return originalOnPayload?.(payload, model);
			}
		});
	};
}
function createCodexNativeWebSearchWrapper(baseStreamFn, params) {
	const underlying = baseStreamFn ?? streamSimple;
	return (model, context, options) => {
		const activation = resolveCodexNativeSearchActivation({
			config: params.config,
			modelProvider: readStringValue(model.provider),
			modelApi: readStringValue(model.api),
			agentDir: params.agentDir
		});
		if (activation.state !== "native_active") {
			if (activation.codexNativeEnabled) log.debug(`skipping Codex native web search (${activation.inactiveReason ?? "inactive"}) for ${model.provider ?? "unknown"}/${model.id ?? "unknown"}`);
			return underlying(model, context, options);
		}
		log.debug(`activating Codex native web search (${activation.codexMode}) for ${model.provider ?? "unknown"}/${model.id ?? "unknown"}`);
		const originalOnPayload = options?.onPayload;
		return underlying(model, context, {
			...options,
			onPayload: (payload) => {
				const result = patchCodexNativeWebSearchPayload({
					payload,
					config: params.config
				});
				if (result.status === "payload_not_object") log.debug("Skipping Codex native web search injection because provider payload is not an object");
				else if (result.status === "native_tool_already_present") log.debug("Codex native web search tool already present in provider payload");
				else if (result.status === "injected") log.debug("Injected Codex native web search tool into provider payload");
				return originalOnPayload?.(payload, model);
			}
		});
	};
}
function createOpenAIDefaultTransportWrapper(baseStreamFn) {
	const underlying = baseStreamFn ?? streamSimple;
	return (model, context, options) => {
		const typedOptions = options;
		return underlying(model, context, {
			...options,
			transport: options?.transport ?? "auto",
			openaiWsWarmup: typedOptions?.openaiWsWarmup ?? true
		});
	};
}
function createOpenAIAttributionHeadersWrapper(baseStreamFn) {
	const underlying = baseStreamFn ?? streamSimple;
	return (model, context, options) => {
		const attributionProvider = shouldApplyOpenAIAttributionHeaders(model);
		if (!attributionProvider) return underlying(model, context, options);
		return underlying(model, context, {
			...options,
			headers: resolveProviderRequestPolicyConfig({
				provider: attributionProvider,
				api: readStringValue(model.api),
				baseUrl: readStringValue(model.baseUrl),
				capability: "llm",
				transport: "stream",
				callerHeaders: stripNullHeaderValues(options?.headers),
				precedence: "defaults-win"
			}).headers
		});
	};
}
//#endregion
//#region src/agents/pi-embedded-runner/google-stream-wrappers.ts
function isGemini31Model(modelId) {
	const normalized = normalizeLowercaseStringOrEmpty(modelId);
	return normalized.includes("gemini-3.1-pro") || normalized.includes("gemini-3.1-flash");
}
function isGemma4Model(modelId) {
	return normalizeLowercaseStringOrEmpty(modelId).startsWith("gemma-4");
}
function mapThinkLevelToGoogleThinkingLevel(thinkingLevel) {
	switch (thinkingLevel) {
		case "minimal": return "MINIMAL";
		case "low": return "LOW";
		case "medium":
		case "adaptive": return "MEDIUM";
		case "high":
		case "xhigh": return "HIGH";
		default: return;
	}
}
function mapThinkLevelToGemma4ThinkingLevel(thinkingLevel) {
	switch (thinkingLevel) {
		case "off": return;
		case "minimal":
		case "low": return "MINIMAL";
		case "medium":
		case "adaptive":
		case "high":
		case "xhigh": return "HIGH";
		default: return;
	}
}
function normalizeGemma4ThinkingLevel(value) {
	if (typeof value !== "string") return;
	switch (value.trim().toUpperCase()) {
		case "MINIMAL":
		case "LOW": return "MINIMAL";
		case "MEDIUM":
		case "HIGH": return "HIGH";
		default: return;
	}
}
function sanitizeGoogleThinkingPayload(params) {
	if (!params.payload || typeof params.payload !== "object") return;
	const config = params.payload.config;
	if (!config || typeof config !== "object") return;
	const configObj = config;
	const thinkingConfig = configObj.thinkingConfig;
	if (!thinkingConfig || typeof thinkingConfig !== "object") return;
	const thinkingConfigObj = thinkingConfig;
	if (typeof params.modelId === "string" && isGemma4Model(params.modelId)) {
		const normalizedThinkingLevel = normalizeGemma4ThinkingLevel(thinkingConfigObj.thinkingLevel);
		const explicitMappedLevel = mapThinkLevelToGemma4ThinkingLevel(params.thinkingLevel);
		const disabledViaBudget = typeof thinkingConfigObj.thinkingBudget === "number" && thinkingConfigObj.thinkingBudget <= 0;
		const hadThinkingBudget = thinkingConfigObj.thinkingBudget !== void 0;
		delete thinkingConfigObj.thinkingBudget;
		if (params.thinkingLevel === "off" || disabledViaBudget && explicitMappedLevel === void 0 && !normalizedThinkingLevel) {
			delete thinkingConfigObj.thinkingLevel;
			if (Object.keys(thinkingConfigObj).length === 0) delete configObj.thinkingConfig;
			return;
		}
		const mappedLevel = explicitMappedLevel ?? normalizedThinkingLevel ?? (hadThinkingBudget ? "MINIMAL" : void 0);
		if (mappedLevel) thinkingConfigObj.thinkingLevel = mappedLevel;
		return;
	}
	const thinkingBudget = thinkingConfigObj.thinkingBudget;
	if (typeof thinkingBudget !== "number" || thinkingBudget >= 0) return;
	delete thinkingConfigObj.thinkingBudget;
	if (typeof params.modelId === "string" && isGemini31Model(params.modelId) && params.thinkingLevel && params.thinkingLevel !== "off" && thinkingConfigObj.thinkingLevel === void 0) {
		const mappedLevel = mapThinkLevelToGoogleThinkingLevel(params.thinkingLevel);
		if (mappedLevel) thinkingConfigObj.thinkingLevel = mappedLevel;
	}
}
function createGoogleThinkingPayloadWrapper(baseStreamFn, thinkingLevel) {
	const underlying = baseStreamFn ?? streamSimple;
	return (model, context, options) => {
		return streamWithPayloadPatch(underlying, model, context, options, (payload) => {
			if (model.api === "google-generative-ai") sanitizeGoogleThinkingPayload({
				payload,
				modelId: model.id,
				thinkingLevel
			});
		});
	};
}
//#endregion
//#region src/agents/pi-embedded-runner/proxy-stream-wrappers.ts
const KILOCODE_FEATURE_HEADER = "X-KILOCODE-FEATURE";
const KILOCODE_FEATURE_ENV_VAR = "KILOCODE_FEATURE";
function resolveKilocodeAppHeaders() {
	const feature = process.env[KILOCODE_FEATURE_ENV_VAR]?.trim();
	return feature ? { [KILOCODE_FEATURE_HEADER]: feature } : void 0;
}
function mapThinkingLevelToOpenRouterReasoningEffort(thinkingLevel) {
	if (thinkingLevel === "off") return "none";
	if (thinkingLevel === "adaptive") return "medium";
	if (thinkingLevel === "max") return "xhigh";
	return thinkingLevel;
}
function normalizeProxyReasoningPayload(payload, thinkingLevel) {
	if (!payload || typeof payload !== "object") return;
	const payloadObj = payload;
	delete payloadObj.reasoning_effort;
	if (!thinkingLevel || thinkingLevel === "off") return;
	const existingReasoning = payloadObj.reasoning;
	if (existingReasoning && typeof existingReasoning === "object" && !Array.isArray(existingReasoning)) {
		const reasoningObj = existingReasoning;
		if (!("max_tokens" in reasoningObj) && !("effort" in reasoningObj)) reasoningObj.effort = mapThinkingLevelToOpenRouterReasoningEffort(thinkingLevel);
	} else if (!existingReasoning) payloadObj.reasoning = { effort: mapThinkingLevelToOpenRouterReasoningEffort(thinkingLevel) };
}
function createOpenRouterSystemCacheWrapper(baseStreamFn) {
	const underlying = baseStreamFn ?? streamSimple;
	return (model, context, options) => {
		const provider = readStringValue(model.provider);
		const modelId = readStringValue(model.id);
		const endpointClass = resolveProviderRequestPolicy({
			provider,
			api: readStringValue(model.api),
			baseUrl: readStringValue(model.baseUrl),
			capability: "llm",
			transport: "stream"
		}).endpointClass;
		if (!modelId || !isAnthropicModelRef(modelId) || !(endpointClass === "openrouter" || endpointClass === "default" && normalizeOptionalLowercaseString(provider) === "openrouter")) return underlying(model, context, options);
		return streamWithPayloadPatch(underlying, model, context, options, (payloadObj) => {
			applyAnthropicEphemeralCacheControlMarkers(payloadObj);
		});
	};
}
function createOpenRouterWrapper(baseStreamFn, thinkingLevel) {
	const underlying = baseStreamFn ?? streamSimple;
	return (model, context, options) => {
		const headers = resolveProviderRequestPolicyConfig({
			provider: readStringValue(model.provider) ?? "openrouter",
			api: readStringValue(model.api),
			baseUrl: readStringValue(model.baseUrl),
			capability: "llm",
			transport: "stream",
			callerHeaders: stripNullHeaderValues(options?.headers),
			precedence: "caller-wins"
		}).headers;
		return streamWithPayloadPatch(underlying, model, context, {
			...options,
			headers
		}, (payload) => {
			normalizeProxyReasoningPayload(payload, thinkingLevel);
		});
	};
}
function isProxyReasoningUnsupported(modelId) {
	return isProxyReasoningUnsupportedModelHint(modelId);
}
function createKilocodeWrapper(baseStreamFn, thinkingLevel) {
	const underlying = baseStreamFn ?? streamSimple;
	return (model, context, options) => {
		const headers = resolveProviderRequestPolicyConfig({
			provider: readStringValue(model.provider) ?? "kilocode",
			api: readStringValue(model.api),
			baseUrl: readStringValue(model.baseUrl),
			capability: "llm",
			transport: "stream",
			callerHeaders: stripNullHeaderValues(options?.headers),
			providerHeaders: resolveKilocodeAppHeaders(),
			precedence: "defaults-win"
		}).headers;
		return streamWithPayloadPatch(underlying, model, context, {
			...options,
			headers
		}, (payload) => {
			normalizeProxyReasoningPayload(payload, thinkingLevel);
		});
	};
}
//#endregion
export { resolveOpenAIServiceTier as _, createGoogleThinkingPayloadWrapper as a, createOpenAIAttributionHeadersWrapper as c, createOpenAIReasoningCompatibilityWrapper as d, createOpenAIResponsesContextManagementWrapper as f, resolveOpenAIFastMode as g, createOpenAITextVerbosityWrapper as h, isProxyReasoningUnsupported as i, createOpenAIDefaultTransportWrapper as l, createOpenAIStringContentWrapper as m, createOpenRouterSystemCacheWrapper as n, sanitizeGoogleThinkingPayload as o, createOpenAIServiceTierWrapper as p, createOpenRouterWrapper as r, createCodexNativeWebSearchWrapper as s, createKilocodeWrapper as t, createOpenAIFastModeWrapper as u, resolveOpenAITextVerbosity as v };
