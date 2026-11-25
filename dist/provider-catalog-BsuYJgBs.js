import { n as buildManifestModelProviderConfig } from "./provider-catalog-shared-C3RXkmrb.js";
import { t as modelCatalog } from "./enclawed.plugin-Bj_Kb2cy.js";
//#region extensions/mistral/provider-catalog.ts
function buildMistralProvider() {
	return buildManifestModelProviderConfig({
		providerId: "mistral",
		catalog: modelCatalog.providers.mistral
	});
}
//#endregion
export { buildMistralProvider as t };
