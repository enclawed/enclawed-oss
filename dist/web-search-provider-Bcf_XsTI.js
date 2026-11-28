import { s as normalizeOptionalString } from "./string-coerce-BUSzWgUA.js";
import { l as isNonSecretApiKeyMarker } from "./model-auth-markers-HAPZYaGv.js";
import { t as normalizeOptionalSecretInput } from "./normalize-secret-input-BahnhK3p.js";
import { t as resolveEnvApiKey } from "./model-auth-env-BFWoegJy.js";
import { n as fetchWithSsrFGuard } from "./fetch-guard-p1TvidUH.js";
import { d as readNumberParam, h as readStringParam } from "./common-C_zplWg2.js";
import { a as wrapWebContent } from "./external-content-DghcB2zW.js";
import { o as truncateText } from "./web-fetch-utils-Dpl_1iu0.js";
import { a as readResponseText } from "./web-shared-3bF8sfq3.js";
import { _ as resolveSiteName, h as resolveSearchCount } from "./web-search-provider-common-DjoWUCZ5.js";
import "./ssrf-runtime--F8sIg90.js";
import "./text-runtime-a81Cxtqz.js";
import "./provider-auth-YDU2Mel6.js";
import "./provider-auth-runtime-DiXN6I0V.js";
import { t as enablePluginInConfig } from "./enable-B_CkBDGg.js";
import { i as resolveProviderWebSearchPluginConfig } from "./web-search-provider-config-CppJiggW.js";
import "./provider-web-search-uD8kycr8.js";
import { c as resolveOllamaApiBase, i as fetchOllamaModels, t as buildOllamaBaseUrlSsrFPolicy, u as OLLAMA_DEFAULT_BASE_URL } from "./provider-models-D2SG_i9a.js";
import { n as checkOllamaCloudAuth } from "./setup-BA4fEQjR.js";
import { Type } from "@sinclair/typebox";
//#region extensions/ollama/src/web-search-provider.ts
const OLLAMA_WEB_SEARCH_SCHEMA = Type.Object({
	query: Type.String({ description: "Search query string." }),
	count: Type.Optional(Type.Number({
		description: "Number of results to return (1-10).",
		minimum: 1,
		maximum: 10
	}))
}, { additionalProperties: false });
const OLLAMA_WEB_SEARCH_PATH = "/api/experimental/web_search";
const DEFAULT_OLLAMA_WEB_SEARCH_COUNT = 5;
const DEFAULT_OLLAMA_WEB_SEARCH_TIMEOUT_MS = 15e3;
const OLLAMA_WEB_SEARCH_SNIPPET_MAX_CHARS = 300;
function resolveOllamaWebSearchApiKey(config) {
	const providerApiKey = normalizeOptionalSecretInput(config?.models?.providers?.ollama?.apiKey);
	if (providerApiKey && !isNonSecretApiKeyMarker(providerApiKey)) return providerApiKey;
	return resolveEnvApiKey("ollama")?.apiKey;
}
function resolveOllamaWebSearchBaseUrl(config) {
	const pluginBaseUrl = normalizeOptionalString(resolveProviderWebSearchPluginConfig(config, "ollama")?.baseUrl);
	if (pluginBaseUrl) return resolveOllamaApiBase(pluginBaseUrl);
	const configuredBaseUrl = config?.models?.providers?.ollama?.baseUrl;
	if (normalizeOptionalString(configuredBaseUrl)) {
		const baseUrl = resolveOllamaApiBase(configuredBaseUrl);
		if (baseUrl !== "https://ollama.com") return baseUrl;
	}
	return OLLAMA_DEFAULT_BASE_URL;
}
function normalizeOllamaWebSearchResult(result) {
	const url = normalizeOptionalString(result.url) ?? "";
	if (!url) return null;
	return {
		title: normalizeOptionalString(result.title) ?? "",
		url,
		content: normalizeOptionalString(result.content) ?? ""
	};
}
/**
* The search request (URL and exact body; never the API key), built once for
* both the call and its declared observation, so the trim, the count clamp
* and the base URL resolution are the ones that are sent. Throws on an empty
* query, where the call fails before sending.
*/
function buildOllamaWebSearchRequest(params) {
	const query = params.query.trim();
	if (!query) throw new Error("query parameter is required");
	const baseUrl = resolveOllamaWebSearchBaseUrl(params.config);
	const count = resolveSearchCount(params.count, DEFAULT_OLLAMA_WEB_SEARCH_COUNT);
	return {
		baseUrl,
		url: `${baseUrl}${OLLAMA_WEB_SEARCH_PATH}`,
		body: JSON.stringify({
			query,
			max_results: count
		}),
		query,
		count
	};
}
function readOllamaWebSearchArgs(args) {
	return {
		query: readStringParam(args, "query", { required: true }),
		count: readNumberParam(args, "count", { integer: true })
	};
}
/**
* The request an ollama web_search call sends to the configured Ollama host,
* for the egress action batcher. Throws where the call fails before sending.
*/
function observeOllamaWebSearch(config, args) {
	const request = buildOllamaWebSearchRequest({
		config,
		...readOllamaWebSearchArgs(args)
	});
	return {
		type: "http",
		method: "POST",
		url: request.url,
		body: request.body,
		read: true,
		client: "web_search:ollama"
	};
}
const TOOL_OBSERVATION = Symbol.for("enclawed.tool-observation");
async function runOllamaWebSearch(params) {
	const request = buildOllamaWebSearchRequest(params);
	const { baseUrl, query, count } = request;
	const apiKey = resolveOllamaWebSearchApiKey(params.config);
	const startedAt = Date.now();
	const headers = { "Content-Type": "application/json" };
	if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
	const { response, release } = await fetchWithSsrFGuard({
		url: request.url,
		init: {
			method: "POST",
			headers,
			body: request.body,
			signal: AbortSignal.timeout(DEFAULT_OLLAMA_WEB_SEARCH_TIMEOUT_MS)
		},
		policy: buildOllamaBaseUrlSsrFPolicy(baseUrl),
		auditContext: "ollama-web-search.search"
	});
	try {
		if (response.status === 401) throw new Error("Ollama web search authentication failed. Run `ollama signin`.");
		if (response.status === 403) throw new Error("Ollama web search is unavailable. Ensure cloud-backed web search is enabled on the Ollama host.");
		if (!response.ok) {
			const detail = await readResponseText(response, { maxBytes: 64e3 });
			throw new Error(`Ollama web search failed (${response.status}): ${detail.text || ""}`.trim());
		}
		const payload = await response.json();
		const results = Array.isArray(payload.results) ? payload.results.map(normalizeOllamaWebSearchResult).filter((result) => result !== null).slice(0, count) : [];
		return {
			query,
			provider: "ollama",
			count: results.length,
			tookMs: Date.now() - startedAt,
			externalContent: {
				untrusted: true,
				source: "web_search",
				provider: "ollama",
				wrapped: true
			},
			results: results.map((result) => {
				const snippet = truncateText(result.content, OLLAMA_WEB_SEARCH_SNIPPET_MAX_CHARS).text;
				return {
					title: result.title ? wrapWebContent(result.title, "web_search") : "",
					url: result.url,
					snippet: snippet ? wrapWebContent(snippet, "web_search") : "",
					siteName: resolveSiteName(result.url) || void 0
				};
			})
		};
	} finally {
		await release();
	}
}
async function warnOllamaWebSearchPrereqs(params) {
	const baseUrl = resolveOllamaWebSearchBaseUrl(params.config);
	const { reachable } = await fetchOllamaModels(baseUrl);
	if (!reachable) {
		await params.prompter.note([
			"Ollama Web Search requires Ollama to be running.",
			`Expected host: ${baseUrl}`,
			"Start Ollama before using this provider."
		].join("\n"), "Ollama Web Search");
		return params.config;
	}
	const auth = await checkOllamaCloudAuth(baseUrl);
	if (!auth.signedIn) await params.prompter.note(["Ollama Web Search requires `ollama signin`.", ...auth.signinUrl ? [auth.signinUrl] : ["Run `ollama signin`."]].join("\n"), "Ollama Web Search");
	return params.config;
}
function createOllamaWebSearchProvider() {
	return {
		id: "ollama",
		label: "Ollama Web Search",
		hint: "Local Ollama host · requires ollama signin",
		onboardingScopes: ["text-inference"],
		requiresCredential: false,
		envVars: [],
		placeholder: "(run ollama signin)",
		signupUrl: "https://ollama.com/",
		docsUrl: "https://github.com/enclawed/enclawed-oss/blob/main/docs/tools/web.md",
		autoDetectOrder: 110,
		credentialPath: "",
		getCredentialValue: () => void 0,
		setCredentialValue: () => {},
		applySelectionConfig: (config) => enablePluginInConfig(config, "ollama").config,
		runSetup: async (ctx) => await warnOllamaWebSearchPrereqs({
			config: ctx.config,
			prompter: ctx.prompter
		}),
		createTool: (ctx) => ({
			description: "Search the web using Ollama's experimental web search API. Returns titles, URLs, and snippets from the configured Ollama host.",
			parameters: OLLAMA_WEB_SEARCH_SCHEMA,
			execute: async (args) => await runOllamaWebSearch({
				config: ctx.config,
				...readOllamaWebSearchArgs(args)
			}),
			[TOOL_OBSERVATION]: (args) => observeOllamaWebSearch(ctx.config, args)
		})
	};
}
//#endregion
export { createOllamaWebSearchProvider as t };
