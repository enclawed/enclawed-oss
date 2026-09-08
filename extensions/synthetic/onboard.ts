import {
  createModelCatalogPresetAppliers,
  type EnclawedConfig,
} from "@enclawed/plugin-sdk/provider-onboard";
import {
  buildSyntheticModelDefinition,
  SYNTHETIC_BASE_URL,
  SYNTHETIC_DEFAULT_MODEL_REF,
  SYNTHETIC_MODEL_CATALOG,
} from "./models.js";

export { SYNTHETIC_DEFAULT_MODEL_REF };

const syntheticPresetAppliers = createModelCatalogPresetAppliers({
  primaryModelRef: SYNTHETIC_DEFAULT_MODEL_REF,
  resolveParams: (_cfg: EnclawedConfig) => ({
    providerId: "synthetic",
    api: "anthropic-messages",
    baseUrl: SYNTHETIC_BASE_URL,
    catalogModels: SYNTHETIC_MODEL_CATALOG.map(buildSyntheticModelDefinition),
    aliases: [{ modelRef: SYNTHETIC_DEFAULT_MODEL_REF, alias: "MiniMax M2.5" }],
  }),
});

export function applySyntheticProviderConfig(cfg: EnclawedConfig): EnclawedConfig {
  return syntheticPresetAppliers.applyProviderConfig(cfg);
}

export function applySyntheticConfig(cfg: EnclawedConfig): EnclawedConfig {
  return syntheticPresetAppliers.applyConfig(cfg);
}
