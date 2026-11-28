import { t as createExaWebSearchProviderBase } from "./exa-web-search-provider.shared-BVdEBTSH.js";
//#region extensions/exa/src/exa-web-search-provider.ts
const EXA_SEARCH_TYPES = [
	"auto",
	"neural",
	"fast",
	"deep",
	"deep-reasoning",
	"instant"
];
const EXA_FRESHNESS_VALUES = [
	"day",
	"week",
	"month",
	"year"
];
const EXA_MAX_SEARCH_COUNT = 100;
/** Key of a tool's declared observation (the request a call sends). */
const TOOL_OBSERVATION = Symbol.for("enclawed.tool-observation");
let exaWebSearchRuntimePromise;
function loadExaWebSearchRuntime() {
	exaWebSearchRuntimePromise ??= import("./exa-web-search-provider.runtime-C1WSR46C.js");
	return exaWebSearchRuntimePromise;
}
const ExaSearchSchema = {
	type: "object",
	properties: {
		query: {
			type: "string",
			description: "Search query string."
		},
		count: {
			type: "number",
			description: "Number of results to return (1-100, subject to Exa search-type limits).",
			minimum: 1,
			maximum: EXA_MAX_SEARCH_COUNT
		},
		freshness: {
			type: "string",
			enum: [...EXA_FRESHNESS_VALUES],
			description: "Filter by time: \"day\", \"week\", \"month\", or \"year\"."
		},
		date_after: {
			type: "string",
			description: "Only results published after this date (YYYY-MM-DD)."
		},
		date_before: {
			type: "string",
			description: "Only results published before this date (YYYY-MM-DD)."
		},
		type: {
			type: "string",
			enum: [...EXA_SEARCH_TYPES],
			description: "Exa search mode: \"auto\", \"neural\", \"fast\", \"deep\", \"deep-reasoning\", or \"instant\"."
		},
		contents: {
			type: "object",
			properties: {
				highlights: { description: "Highlights config: true, or an object with maxCharacters, query, numSentences, or highlightsPerUrl." },
				text: { description: "Text config: true, or an object with maxCharacters." },
				summary: { description: "Summary config: true, or an object with query." }
			},
			additionalProperties: false
		}
	},
	additionalProperties: false
};
function createExaWebSearchProvider() {
	return {
		...createExaWebSearchProviderBase(),
		createTool: (ctx) => {
			const definition = {
				description: "Search the web using Exa AI. Supports neural or keyword search, publication date filters, and optional highlights or text extraction.",
				parameters: ExaSearchSchema,
				execute: async (args) => {
					const { executeExaWebSearchProviderTool } = await loadExaWebSearchRuntime();
					return await executeExaWebSearchProviderTool(ctx, args);
				}
			};
			Object.defineProperty(definition, TOOL_OBSERVATION, {
				enumerable: true,
				value: async (args) => {
					const { observeExaWebSearch } = await loadExaWebSearchRuntime();
					return observeExaWebSearch(ctx, args);
				}
			});
			return definition;
		}
	};
}
//#endregion
export { createExaWebSearchProvider as t };
