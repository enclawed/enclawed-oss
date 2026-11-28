import {
  createWebSearchProviderContractFields,
  mergeScopedSearchConfig,
  resolveProviderWebSearchPluginConfig,
  type WebSearchProviderPlugin,
  type WebSearchProviderToolDefinition,
} from "@enclawed/plugin-sdk/provider-web-search-config-contract";
import { resolveGeminiApiKey, resolveGeminiModel } from "./gemini-web-search-provider.shared.js";

const GEMINI_CREDENTIAL_PATH = "plugins.entries.google.config.webSearch.apiKey";

type GeminiWebSearchRuntime = typeof import("./gemini-web-search-provider.runtime.js");

let geminiWebSearchRuntimePromise: Promise<GeminiWebSearchRuntime> | undefined;

function loadGeminiWebSearchRuntime(): Promise<GeminiWebSearchRuntime> {
  geminiWebSearchRuntimePromise ??= import("./gemini-web-search-provider.runtime.js");
  return geminiWebSearchRuntimePromise;
}

// The egress action batcher's key for a web_search call: the request it
// sends (`observeWebSearch` reads it from the tool definition).
const TOOL_OBSERVATION = Symbol.for("enclawed.tool-observation");

const GEMINI_TOOL_PARAMETERS = {
  type: "object",
  properties: {
    query: { type: "string", description: "Search query string." },
    count: {
      type: "number",
      description: "Number of results to return (1-10).",
      minimum: 1,
      maximum: 10,
    },
    country: { type: "string", description: "Not supported by Gemini." },
    language: { type: "string", description: "Not supported by Gemini." },
    freshness: { type: "string", description: "Not supported by Gemini." },
    date_after: { type: "string", description: "Not supported by Gemini." },
    date_before: { type: "string", description: "Not supported by Gemini." },
  },
  required: ["query"],
} satisfies Record<string, unknown>;

function createGeminiToolDefinition(
  searchConfig?: Record<string, unknown>,
): WebSearchProviderToolDefinition {
  const definition: WebSearchProviderToolDefinition = {
    description:
      "Search the web using Gemini with Google Search grounding. Returns AI-synthesized answers with citations from Google Search.",
    parameters: GEMINI_TOOL_PARAMETERS,
    execute: async (args) => {
      const { executeGeminiSearch } = await loadGeminiWebSearchRuntime();
      return await executeGeminiSearch(args, searchConfig);
    },
  };
  Object.defineProperty(definition, TOOL_OBSERVATION, {
    enumerable: true,
    value: async (args: Record<string, unknown>) => {
      const { observeGeminiSearch } = await loadGeminiWebSearchRuntime();
      return observeGeminiSearch(args, searchConfig);
    },
  });
  return definition;
}

export function createGeminiWebSearchProvider(): WebSearchProviderPlugin {
  return {
    id: "gemini",
    label: "Gemini (Google Search)",
    hint: "Requires Google Gemini API key · Google Search grounding",
    onboardingScopes: ["text-inference"],
    credentialLabel: "Google Gemini API key",
    envVars: ["GEMINI_API_KEY"],
    placeholder: "AIza...",
    signupUrl: "https://aistudio.google.com/apikey",
    docsUrl: "https://github.com/enclawed/enclawed-oss/blob/main/docs/tools/web.md",
    autoDetectOrder: 20,
    credentialPath: GEMINI_CREDENTIAL_PATH,
    ...createWebSearchProviderContractFields({
      credentialPath: GEMINI_CREDENTIAL_PATH,
      searchCredential: { type: "scoped", scopeId: "gemini" },
      configuredCredential: { pluginId: "google" },
    }),
    createTool: (ctx) =>
      createGeminiToolDefinition(
        mergeScopedSearchConfig(
          ctx.searchConfig,
          "gemini",
          resolveProviderWebSearchPluginConfig(ctx.config, "google"),
        ),
      ),
  };
}

export const __testing = {
  resolveGeminiApiKey,
  resolveGeminiModel,
} as const;
