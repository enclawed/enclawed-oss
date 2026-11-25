import { n as buildManifestModelProviderConfig } from "./provider-catalog-shared-C3RXkmrb.js";
import { t as modelCatalog } from "./enclawed.plugin-d_KPx_I9.js";
//#region extensions/together/models.ts
const TOGETHER_MANIFEST_PROVIDER = buildManifestModelProviderConfig({
	providerId: "together",
	catalog: modelCatalog.providers.together
});
const TOGETHER_BASE_URL = TOGETHER_MANIFEST_PROVIDER.baseUrl;
const TOGETHER_MODEL_CATALOG = TOGETHER_MANIFEST_PROVIDER.models;
function buildTogetherModelDefinition(model) {
	return {
		...model,
		api: "openai-completions",
		input: [...model.input],
		cost: { ...model.cost }
	};
}
//#endregion
export { TOGETHER_MODEL_CATALOG as n, buildTogetherModelDefinition as r, TOGETHER_BASE_URL as t };
