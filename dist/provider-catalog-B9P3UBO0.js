import { n as buildManifestModelProviderConfig } from "./provider-catalog-shared-CVSPzI69.js";
import { t as modelCatalog } from "./enclawed.plugin-DZhWf5Vd.js";
//#region extensions/mistral/provider-catalog.ts
function buildMistralProvider() {
	return buildManifestModelProviderConfig({
		providerId: "mistral",
		catalog: modelCatalog.providers.mistral
	});
}
//#endregion
export { buildMistralProvider as t };
