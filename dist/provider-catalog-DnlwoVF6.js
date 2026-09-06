import { n as buildManifestModelProviderConfig } from "./provider-catalog-shared-Bt_5qmjI.js";
import { t as modelCatalog } from "./enclawed.plugin-BzAOegDJ.js";
//#region extensions/mistral/provider-catalog.ts
function buildMistralProvider() {
	return buildManifestModelProviderConfig({
		providerId: "mistral",
		catalog: modelCatalog.providers.mistral
	});
}
//#endregion
export { buildMistralProvider as t };
