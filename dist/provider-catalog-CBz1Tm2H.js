import { n as buildManifestModelProviderConfig } from "./provider-catalog-shared-D6TyqH8i.js";
import { t as modelCatalog } from "./enclawed.plugin-mnScbmkv.js";
//#region extensions/together/provider-catalog.ts
function buildTogetherProvider() {
	return buildManifestModelProviderConfig({
		providerId: "together",
		catalog: modelCatalog.providers.together
	});
}
//#endregion
export { buildTogetherProvider as t };
