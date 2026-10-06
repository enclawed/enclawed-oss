import type { WebSearchProviderPlugin } from "@enclawed/plugin-sdk/provider-web-search-contract";
import { createDuckDuckGoWebSearchProviderBase } from "./src/ddg-search-provider.shared.js";

export function createDuckDuckGoWebSearchProvider(): WebSearchProviderPlugin {
  return {
    ...createDuckDuckGoWebSearchProviderBase(),
    createTool: () => null,
  };
}
