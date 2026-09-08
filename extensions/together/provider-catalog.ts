import { buildManifestModelProviderConfig } from "@enclawed/plugin-sdk/provider-catalog-shared";
import type { ModelProviderConfig } from "@enclawed/plugin-sdk/provider-model-shared";
import manifest from "./enclawed.plugin.json" with { type: "json" };

export function buildTogetherProvider(): ModelProviderConfig {
  return buildManifestModelProviderConfig({
    providerId: "together",
    catalog: manifest.modelCatalog.providers.together,
  });
}
