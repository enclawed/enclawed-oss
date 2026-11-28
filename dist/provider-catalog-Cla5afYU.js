import { n as buildManifestModelProviderConfig } from "./provider-catalog-shared-g2Hfxp4p.js";
import { t as modelCatalog } from "./enclawed.plugin-DVJ6_bdf.js";
//#region extensions/mistral/provider-catalog.ts
function buildMistralProvider() {
	return buildManifestModelProviderConfig({
		providerId: "mistral",
		catalog: modelCatalog.providers.mistral
	});
}
//#endregion
export { buildMistralProvider as t };
