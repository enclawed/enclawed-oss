import { l as isRecord } from "./utils-BcQ7uNrT.js";
import { t as formatCliCommand } from "./command-format-Dyt7cO_V.js";
import { d as readNumberParam, h as readStringParam } from "./common-C_zplWg2.js";
import { a as wrapWebContent } from "./external-content-DghcB2zW.js";
import { i as readCache, l as writeCache, o as resolveCacheTtlMs, r as normalizeCacheKey, s as resolveTimeoutSeconds } from "./web-shared-3bF8sfq3.js";
import { u as postTrustedWebToolsJson } from "./web-search-provider-common-DjoWUCZ5.js";
import { i as resolveProviderWebSearchPluginConfig, r as mergeScopedSearchConfig, t as getScopedCredentialValue } from "./web-search-provider-config-CppJiggW.js";
import { n as resolveWebSearchProviderCredential } from "./provider-web-search-uD8kycr8.js";
import { t as normalizeXaiModelId } from "./model-id-DW6Nkzlh.js";
import "./tool-config-shared-D8BBwUal.js";
import { n as setPluginXSearchConfigValue, t as resolveEffectiveXSearchConfig } from "./x-search-config-DhJFkp5n.js";
import { a as resolveXaiResponseTextCitationsAndInline, n as buildXaiResponsesToolBody, r as extractXaiWebSearchContent, t as XAI_RESPONSES_ENDPOINT } from "./responses-tool-shared-Bz8Orzmc.js";
import { t as XAI_DEFAULT_X_SEARCH_MODEL } from "./x-search-shared-hoxKD-ky.js";
//#region extensions/xai/src/web-search-shared.ts
const XAI_WEB_SEARCH_ENDPOINT = XAI_RESPONSES_ENDPOINT;
const XAI_DEFAULT_WEB_SEARCH_MODEL = "grok-4-1-fast";
function buildXaiWebSearchPayload(params) {
	return {
		query: params.query,
		provider: params.provider,
		model: params.model,
		tookMs: params.tookMs,
		externalContent: {
			untrusted: true,
			source: "web_search",
			provider: params.provider,
			wrapped: true
		},
		content: wrapWebContent(params.content, "web_search"),
		citations: params.citations,
		...params.inlineCitations ? { inlineCitations: params.inlineCitations } : {}
	};
}
function resolveXaiSearchConfig(searchConfig) {
	return (isRecord(searchConfig?.grok) ? searchConfig.grok : void 0) ?? {};
}
function resolveXaiWebSearchModel(searchConfig) {
	const config = resolveXaiSearchConfig(searchConfig);
	return typeof config.model === "string" && config.model.trim() ? normalizeXaiModelId(config.model.trim()) : XAI_DEFAULT_WEB_SEARCH_MODEL;
}
function resolveXaiInlineCitations(searchConfig) {
	return resolveXaiSearchConfig(searchConfig).inlineCitations === true;
}
/**
* The web search request (URL and body object, serialized by
* `postTrustedWebToolsJson` as JSON.stringify; no credentials), shared by the
* call and its declared observation.
*/
function buildXaiWebSearchRequest(params) {
	return {
		url: XAI_WEB_SEARCH_ENDPOINT,
		body: buildXaiResponsesToolBody({
			model: params.model,
			inputText: params.query,
			tools: [{ type: "web_search" }]
		})
	};
}
async function requestXaiWebSearch(params) {
	const request = buildXaiWebSearchRequest({
		query: params.query,
		model: params.model
	});
	return await postTrustedWebToolsJson({
		url: request.url,
		timeoutSeconds: params.timeoutSeconds,
		apiKey: params.apiKey,
		body: request.body,
		errorLabel: "xAI"
	}, async (response) => {
		return resolveXaiResponseTextCitationsAndInline(await response.json(), params.inlineCitations);
	});
}
//#endregion
//#region extensions/xai/src/web-search-provider.runtime.ts
const XAI_WEB_SEARCH_CACHE = /* @__PURE__ */ new Map();
const X_SEARCH_MODEL_OPTIONS = [{
	value: XAI_DEFAULT_X_SEARCH_MODEL,
	label: XAI_DEFAULT_X_SEARCH_MODEL,
	hint: "default · fast, no reasoning"
}, {
	value: "grok-4-1-fast",
	label: "grok-4-1-fast",
	hint: "fast with reasoning"
}];
function resolveXSearchConfigRecord(config) {
	return resolveEffectiveXSearchConfig(config);
}
async function runXaiSearchProviderSetup(ctx) {
	const existingXSearch = resolveXSearchConfigRecord(ctx.config);
	if (existingXSearch?.enabled === false) return ctx.config;
	await ctx.prompter.note([
		"x_search lets your agent search X (formerly Twitter) posts via xAI.",
		"It reuses the same xAI API key you just configured for Grok web search.",
		`You can change this later with ${formatCliCommand("enclawed configure --section web")}.`
	].join("\n"), "X search");
	if (await ctx.prompter.select({
		message: "Enable x_search too?",
		options: [{
			value: "yes",
			label: "Yes, enable x_search",
			hint: "Search X posts with the same xAI key"
		}, {
			value: "skip",
			label: "Skip for now",
			hint: "Keep Grok web_search only"
		}],
		initialValue: existingXSearch?.enabled === true || ctx.quickstartDefaults ? "yes" : "skip"
	}) === "skip") return ctx.config;
	const existingModel = typeof existingXSearch?.model === "string" && existingXSearch.model.trim() ? existingXSearch.model.trim() : "";
	const knownModel = X_SEARCH_MODEL_OPTIONS.find((entry) => entry.value === existingModel)?.value;
	const modelPick = await ctx.prompter.select({
		message: "Grok model for x_search",
		options: [...X_SEARCH_MODEL_OPTIONS, {
			value: "__custom__",
			label: "Enter custom model name",
			hint: ""
		}],
		initialValue: knownModel ?? "grok-4-1-fast-non-reasoning"
	});
	let model = modelPick;
	if (modelPick === "__custom__") model = (await ctx.prompter.text({
		message: "Custom Grok model name",
		initialValue: existingModel || "grok-4-1-fast-non-reasoning",
		placeholder: "grok-4-1-fast-non-reasoning"
	})).trim() || "grok-4-1-fast-non-reasoning";
	const next = structuredClone(ctx.config);
	setPluginXSearchConfigValue(next, "enabled", true);
	setPluginXSearchConfigValue(next, "model", model || "grok-4-1-fast-non-reasoning");
	return next;
}
function runXaiWebSearch(params) {
	const cacheKey = normalizeCacheKey(`grok:${params.model}:${String(params.inlineCitations)}:${params.query}`);
	const cached = readCache(XAI_WEB_SEARCH_CACHE, cacheKey);
	if (cached) return Promise.resolve({
		...cached.value,
		cached: true
	});
	return (async () => {
		const startedAt = Date.now();
		const result = await requestXaiWebSearch({
			query: params.query,
			model: params.model,
			apiKey: params.apiKey,
			timeoutSeconds: params.timeoutSeconds,
			inlineCitations: params.inlineCitations
		});
		const payload = buildXaiWebSearchPayload({
			query: params.query,
			provider: "grok",
			model: params.model,
			tookMs: Date.now() - startedAt,
			content: result.content,
			citations: result.citations,
			inlineCitations: result.inlineCitations
		});
		writeCache(XAI_WEB_SEARCH_CACHE, cacheKey, payload, params.cacheTtlMs);
		return payload;
	})();
}
function resolveXaiToolSearchConfig(ctx) {
	return mergeScopedSearchConfig(ctx.searchConfig, "grok", resolveProviderWebSearchPluginConfig(ctx.config, "xai"));
}
function resolveXaiWebSearchCredential(searchConfig) {
	return resolveWebSearchProviderCredential({
		credentialValue: getScopedCredentialValue(searchConfig, "grok"),
		path: "tools.web.search.grok.apiKey",
		envVars: ["XAI_API_KEY"]
	});
}
/**
* Everything a call decides before it sends, shared by the call and its
* declared observation: the payload it answers with locally (no API key), or
* what it sends. Throws on a missing query.
*/
function planXaiWebSearch(ctx, args) {
	const searchConfig = resolveXaiToolSearchConfig(ctx);
	const apiKey = resolveXaiWebSearchCredential(searchConfig);
	if (!apiKey) return {
		kind: "answer",
		payload: {
			error: "missing_xai_api_key",
			message: "web_search (grok) needs an xAI API key. Set XAI_API_KEY in the Gateway environment, or configure plugins.entries.xai.config.webSearch.apiKey.",
			docs: "https://github.com/enclawed/enclawed-oss/blob/main/docs/tools/web.md"
		}
	};
	const query = readStringParam(args, "query", { required: true });
	readNumberParam(args, "count", { integer: true });
	return {
		kind: "send",
		apiKey,
		query,
		model: resolveXaiWebSearchModel(searchConfig),
		searchConfig
	};
}
/**
* The request a grok web_search call sends, for the egress action batcher:
* null when the call answers without sending (no API key); throws when it
* fails before sending (no query). Independent of the result cache. One
* request per call: the search turns run at xAI, inside that request.
*/
function observeXaiWebSearchProviderTool(ctx, args) {
	const plan = planXaiWebSearch(ctx, args);
	if (plan.kind === "answer") return null;
	const request = buildXaiWebSearchRequest({
		query: plan.query,
		model: plan.model
	});
	return {
		type: "http",
		method: "POST",
		url: request.url,
		body: JSON.stringify(request.body),
		read: true,
		client: "web_search:grok"
	};
}
async function executeXaiWebSearchProviderTool(ctx, args) {
	const plan = planXaiWebSearch(ctx, args);
	if (plan.kind === "answer") return plan.payload;
	const { searchConfig } = plan;
	return await runXaiWebSearch({
		query: plan.query,
		model: plan.model,
		apiKey: plan.apiKey,
		timeoutSeconds: resolveTimeoutSeconds(searchConfig?.timeoutSeconds, 30),
		inlineCitations: resolveXaiInlineCitations(searchConfig),
		cacheTtlMs: resolveCacheTtlMs(searchConfig?.cacheTtlMinutes, 15)
	});
}
const __testing = {
	buildXaiWebSearchPayload,
	extractXaiWebSearchContent,
	resolveXaiToolSearchConfig,
	resolveXaiInlineCitations,
	resolveXaiWebSearchCredential,
	resolveXaiWebSearchModel,
	requestXaiWebSearch
};
//#endregion
export { runXaiSearchProviderSetup as i, executeXaiWebSearchProviderTool as n, observeXaiWebSearchProviderTool as r, __testing as t };
