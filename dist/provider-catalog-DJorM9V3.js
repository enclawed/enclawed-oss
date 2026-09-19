import { n as buildManifestModelProviderConfig } from "./provider-catalog-shared-D6TyqH8i.js";
import { t as modelCatalog } from "./enclawed.plugin-B0_BLktp.js";
//#region extensions/mistral/provider-catalog.ts
function buildMistralProvider() {
	return buildManifestModelProviderConfig({
		providerId: "mistral",
		catalog: modelCatalog.providers.mistral
	});
}
//#endregion
export { buildMistralProvider as t };
