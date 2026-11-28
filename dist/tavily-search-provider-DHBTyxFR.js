import { t as createWebSearchProviderContractFields } from "./provider-web-search-contract-C_mgxOK6.js";
//#region extensions/tavily/src/tavily-search-provider.ts
const TAVILY_CREDENTIAL_PATH = "plugins.entries.tavily.config.webSearch.apiKey";
/** Key of a tool's declared observation (the request a call sends). */
const TOOL_OBSERVATION = Symbol.for("enclawed.tool-observation");
let tavilyClientModulePromise;
function loadTavilyClientModule() {
	tavilyClientModulePromise ??= import("./tavily-client-Ddi-4GSs.js");
	return tavilyClientModulePromise;
}
const GenericTavilySearchSchema = {
	type: "object",
	properties: {
		query: {
			type: "string",
			description: "Search query string."
		},
		count: {
			type: "number",
			description: "Number of results to return (1-20).",
			minimum: 1,
			maximum: 20
		}
	},
	additionalProperties: false
};
/** The web_search arguments a Tavily search reads (execute and the observation share it). */
function readTavilyWebSearchArgs(args) {
	return {
		query: typeof args.query === "string" ? args.query : "",
		maxResults: typeof args.count === "number" ? args.count : void 0
	};
}
function createTavilyWebSearchProvider() {
	return {
		id: "tavily",
		label: "Tavily Search",
		hint: "Structured results with domain filters and AI answer summaries",
		onboardingScopes: ["text-inference"],
		credentialLabel: "Tavily API key",
		envVars: ["TAVILY_API_KEY"],
		placeholder: "tvly-...",
		signupUrl: "https://tavily.com/",
		docsUrl: "https://github.com/enclawed/enclawed-oss/blob/main/docs/tools/tavily.md",
		autoDetectOrder: 70,
		credentialPath: TAVILY_CREDENTIAL_PATH,
		...createWebSearchProviderContractFields({
			credentialPath: TAVILY_CREDENTIAL_PATH,
			searchCredential: {
				type: "scoped",
				scopeId: "tavily"
			},
			configuredCredential: { pluginId: "tavily" },
			selectionPluginId: "tavily"
		}),
		createTool: (ctx) => {
			const definition = {
				description: "Search the web using Tavily. Returns structured results with snippets. Use tavily_search for Tavily-specific options like search depth, topic filtering, or AI answers.",
				parameters: GenericTavilySearchSchema,
				execute: async (args) => {
					const { runTavilySearch } = await loadTavilyClientModule();
					return await runTavilySearch({
						cfg: ctx.config,
						...readTavilyWebSearchArgs(args)
					});
				}
			};
			Object.defineProperty(definition, TOOL_OBSERVATION, {
				enumerable: true,
				value: async (args) => {
					const { buildTavilySearchRequest } = await loadTavilyClientModule();
					const { url, body } = buildTavilySearchRequest({
						cfg: ctx.config,
						...readTavilyWebSearchArgs(args)
					});
					return {
						type: "http",
						method: "POST",
						url,
						body: JSON.stringify(body),
						read: true,
						client: "web_search:tavily"
					};
				}
			});
			return definition;
		}
	};
}
//#endregion
export { createTavilyWebSearchProvider as t };
