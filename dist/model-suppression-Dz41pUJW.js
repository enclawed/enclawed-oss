import { i as normalizeLowercaseStringOrEmpty } from "./string-coerce-BUSzWgUA.js";
import { r as normalizeProviderId } from "./provider-id-BHVsNbpE.js";
import { E as resolveProviderBuiltInModelSuppression } from "./provider-runtime-CXPD9sF4.js";
import { i as isDeniedModelProviderRef, n as buildDeniedModelProviderError } from "./model-provider-denylist-s_q-H32R.js";
//#region src/agents/model-suppression.ts
function resolveBuiltInModelSuppression(params) {
	if (isDeniedModelProviderRef({
		provider: params.provider,
		baseUrl: params.baseUrl
	})) return {
		suppress: true,
		errorMessage: buildDeniedModelProviderError(params.provider)
	};
	const provider = normalizeProviderId(params.provider ?? "");
	const modelId = normalizeLowercaseStringOrEmpty(params.id);
	if (!provider || !modelId) return;
	return resolveProviderBuiltInModelSuppression({
		...params.config ? { config: params.config } : {},
		env: process.env,
		context: {
			...params.config ? { config: params.config } : {},
			env: process.env,
			provider,
			modelId,
			...params.baseUrl ? { baseUrl: params.baseUrl } : {}
		}
	});
}
function shouldSuppressBuiltInModel(params) {
	return resolveBuiltInModelSuppression(params)?.suppress ?? false;
}
function buildSuppressedBuiltInModelError(params) {
	return resolveBuiltInModelSuppression(params)?.errorMessage;
}
//#endregion
export { shouldSuppressBuiltInModel as n, buildSuppressedBuiltInModelError as t };
