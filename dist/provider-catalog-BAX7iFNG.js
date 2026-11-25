import { n as buildManifestModelProviderConfig } from "./provider-catalog-shared-C3RXkmrb.js";
import { t as modelCatalog } from "./enclawed.plugin-d_KPx_I9.js";
//#region extensions/together/provider-catalog.ts
function buildTogetherProvider() {
	return buildManifestModelProviderConfig({
		providerId: "together",
		catalog: modelCatalog.providers.together
	});
}
//#endregion
export { buildTogetherProvider as t };
