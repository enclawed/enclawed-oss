import { d as readNumberParam, h as readStringParam } from "./common-C_zplWg2.js";
import { b as formatProviderHttpErrorMessage, g as createProviderHttpError } from "./shared-1SiPkVsj.js";
import { a as wrapWebContent } from "./external-content-DghcB2zW.js";
import { a as buildUnsupportedSearchFilterResponse, b as writeCachedSearchPayload, d as readCachedSearchPayload, f as readConfiguredSecretString, g as resolveSearchTimeoutSeconds, h as resolveSearchCount, i as buildSearchCacheKey, m as resolveSearchCacheTtlMs, p as readProviderEnvValue, y as withTrustedWebSearchEndpoint } from "./web-search-provider-common-DjoWUCZ5.js";
import "./provider-http-C8KCoJfr.js";
import { r as resolveCitationRedirectUrl } from "./provider-web-search-uD8kycr8.js";
import { t as DEFAULT_GOOGLE_API_BASE_URL } from "./provider-policy-BPgRwi2s.js";
import "./api-CX74LgX8.js";
import { n as resolveGeminiModel, t as resolveGeminiConfig } from "./gemini-web-search-provider.shared-BgNKRdFU.js";
//#region extensions/google/src/gemini-web-search-provider.runtime.ts
const GEMINI_API_BASE = DEFAULT_GOOGLE_API_BASE_URL;
function resolveGeminiRuntimeApiKey(gemini) {
	return readConfiguredSecretString(gemini?.apiKey, "tools.web.search.gemini.apiKey") ?? readProviderEnvValue(["GEMINI_API_KEY"]);
}
/** The grounded generateContent request (URL and exact body; no credentials). */
function buildGeminiSearchRequest(params) {
	return {
		url: `${GEMINI_API_BASE}/models/${params.model}:generateContent`,
		body: JSON.stringify({
			contents: [{ parts: [{ text: params.query }] }],
			tools: [{ google_search: {} }]
		})
	};
}
async function runGeminiSearch(params) {
	return withTrustedWebSearchEndpoint({
		url: params.request.url,
		timeoutSeconds: params.timeoutSeconds,
		init: {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"x-goog-api-key": params.apiKey
			},
			body: params.request.body
		}
	}, async (res) => {
		if (!res.ok) {
			const error = await createProviderHttpError(res, "Gemini API error");
			throw new Error(error.message.replace(/key=[^&\s]+/giu, "key=***"));
		}
		let data;
		try {
			data = await res.json();
		} catch (error) {
			const safeError = String(error).replace(/key=[^&\s]+/giu, "key=***");
			throw new Error(`Gemini API returned invalid JSON: ${safeError}`, { cause: error });
		}
		if (data.error) {
			const rawMessage = data.error.message || data.error.status || "unknown";
			throw new Error(formatProviderHttpErrorMessage({
				label: "Gemini API error",
				status: data.error.code ?? 0,
				detail: rawMessage.replace(/key=[^&\s]+/giu, "key=***")
			}));
		}
		const candidate = data.candidates?.[0];
		const content = candidate?.content?.parts?.map((part) => part.text).filter(Boolean).join("\n") ?? "No response";
		const rawCitations = (candidate?.groundingMetadata?.groundingChunks ?? []).filter((chunk) => chunk.web?.uri).map((chunk) => ({
			url: chunk.web.uri,
			title: chunk.web?.title || void 0
		}));
		const citations = [];
		for (let index = 0; index < rawCitations.length; index += 10) {
			const batch = rawCitations.slice(index, index + 10);
			const resolved = await Promise.all(batch.map(async (citation) => Object.assign({}, citation, { url: await resolveCitationRedirectUrl(citation.url) })));
			citations.push(...resolved);
		}
		return {
			content,
			citations
		};
	});
}
/**
* Everything a call decides before it sends, shared by `executeGeminiSearch`
* and its declared observation (`observeGeminiSearch`): either the payload it
* answers with locally, or the request it sends. Throws on invalid args.
*/
function planGeminiSearch(args, searchConfig) {
	const unsupportedResponse = buildUnsupportedSearchFilterResponse(args, "gemini");
	if (unsupportedResponse) return {
		kind: "answer",
		payload: unsupportedResponse
	};
	const geminiConfig = resolveGeminiConfig(searchConfig);
	const apiKey = resolveGeminiRuntimeApiKey(geminiConfig);
	if (!apiKey) return {
		kind: "answer",
		payload: {
			error: "missing_gemini_api_key",
			message: "web_search (gemini) needs an API key. Set GEMINI_API_KEY in the Gateway environment, or configure tools.web.search.gemini.apiKey.",
			docs: "https://github.com/enclawed/enclawed-oss/blob/main/docs/tools/web.md"
		}
	};
	const query = readStringParam(args, "query", { required: true });
	const count = readNumberParam(args, "count", { integer: true }) ?? searchConfig?.maxResults ?? void 0;
	const model = resolveGeminiModel(geminiConfig);
	return {
		kind: "send",
		apiKey,
		query,
		model,
		cacheKey: buildSearchCacheKey([
			"gemini",
			query,
			resolveSearchCount(count, 5),
			model
		]),
		request: buildGeminiSearchRequest({
			query,
			model
		})
	};
}
/**
* The request a gemini web_search call sends, for the egress action batcher:
* null when the call answers without sending (unsupported filter, no API
* key); throws when it fails before sending (no query). Independent of the
* result cache. After the response, the call also sends a HEAD to each
* citation URL the response names (`resolveCitationRedirectUrl`): those
* follow-ups are a function of the response alone.
*/
function observeGeminiSearch(args, searchConfig) {
	const plan = planGeminiSearch(args, searchConfig);
	if (plan.kind === "answer") return null;
	return {
		type: "http",
		method: "POST",
		url: plan.request.url,
		body: plan.request.body,
		read: true,
		client: "web_search:gemini"
	};
}
async function executeGeminiSearch(args, searchConfig) {
	const plan = planGeminiSearch(args, searchConfig);
	if (plan.kind === "answer") return plan.payload;
	const { apiKey, query, model, cacheKey } = plan;
	const cached = readCachedSearchPayload(cacheKey);
	if (cached) return cached;
	const start = Date.now();
	const result = await runGeminiSearch({
		request: plan.request,
		apiKey,
		timeoutSeconds: resolveSearchTimeoutSeconds(searchConfig)
	});
	const payload = {
		query,
		provider: "gemini",
		model,
		tookMs: Date.now() - start,
		externalContent: {
			untrusted: true,
			source: "web_search",
			provider: "gemini",
			wrapped: true
		},
		content: wrapWebContent(result.content),
		citations: result.citations
	};
	writeCachedSearchPayload(cacheKey, payload, resolveSearchCacheTtlMs(searchConfig));
	return payload;
}
//#endregion
export { buildGeminiSearchRequest, executeGeminiSearch, observeGeminiSearch, resolveGeminiRuntimeApiKey };
