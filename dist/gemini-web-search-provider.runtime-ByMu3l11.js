import { d as readNumberParam, h as readStringParam } from "./common-DthjNV6P.js";
import { b as formatProviderHttpErrorMessage, g as createProviderHttpError } from "./shared-DFFoP2el.js";
import { a as wrapWebContent } from "./external-content-BG0h4WfB.js";
import { a as buildUnsupportedSearchFilterResponse, b as writeCachedSearchPayload, d as readCachedSearchPayload, f as readConfiguredSecretString, g as resolveSearchTimeoutSeconds, h as resolveSearchCount, i as buildSearchCacheKey, m as resolveSearchCacheTtlMs, p as readProviderEnvValue, y as withTrustedWebSearchEndpoint } from "./web-search-provider-common-B0Epj1Dl.js";
import "./provider-http-B3YqutJi.js";
import { r as resolveCitationRedirectUrl } from "./provider-web-search-LEmunP7C.js";
import { t as DEFAULT_GOOGLE_API_BASE_URL } from "./provider-policy-53T5lpZI.js";
import "./api-DbBXqlwl.js";
import { n as resolveGeminiModel, t as resolveGeminiConfig } from "./gemini-web-search-provider.shared-DYLUfydW.js";
//#region extensions/google/src/gemini-web-search-provider.runtime.ts
const GEMINI_API_BASE = DEFAULT_GOOGLE_API_BASE_URL;
function resolveGeminiRuntimeApiKey(gemini) {
	return readConfiguredSecretString(gemini?.apiKey, "tools.web.search.gemini.apiKey") ?? readProviderEnvValue(["GEMINI_API_KEY"]);
}
async function runGeminiSearch(params) {
	return withTrustedWebSearchEndpoint({
		url: `${GEMINI_API_BASE}/models/${params.model}:generateContent`,
		timeoutSeconds: params.timeoutSeconds,
		init: {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"x-goog-api-key": params.apiKey
			},
			body: JSON.stringify({
				contents: [{ parts: [{ text: params.query }] }],
				tools: [{ google_search: {} }]
			})
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
async function executeGeminiSearch(args, searchConfig) {
	const unsupportedResponse = buildUnsupportedSearchFilterResponse(args, "gemini");
	if (unsupportedResponse) return unsupportedResponse;
	const geminiConfig = resolveGeminiConfig(searchConfig);
	const apiKey = resolveGeminiRuntimeApiKey(geminiConfig);
	if (!apiKey) return {
		error: "missing_gemini_api_key",
		message: "web_search (gemini) needs an API key. Set GEMINI_API_KEY in the Gateway environment, or configure tools.web.search.gemini.apiKey.",
		docs: "https://docs.enclawed.ai/tools/web"
	};
	const query = readStringParam(args, "query", { required: true });
	const count = readNumberParam(args, "count", { integer: true }) ?? searchConfig?.maxResults ?? void 0;
	const model = resolveGeminiModel(geminiConfig);
	const cacheKey = buildSearchCacheKey([
		"gemini",
		query,
		resolveSearchCount(count, 5),
		model
	]);
	const cached = readCachedSearchPayload(cacheKey);
	if (cached) return cached;
	const start = Date.now();
	const result = await runGeminiSearch({
		query,
		apiKey,
		model,
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
export { executeGeminiSearch, resolveGeminiRuntimeApiKey };
