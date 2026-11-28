import { readNumberParam, readStringParam } from "@enclawed/plugin-sdk/param-readers";
import type {
  WebSearchProviderPlugin,
  WebSearchProviderToolDefinition,
} from "@enclawed/plugin-sdk/provider-web-search-contract";
import { createDuckDuckGoWebSearchProviderBase } from "./ddg-search-provider.shared.js";

/** Key of a tool's declared observation (the request a call sends). */
const TOOL_OBSERVATION = Symbol.for("enclawed.tool-observation");

type DuckDuckGoClientModule = typeof import("./ddg-client.js");

let duckDuckGoClientModulePromise: Promise<DuckDuckGoClientModule> | undefined;

function loadDuckDuckGoClientModule(): Promise<DuckDuckGoClientModule> {
  duckDuckGoClientModulePromise ??= import("./ddg-client.js");
  return duckDuckGoClientModulePromise;
}

const DuckDuckGoSearchSchema = {
  type: "object",
  properties: {
    query: { type: "string", description: "Search query string." },
    count: {
      type: "number",
      description: "Number of results to return (1-10).",
      minimum: 1,
      maximum: 10,
    },
    region: {
      type: "string",
      description: "Optional DuckDuckGo region code such as us-en, uk-en, or de-de.",
    },
    safeSearch: {
      type: "string",
      description: "SafeSearch level: strict, moderate, or off.",
    },
  },
  additionalProperties: false,
} satisfies Record<string, unknown>;

/** The tool arguments a DuckDuckGo search reads (execute and the observation share it). */
function readDuckDuckGoSearchArgs(args: Record<string, unknown>) {
  return {
    query: readStringParam(args, "query", { required: true }),
    count: readNumberParam(args, "count", { integer: true }),
    region: readStringParam(args, "region"),
    safeSearch: readStringParam(args, "safeSearch") as "strict" | "moderate" | "off" | undefined,
  };
}

export function createDuckDuckGoWebSearchProvider(): WebSearchProviderPlugin {
  return {
    ...createDuckDuckGoWebSearchProviderBase(),
    createTool: (ctx) => {
      const definition: WebSearchProviderToolDefinition = {
        description:
          "Search the web using DuckDuckGo. Returns titles, URLs, and snippets with no API key required.",
        parameters: DuckDuckGoSearchSchema,
        execute: async (args) => {
          const { runDuckDuckGoSearch } = await loadDuckDuckGoClientModule();
          return await runDuckDuckGoSearch({
            config: ctx.config,
            ...readDuckDuckGoSearchArgs(args),
          });
        },
      };
      // The request a call sends, for the egress action batcher's key. count
      // only cuts the parsed results locally and is not part of it.
      Object.defineProperty(definition, TOOL_OBSERVATION, {
        enumerable: true,
        value: async (args: Record<string, unknown>) => {
          const { query, region, safeSearch } = readDuckDuckGoSearchArgs(args);
          const { buildDuckDuckGoSearchRequest } = await loadDuckDuckGoClientModule();
          const { url } = buildDuckDuckGoSearchRequest({
            config: ctx.config,
            query,
            region,
            safeSearch,
          });
          return { type: "http", method: "GET", url, client: "web_search:duckduckgo" };
        },
      });
      return definition;
    },
  };
}
