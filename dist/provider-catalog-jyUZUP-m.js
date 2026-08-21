import { n as buildManifestModelProviderConfig } from "./provider-catalog-shared-Cs6rxM2H.js";
import { t as modelCatalog } from "./enclawed.plugin-NTPIV8sy.js";
//#region extensions/together/provider-catalog.ts
function buildTogetherProvider() {
	return buildManifestModelProviderConfig({
		providerId: "together",
		catalog: modelCatalog.providers.together
	});
}
//#endregion
export { buildTogetherProvider as t };
