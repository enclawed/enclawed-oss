import type { ProviderPlugin } from "../types.js";

export type ProviderContractEntry = {
  pluginId: string;
  provider: ProviderPlugin;
};

// Provider contract registry returns an empty list in this fork: the
// anthropic / google / openai cloud LLM extensions are stripped pending
// enclawed security review (see attic/README.md). Restoring any of those
// providers should re-add the corresponding entries here.
export function loadVitestProviderContractRegistry(): ProviderContractEntry[] {
  return [];
}
