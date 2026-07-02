import type { WebSearchProviderPlugin } from "@enclawed/plugin-sdk/provider-web-search-contract";
import { createExaWebSearchProviderBase } from "./src/exa-web-search-provider.shared.js";

export function createExaWebSearchProvider(): WebSearchProviderPlugin {
  return {
    ...createExaWebSearchProviderBase(),
    createTool: () => null,
  };
}
