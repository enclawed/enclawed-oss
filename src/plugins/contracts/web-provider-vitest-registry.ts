import type { WebSearchProviderPlugin } from "../types.js";

export type WebSearchProviderContractEntry = {
  pluginId: string;
  provider: WebSearchProviderPlugin;
  credentialValue: unknown;
};

// Web-search provider contract registry returns an empty list in this fork:
// the google web-search extension is stripped pending enclawed security
// review (see attic/README.md). Restore the entry here when the provider
// is reintroduced.
export function loadVitestWebSearchProviderContractRegistry(): WebSearchProviderContractEntry[] {
  return [];
}
