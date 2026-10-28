import {
  createModelCatalogPresetAppliers,
  type EnclawedConfig,
} from "@enclawed/plugin-sdk/provider-onboard";
import {
  buildCerebrasModelDefinition,
  CEREBRAS_BASE_URL,
  CEREBRAS_MODEL_CATALOG,
} from "./models.js";

export const CEREBRAS_DEFAULT_MODEL_REF = "cerebras/zai-glm-4.7";

const cerebrasPresetAppliers = createModelCatalogPresetAppliers({
  primaryModelRef: CEREBRAS_DEFAULT_MODEL_REF,
  resolveParams: (_cfg: EnclawedConfig) => ({
    providerId: "cerebras",
    api: "openai-completions",
    baseUrl: CEREBRAS_BASE_URL,
    catalogModels: CEREBRAS_MODEL_CATALOG.map(buildCerebrasModelDefinition),
    aliases: [{ modelRef: CEREBRAS_DEFAULT_MODEL_REF, alias: "Cerebras GLM 4.7" }],
  }),
});

export function applyCerebrasConfig(cfg: EnclawedConfig): EnclawedConfig {
  return cerebrasPresetAppliers.applyConfig(cfg);
}
