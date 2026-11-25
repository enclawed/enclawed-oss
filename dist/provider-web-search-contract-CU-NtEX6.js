import { t as enablePluginInConfig } from "./provider-enable-config-BGEiXV8x.js";
import { t as createBaseWebSearchProviderContractFields } from "./provider-web-search-contract-fields-DE0C8EYQ.js";
//#region src/plugin-sdk/provider-web-search-contract.ts
function createWebSearchProviderContractFields(options) {
	const selectionPluginId = options.selectionPluginId;
	return {
		...createBaseWebSearchProviderContractFields(options),
		...selectionPluginId ? { applySelectionConfig: (config) => enablePluginInConfig(config, selectionPluginId).config } : {}
	};
}
//#endregion
export { createWebSearchProviderContractFields as t };
