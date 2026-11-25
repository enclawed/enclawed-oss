import { t as createWebSearchProviderContractFields } from "./provider-web-search-contract-CU-NtEX6.js";
//#region extensions/duckduckgo/src/ddg-search-provider.shared.ts
function createDuckDuckGoWebSearchProviderBase() {
	return {
		id: "duckduckgo",
		label: "DuckDuckGo Search (experimental)",
		hint: "Free web search fallback with no API key required",
		requiresCredential: false,
		envVars: [],
		placeholder: "(no key needed)",
		signupUrl: "https://duckduckgo.com/",
		docsUrl: "https://github.com/enclawed/enclawed-oss/blob/main/docs/tools/web.md",
		autoDetectOrder: 100,
		credentialPath: "",
		...createWebSearchProviderContractFields({
			credentialPath: "",
			searchCredential: {
				type: "scoped",
				scopeId: "duckduckgo"
			},
			selectionPluginId: "duckduckgo"
		})
	};
}
//#endregion
export { createDuckDuckGoWebSearchProviderBase as t };
