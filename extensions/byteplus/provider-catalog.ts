import { buildManifestModelProviderConfig } from "@enclawed/plugin-sdk/provider-catalog-shared";
import type { ModelProviderConfig } from "@enclawed/plugin-sdk/provider-model-shared";
import manifest from "./enclawed.plugin.json" with { type: "json" };

export function buildBytePlusProvider(): ModelProviderConfig {
  return buildManifestModelProviderConfig({
    providerId: "byteplus",
    catalog: manifest.modelCatalog.providers.byteplus,
  });
}

export function buildBytePlusCodingProvider(): ModelProviderConfig {
  return buildManifestModelProviderConfig({
    providerId: "byteplus-plan",
    catalog: manifest.modelCatalog.providers["byteplus-plan"],
  });
}
