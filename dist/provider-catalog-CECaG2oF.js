import { n as buildManifestModelProviderConfig } from "./provider-catalog-shared-Yv--nt9T.js";
import { t as modelCatalog } from "./enclawed.plugin-JOKgCEqQ.js";
//#region extensions/together/provider-catalog.ts
function buildTogetherProvider() {
	return buildManifestModelProviderConfig({
		providerId: "together",
		catalog: modelCatalog.providers.together
	});
}
//#endregion
export { buildTogetherProvider as t };
