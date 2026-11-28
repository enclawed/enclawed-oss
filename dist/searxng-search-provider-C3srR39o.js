import { d as readNumberParam, h as readStringParam } from "./common-C_zplWg2.js";
import { t as createWebSearchProviderContractFields } from "./provider-web-search-contract-C_mgxOK6.js";
import "./param-readers-BUMA1RKN.js";
//#region extensions/searxng/src/searxng-search-provider.ts
const SEARXNG_CREDENTIAL_PATH = "plugins.entries.searxng.config.webSearch.baseUrl";
/** Key of a tool's declared observation (the request a call sends). */
const TOOL_OBSERVATION = Symbol.for("enclawed.tool-observation");
let searxngClientModulePromise;
function loadSearxngClientModule() {
	searxngClientModulePromise ??= import("./searxng-client-C_1Ec8qh.js");
	return searxngClientModulePromise;
}
const SearxngSearchSchema = {
	type: "object",
	properties: {
		query: {
			type: "string",
			description: "Search query string."
		},
		count: {
			type: "number",
			description: "Number of results to return (1-10).",
			minimum: 1,
			maximum: 10
		},
		categories: {
			type: "string",
			description: "Optional comma-separated search categories such as general, news, or science."
		},
		language: {
			type: "string",
			description: "Optional language code for results such as en, de, or fr."
		}
	},
	additionalProperties: false
};
/** The tool arguments a SearXNG search reads (execute and the observation share it). */
function readSearxngSearchArgs(args) {
	return {
		query: readStringParam(args, "query", { required: true }),
		count: readNumberParam(args, "count", { integer: true }),
		categories: readStringParam(args, "categories"),
		language: readStringParam(args, "language")
	};
}
function createSearxngWebSearchProvider() {
	return {
		id: "searxng",
		label: "SearXNG Search",
		hint: "Self-hosted meta-search with no API key required",
		onboardingScopes: ["text-inference"],
		requiresCredential: true,
		credentialLabel: "SearXNG Base URL",
		envVars: ["SEARXNG_BASE_URL"],
		placeholder: "http://localhost:8080",
		signupUrl: "https://docs.searxng.org/",
		autoDetectOrder: 200,
		credentialPath: SEARXNG_CREDENTIAL_PATH,
		...createWebSearchProviderContractFields({
			credentialPath: SEARXNG_CREDENTIAL_PATH,
			searchCredential: {
				type: "scoped",
				scopeId: "searxng"
			},
			configuredCredential: {
				pluginId: "searxng",
				field: "baseUrl"
			},
			selectionPluginId: "searxng"
		}),
		createTool: (ctx) => {
			const definition = {
				description: "Search the web using a self-hosted SearXNG instance. Returns titles, URLs, and snippets.",
				parameters: SearxngSearchSchema,
				execute: async (args) => {
					const { runSearxngSearch } = await loadSearxngClientModule();
					return await runSearxngSearch({
						config: ctx.config,
						...readSearxngSearchArgs(args)
					});
				}
			};
			Object.defineProperty(definition, TOOL_OBSERVATION, {
				enumerable: true,
				value: async (args) => {
					const { query, categories, language } = readSearxngSearchArgs(args);
					const { resolveSearxngSearchRequest } = await loadSearxngClientModule();
					const { url } = await resolveSearxngSearchRequest({
						config: ctx.config,
						query,
						categories,
						language
					});
					return {
						type: "http",
						method: "GET",
						url,
						client: "web_search:searxng"
					};
				}
			});
			return definition;
		}
	};
}
//#endregion
export { createSearxngWebSearchProvider as t };
