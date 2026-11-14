import { d as readStringValue, i as normalizeLowercaseStringOrEmpty } from "./string-coerce-BUSzWgUA.js";
import { i as resolveProviderRequestCapabilities } from "./provider-attribution-CU1psAzk.js";
import "./text-runtime-DeooypNP.js";
import "./provider-http-CySBTczn.js";
import { t as MISTRAL_MODEL_TRANSPORT_PATCH } from "./api-bNIh9Ksb.js";
//#region extensions/mistral/provider-compat.ts
const MISTRAL_MODEL_HINTS = [
	"mistral",
	"mistralai",
	"mixtral",
	"codestral",
	"pixtral",
	"devstral",
	"ministral"
];
function isMistralModelHint(modelId) {
	const normalized = normalizeLowercaseStringOrEmpty(modelId);
	return MISTRAL_MODEL_HINTS.some((hint) => normalized === hint || normalized.startsWith(`${hint}/`) || normalized.startsWith(`${hint}-`) || normalized.startsWith(`${hint}:`));
}
function shouldContributeMistralCompat(params) {
	if (params.model.api !== "openai-completions") return false;
	const capabilities = resolveProviderRequestCapabilities({
		provider: readStringValue(params.model.provider),
		api: "openai-completions",
		baseUrl: readStringValue(params.model.baseUrl),
		capability: "llm",
		transport: "stream",
		modelId: params.modelId,
		compat: params.model.compat && typeof params.model.compat === "object" ? params.model.compat : void 0
	});
	return capabilities.knownProviderFamily === "mistral" || capabilities.endpointClass === "mistral-public" || isMistralModelHint(params.modelId);
}
function contributeMistralResolvedModelCompat(params) {
	return shouldContributeMistralCompat(params) ? MISTRAL_MODEL_TRANSPORT_PATCH : void 0;
}
//#endregion
export { contributeMistralResolvedModelCompat as t };
