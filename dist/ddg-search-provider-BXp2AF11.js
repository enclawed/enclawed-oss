import { d as readNumberParam, h as readStringParam } from "./common-C_zplWg2.js";
import "./param-readers-BUMA1RKN.js";
import { t as createDuckDuckGoWebSearchProviderBase } from "./ddg-search-provider.shared-j2hjZNbU.js";
//#region extensions/duckduckgo/src/ddg-search-provider.ts
/** Key of a tool's declared observation (the request a call sends). */
const TOOL_OBSERVATION = Symbol.for("enclawed.tool-observation");
let duckDuckGoClientModulePromise;
function loadDuckDuckGoClientModule() {
	duckDuckGoClientModulePromise ??= import("./ddg-client-BkzAo0a7.js");
	return duckDuckGoClientModulePromise;
}
const DuckDuckGoSearchSchema = {
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
		region: {
			type: "string",
			description: "Optional DuckDuckGo region code such as us-en, uk-en, or de-de."
		},
		safeSearch: {
			type: "string",
			description: "SafeSearch level: strict, moderate, or off."
		}
	},
	additionalProperties: false
};
/** The tool arguments a DuckDuckGo search reads (execute and the observation share it). */
function readDuckDuckGoSearchArgs(args) {
	return {
		query: readStringParam(args, "query", { required: true }),
		count: readNumberParam(args, "count", { integer: true }),
		region: readStringParam(args, "region"),
		safeSearch: readStringParam(args, "safeSearch")
	};
}
function createDuckDuckGoWebSearchProvider() {
	return {
		...createDuckDuckGoWebSearchProviderBase(),
		createTool: (ctx) => {
			const definition = {
				description: "Search the web using DuckDuckGo. Returns titles, URLs, and snippets with no API key required.",
				parameters: DuckDuckGoSearchSchema,
				execute: async (args) => {
					const { runDuckDuckGoSearch } = await loadDuckDuckGoClientModule();
					return await runDuckDuckGoSearch({
						config: ctx.config,
						...readDuckDuckGoSearchArgs(args)
					});
				}
			};
			Object.defineProperty(definition, TOOL_OBSERVATION, {
				enumerable: true,
				value: async (args) => {
					const { query, region, safeSearch } = readDuckDuckGoSearchArgs(args);
					const { buildDuckDuckGoSearchRequest } = await loadDuckDuckGoClientModule();
					const { url } = buildDuckDuckGoSearchRequest({
						config: ctx.config,
						query,
						region,
						safeSearch
					});
					return {
						type: "http",
						method: "GET",
						url,
						client: "web_search:duckduckgo"
					};
				}
			});
			return definition;
		}
	};
}
//#endregion
export { createDuckDuckGoWebSearchProvider as t };
