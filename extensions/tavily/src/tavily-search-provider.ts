import {
  createWebSearchProviderContractFields,
  type WebSearchProviderPlugin,
  type WebSearchProviderToolDefinition,
} from "@enclawed/plugin-sdk/provider-web-search-contract";

const TAVILY_CREDENTIAL_PATH = "plugins.entries.tavily.config.webSearch.apiKey";

/** Key of a tool's declared observation (the request a call sends). */
const TOOL_OBSERVATION = Symbol.for("enclawed.tool-observation");

type TavilyClientModule = typeof import("./tavily-client.js");

let tavilyClientModulePromise: Promise<TavilyClientModule> | undefined;

function loadTavilyClientModule(): Promise<TavilyClientModule> {
  tavilyClientModulePromise ??= import("./tavily-client.js");
  return tavilyClientModulePromise;
}

const GenericTavilySearchSchema = {
  type: "object",
  properties: {
    query: { type: "string", description: "Search query string." },
    count: {
      type: "number",
      description: "Number of results to return (1-20).",
      minimum: 1,
      maximum: 20,
    },
  },
  additionalProperties: false,
} satisfies Record<string, unknown>;

/** The web_search arguments a Tavily search reads (execute and the observation share it). */
function readTavilyWebSearchArgs(args: Record<string, unknown>) {
  return {
    query: typeof args.query === "string" ? args.query : "",
    maxResults: typeof args.count === "number" ? args.count : undefined,
  };
}

export function createTavilyWebSearchProvider(): WebSearchProviderPlugin {
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
      searchCredential: { type: "scoped", scopeId: "tavily" },
      configuredCredential: { pluginId: "tavily" },
      selectionPluginId: "tavily",
    }),
    createTool: (ctx) => {
      const definition: WebSearchProviderToolDefinition = {
        description:
          "Search the web using Tavily. Returns structured results with snippets. Use tavily_search for Tavily-specific options like search depth, topic filtering, or AI answers.",
        parameters: GenericTavilySearchSchema,
        execute: async (args) => {
          const { runTavilySearch } = await loadTavilyClientModule();
          return await runTavilySearch({ cfg: ctx.config, ...readTavilyWebSearchArgs(args) });
        },
      };
      // The request a call sends, for the egress action batcher's key: a
      // search queried by POST, so the owner declares it a read. The API key
      // travels in the Authorization header and is left out.
      Object.defineProperty(definition, TOOL_OBSERVATION, {
        enumerable: true,
        value: async (args: Record<string, unknown>) => {
          const { buildTavilySearchRequest } = await loadTavilyClientModule();
          const { url, body } = buildTavilySearchRequest({
            cfg: ctx.config,
            ...readTavilyWebSearchArgs(args),
          });
          return {
            type: "http",
            method: "POST",
            url,
            body: JSON.stringify(body),
            read: true,
            client: "web_search:tavily",
          };
        },
      });
      return definition;
    },
  };
}
