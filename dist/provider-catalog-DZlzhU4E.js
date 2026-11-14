import { n as buildManifestModelProviderConfig } from "./provider-catalog-shared-Yv--nt9T.js";
import { t as modelCatalog } from "./enclawed.plugin-C1-MnpAd.js";
//#region extensions/mistral/provider-catalog.ts
function buildMistralProvider() {
	return buildManifestModelProviderConfig({
		providerId: "mistral",
		catalog: modelCatalog.providers.mistral
	});
}
//#endregion
export { buildMistralProvider as t };
