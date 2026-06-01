import { n as buildManifestModelProviderConfig } from "./provider-catalog-shared-CVSPzI69.js";
import { t as modelCatalog } from "./enclawed.plugin-DFulYjRo.js";
//#region extensions/together/provider-catalog.ts
function buildTogetherProvider() {
	return buildManifestModelProviderConfig({
		providerId: "together",
		catalog: modelCatalog.providers.together
	});
}
//#endregion
export { buildTogetherProvider as t };
