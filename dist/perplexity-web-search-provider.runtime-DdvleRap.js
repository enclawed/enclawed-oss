import { s as normalizeOptionalString } from "./string-coerce-BUSzWgUA.js";
import { d as readNumberParam, h as readStringParam, p as readStringArrayParam } from "./common-C_zplWg2.js";
import { a as wrapWebContent } from "./external-content-DghcB2zW.js";
import { _ as resolveSiteName, b as writeCachedSearchPayload, c as normalizeToIsoDate, d as readCachedSearchPayload, f as readConfiguredSecretString, g as resolveSearchTimeoutSeconds, h as resolveSearchCount, i as buildSearchCacheKey, m as resolveSearchCacheTtlMs, o as isoToPerplexityDate, p as readProviderEnvValue, s as normalizeFreshness, v as throwWebSearchApiError, y as withTrustedWebSearchEndpoint } from "./web-search-provider-common-DjoWUCZ5.js";
import "./text-runtime-a81Cxtqz.js";
import "./provider-web-search-uD8kycr8.js";
import { a as isDirectPerplexityBaseUrl, i as inferPerplexityBaseUrlFromApiKey, n as PERPLEXITY_DIRECT_BASE_URL, t as DEFAULT_PERPLEXITY_BASE_URL } from "./perplexity-web-search-provider.shared-BVmVnRJ_.js";
//#region extensions/perplexity/src/perplexity-web-search-provider.runtime.ts
const PERPLEXITY_SEARCH_ENDPOINT = "https://api.perplexity.ai/search";
const DEFAULT_PERPLEXITY_MODEL = "perplexity/sonar-pro";
function resolvePerplexityConfig(searchConfig) {
	const perplexity = searchConfig?.perplexity;
	return perplexity && typeof perplexity === "object" && !Array.isArray(perplexity) ? perplexity : {};
}
function resolvePerplexityApiKey(perplexity) {
	const fromConfig = readConfiguredSecretString(perplexity?.apiKey, "tools.web.search.perplexity.apiKey");
	if (fromConfig) return {
		apiKey: fromConfig,
		source: "config"
	};
	const fromPerplexityEnv = readProviderEnvValue(["PERPLEXITY_API_KEY"]);
	if (fromPerplexityEnv) return {
		apiKey: fromPerplexityEnv,
		source: "perplexity_env"
	};
	const fromOpenRouterEnv = readProviderEnvValue(["OPENROUTER_API_KEY"]);
	if (fromOpenRouterEnv) return {
		apiKey: fromOpenRouterEnv,
		source: "openrouter_env"
	};
	return {
		apiKey: void 0,
		source: "none"
	};
}
function resolvePerplexityBaseUrl(perplexity, authSource = "none", configuredKey) {
	const fromConfig = normalizeOptionalString(perplexity?.baseUrl) ?? "";
	if (fromConfig) return fromConfig;
	if (authSource === "perplexity_env") return PERPLEXITY_DIRECT_BASE_URL;
	if (authSource === "openrouter_env") return DEFAULT_PERPLEXITY_BASE_URL;
	if (authSource === "config") return inferPerplexityBaseUrlFromApiKey(configuredKey) === "openrouter" ? DEFAULT_PERPLEXITY_BASE_URL : PERPLEXITY_DIRECT_BASE_URL;
	return DEFAULT_PERPLEXITY_BASE_URL;
}
function resolvePerplexityModel(perplexity) {
	return (normalizeOptionalString(perplexity?.model) ?? "") || DEFAULT_PERPLEXITY_MODEL;
}
function resolvePerplexityRequestModel(baseUrl, model) {
	if (!isDirectPerplexityBaseUrl(baseUrl)) return model;
	return model.startsWith("perplexity/") ? model.slice(11) : model;
}
function buildPerplexityRequestHeaders(apiKey, acceptJson = false) {
	return {
		"Content-Type": "application/json",
		...acceptJson ? { Accept: "application/json" } : {},
		Authorization: `Bearer ${apiKey}`
	};
}
function resolvePerplexityTransport(perplexity) {
	const auth = resolvePerplexityApiKey(perplexity);
	const baseUrl = resolvePerplexityBaseUrl(perplexity, auth.source, auth.apiKey);
	const model = resolvePerplexityModel(perplexity);
	const hasLegacyOverride = Boolean(normalizeOptionalString(perplexity?.baseUrl) || normalizeOptionalString(perplexity?.model));
	return {
		...auth,
		baseUrl,
		model,
		transport: hasLegacyOverride || !isDirectPerplexityBaseUrl(baseUrl) ? "chat_completions" : "search_api"
	};
}
function extractPerplexityCitations(data) {
	const topLevel = (data.citations ?? []).filter((url) => Boolean(normalizeOptionalString(url)));
	if (topLevel.length > 0) return [...new Set(topLevel)];
	const citations = [];
	for (const choice of data.choices ?? []) for (const annotation of choice.message?.annotations ?? []) {
		if (annotation.type !== "url_citation") continue;
		const normalizedUrl = normalizeOptionalString(typeof annotation.url_citation?.url === "string" ? annotation.url_citation.url : typeof annotation.url === "string" ? annotation.url : void 0);
		if (normalizedUrl) citations.push(normalizedUrl);
	}
	return [...new Set(citations)];
}
function buildPerplexitySearchApiRequest(params) {
	const body = {
		query: params.query,
		max_results: params.count
	};
	if (params.country) body.country = params.country;
	if (params.searchDomainFilter?.length) body.search_domain_filter = params.searchDomainFilter;
	if (params.searchRecencyFilter) body.search_recency_filter = params.searchRecencyFilter;
	if (params.searchLanguageFilter?.length) body.search_language_filter = params.searchLanguageFilter;
	if (params.searchAfterDate) body.search_after_date = params.searchAfterDate;
	if (params.searchBeforeDate) body.search_before_date = params.searchBeforeDate;
	if (params.maxTokens !== void 0) body.max_tokens = params.maxTokens;
	if (params.maxTokensPerPage !== void 0) body.max_tokens_per_page = params.maxTokensPerPage;
	return {
		url: PERPLEXITY_SEARCH_ENDPOINT,
		body: JSON.stringify(body)
	};
}
async function runPerplexitySearchApi(params) {
	return withTrustedWebSearchEndpoint({
		url: params.request.url,
		timeoutSeconds: params.timeoutSeconds,
		init: {
			method: "POST",
			headers: buildPerplexityRequestHeaders(params.apiKey, true),
			body: params.request.body
		}
	}, async (res) => {
		if (!res.ok) return await throwWebSearchApiError(res, "Perplexity Search");
		return ((await res.json()).results ?? []).map((entry) => ({
			title: entry.title ? wrapWebContent(entry.title, "web_search") : "",
			url: entry.url ?? "",
			description: entry.snippet ? wrapWebContent(entry.snippet, "web_search") : "",
			published: entry.date ?? void 0,
			siteName: resolveSiteName(entry.url) || void 0
		}));
	});
}
function buildPerplexityChatRequest(params) {
	const endpoint = `${params.baseUrl.trim().replace(/\/$/, "")}/chat/completions`;
	const body = {
		model: resolvePerplexityRequestModel(params.baseUrl, params.model),
		messages: [{
			role: "user",
			content: params.query
		}]
	};
	if (params.freshness) body.search_recency_filter = params.freshness;
	return {
		url: endpoint,
		body: JSON.stringify(body)
	};
}
async function runPerplexitySearch(params) {
	return withTrustedWebSearchEndpoint({
		url: params.request.url,
		timeoutSeconds: params.timeoutSeconds,
		init: {
			method: "POST",
			headers: buildPerplexityRequestHeaders(params.apiKey),
			body: params.request.body
		}
	}, async (res) => {
		if (!res.ok) return await throwWebSearchApiError(res, "Perplexity");
		const data = await res.json();
		return {
			content: data.choices?.[0]?.message?.content ?? "No response",
			citations: extractPerplexityCitations(data)
		};
	});
}
/**
* Everything a call decides before it sends, shared by
* `executePerplexitySearch` and its declared observation
* (`observePerplexitySearch`): either the payload it answers with locally
* (missing key, invalid or unsupported filters), or the one request it sends
* on the selected transport. Throws on a missing query.
*/
function planPerplexitySearch(args, searchConfig) {
	const runtime = resolvePerplexityTransport(resolvePerplexityConfig(searchConfig));
	if (!runtime.apiKey) return answer({
		error: "missing_perplexity_api_key",
		message: "web_search (perplexity) needs an API key. Set PERPLEXITY_API_KEY or OPENROUTER_API_KEY in the Gateway environment, or configure tools.web.search.perplexity.apiKey.",
		docs: "https://github.com/enclawed/enclawed-oss/blob/main/docs/tools/web.md"
	});
	const query = readStringParam(args, "query", { required: true });
	const count = readNumberParam(args, "count", { integer: true }) ?? searchConfig?.maxResults ?? void 0;
	const rawFreshness = readStringParam(args, "freshness");
	const freshness = rawFreshness ? normalizeFreshness(rawFreshness, "perplexity") : void 0;
	if (rawFreshness && !freshness) return answer({
		error: "invalid_freshness",
		message: "freshness must be day, week, month, or year.",
		docs: "https://github.com/enclawed/enclawed-oss/blob/main/docs/tools/web.md"
	});
	const structured = runtime.transport === "search_api";
	const country = readStringParam(args, "country");
	const language = readStringParam(args, "language");
	const rawDateAfter = readStringParam(args, "date_after");
	const rawDateBefore = readStringParam(args, "date_before");
	const domainFilter = readStringArrayParam(args, "domain_filter");
	const maxTokens = readNumberParam(args, "max_tokens", { integer: true });
	const maxTokensPerPage = readNumberParam(args, "max_tokens_per_page", { integer: true });
	if (!structured) {
		if (country) return answer({
			error: "unsupported_country",
			message: "country filtering is only supported by the native Perplexity Search API path. Remove Perplexity baseUrl/model overrides or use a direct PERPLEXITY_API_KEY to enable it.",
			docs: "https://github.com/enclawed/enclawed-oss/blob/main/docs/tools/web.md"
		});
		if (language) return answer({
			error: "unsupported_language",
			message: "language filtering is only supported by the native Perplexity Search API path. Remove Perplexity baseUrl/model overrides or use a direct PERPLEXITY_API_KEY to enable it.",
			docs: "https://github.com/enclawed/enclawed-oss/blob/main/docs/tools/web.md"
		});
		if (rawDateAfter || rawDateBefore) return answer({
			error: "unsupported_date_filter",
			message: "date_after/date_before are only supported by the native Perplexity Search API path. Remove Perplexity baseUrl/model overrides or use a direct PERPLEXITY_API_KEY to enable them.",
			docs: "https://github.com/enclawed/enclawed-oss/blob/main/docs/tools/web.md"
		});
		if (domainFilter?.length) return answer({
			error: "unsupported_domain_filter",
			message: "domain_filter is only supported by the native Perplexity Search API path. Remove Perplexity baseUrl/model overrides or use a direct PERPLEXITY_API_KEY to enable it.",
			docs: "https://github.com/enclawed/enclawed-oss/blob/main/docs/tools/web.md"
		});
		if (maxTokens !== void 0 || maxTokensPerPage !== void 0) return answer({
			error: "unsupported_content_budget",
			message: "max_tokens and max_tokens_per_page are only supported by the native Perplexity Search API path. Remove Perplexity baseUrl/model overrides or use a direct PERPLEXITY_API_KEY to enable them.",
			docs: "https://github.com/enclawed/enclawed-oss/blob/main/docs/tools/web.md"
		});
	}
	if (language && !/^[a-z]{2}$/iu.test(language)) return answer({
		error: "invalid_language",
		message: "language must be a 2-letter ISO 639-1 code like 'en', 'de', or 'fr'.",
		docs: "https://github.com/enclawed/enclawed-oss/blob/main/docs/tools/web.md"
	});
	if (rawFreshness && (rawDateAfter || rawDateBefore)) return answer({
		error: "conflicting_time_filters",
		message: "freshness and date_after/date_before cannot be used together. Use either freshness (day/week/month/year) or a date range (date_after/date_before), not both.",
		docs: "https://github.com/enclawed/enclawed-oss/blob/main/docs/tools/web.md"
	});
	const dateAfter = rawDateAfter ? normalizeToIsoDate(rawDateAfter) : void 0;
	const dateBefore = rawDateBefore ? normalizeToIsoDate(rawDateBefore) : void 0;
	if (rawDateAfter && !dateAfter) return answer({
		error: "invalid_date",
		message: "date_after must be YYYY-MM-DD format.",
		docs: "https://github.com/enclawed/enclawed-oss/blob/main/docs/tools/web.md"
	});
	if (rawDateBefore && !dateBefore) return answer({
		error: "invalid_date",
		message: "date_before must be YYYY-MM-DD format.",
		docs: "https://github.com/enclawed/enclawed-oss/blob/main/docs/tools/web.md"
	});
	if (dateAfter && dateBefore && dateAfter > dateBefore) return answer({
		error: "invalid_date_range",
		message: "date_after must be before date_before.",
		docs: "https://github.com/enclawed/enclawed-oss/blob/main/docs/tools/web.md"
	});
	if (domainFilter?.length) {
		const hasDeny = domainFilter.some((entry) => entry.startsWith("-"));
		const hasAllow = domainFilter.some((entry) => !entry.startsWith("-"));
		if (hasDeny && hasAllow) return answer({
			error: "invalid_domain_filter",
			message: "domain_filter cannot mix allowlist and denylist entries. Use either all positive entries (allowlist) or all entries prefixed with '-' (denylist).",
			docs: "https://github.com/enclawed/enclawed-oss/blob/main/docs/tools/web.md"
		});
		if (domainFilter.length > 20) return answer({
			error: "invalid_domain_filter",
			message: "domain_filter supports a maximum of 20 domains.",
			docs: "https://github.com/enclawed/enclawed-oss/blob/main/docs/tools/web.md"
		});
	}
	const cacheKey = buildSearchCacheKey([
		"perplexity",
		runtime.transport,
		runtime.baseUrl,
		runtime.model,
		query,
		resolveSearchCount(count, 5),
		country,
		language,
		freshness,
		dateAfter,
		dateBefore,
		domainFilter?.join(","),
		maxTokens,
		maxTokensPerPage
	]);
	const request = runtime.transport === "chat_completions" ? buildPerplexityChatRequest({
		query,
		baseUrl: runtime.baseUrl,
		model: runtime.model,
		freshness
	}) : buildPerplexitySearchApiRequest({
		query,
		count: resolveSearchCount(count, 5),
		country: country ?? void 0,
		searchDomainFilter: domainFilter,
		searchRecencyFilter: freshness,
		searchLanguageFilter: language ? [language] : void 0,
		searchAfterDate: dateAfter ? isoToPerplexityDate(dateAfter) : void 0,
		searchBeforeDate: dateBefore ? isoToPerplexityDate(dateBefore) : void 0,
		maxTokens: maxTokens ?? void 0,
		maxTokensPerPage: maxTokensPerPage ?? void 0
	});
	return {
		kind: "send",
		transport: runtime.transport,
		apiKey: runtime.apiKey,
		query,
		model: runtime.model,
		cacheKey,
		request
	};
}
function answer(payload) {
	return {
		kind: "answer",
		payload
	};
}
/**
* The request a perplexity web_search call sends, for the egress action
* batcher: null when the call answers without sending; throws when it fails
* before sending. Independent of the result cache. One request per call.
*/
function observePerplexitySearch(args, searchConfig) {
	const plan = planPerplexitySearch(args, searchConfig);
	if (plan.kind === "answer") return null;
	return {
		type: "http",
		method: "POST",
		url: plan.request.url,
		body: plan.request.body,
		read: true,
		client: "web_search:perplexity"
	};
}
async function executePerplexitySearch(args, searchConfig) {
	const plan = planPerplexitySearch(args, searchConfig);
	if (plan.kind === "answer") return plan.payload;
	const { query, cacheKey, apiKey } = plan;
	const cached = readCachedSearchPayload(cacheKey);
	if (cached) return cached;
	const start = Date.now();
	const timeoutSeconds = resolveSearchTimeoutSeconds(searchConfig);
	const payload = plan.transport === "chat_completions" ? {
		query,
		provider: "perplexity",
		model: plan.model,
		tookMs: Date.now() - start,
		externalContent: {
			untrusted: true,
			source: "web_search",
			provider: "perplexity",
			wrapped: true
		},
		...await (async () => {
			const result = await runPerplexitySearch({
				request: plan.request,
				apiKey,
				timeoutSeconds
			});
			return {
				content: wrapWebContent(result.content, "web_search"),
				citations: result.citations
			};
		})()
	} : {
		query,
		provider: "perplexity",
		count: 0,
		tookMs: Date.now() - start,
		externalContent: {
			untrusted: true,
			source: "web_search",
			provider: "perplexity",
			wrapped: true
		},
		results: await runPerplexitySearchApi({
			request: plan.request,
			apiKey,
			timeoutSeconds
		})
	};
	if (Array.isArray(payload.results)) {
		payload.count = payload.results.length;
		payload.tookMs = Date.now() - start;
	} else payload.tookMs = Date.now() - start;
	writeCachedSearchPayload(cacheKey, payload, resolveSearchCacheTtlMs(searchConfig));
	return payload;
}
const __testing = {
	inferPerplexityBaseUrlFromApiKey,
	resolvePerplexityBaseUrl,
	resolvePerplexityModel,
	resolvePerplexityTransport,
	isDirectPerplexityBaseUrl,
	resolvePerplexityRequestModel,
	resolvePerplexityApiKey,
	normalizeToIsoDate,
	isoToPerplexityDate
};
//#endregion
export { executePerplexitySearch as n, observePerplexitySearch as r, __testing as t };
