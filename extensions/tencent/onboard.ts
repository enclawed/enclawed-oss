import {
  applyAgentDefaultModelPrimary,
  applyProviderConfigWithModelCatalog,
  type EnclawedConfig,
} from "@enclawed/plugin-sdk/provider-onboard";
import {
  buildTokenHubModelDefinition,
  TOKENHUB_BASE_URL,
  TOKENHUB_MODEL_CATALOG,
  TOKENHUB_PROVIDER_ID,
} from "./api.js";

// ---------- TokenHub ----------

export const TOKENHUB_DEFAULT_MODEL_REF = `${TOKENHUB_PROVIDER_ID}/hy3-preview`;

function applyTokenHubProviderConfig(cfg: EnclawedConfig): EnclawedConfig {
  const models = { ...cfg.agents?.defaults?.models };
  models[TOKENHUB_DEFAULT_MODEL_REF] = {
    ...models[TOKENHUB_DEFAULT_MODEL_REF],
    alias: models[TOKENHUB_DEFAULT_MODEL_REF]?.alias ?? "Hy3 preview (TokenHub)",
  };

  return applyProviderConfigWithModelCatalog(cfg, {
    agentModels: models,
    providerId: TOKENHUB_PROVIDER_ID,
    api: "openai-completions",
    baseUrl: TOKENHUB_BASE_URL,
    catalogModels: TOKENHUB_MODEL_CATALOG.map(buildTokenHubModelDefinition),
  });
}

export function applyTokenHubConfig(cfg: EnclawedConfig): EnclawedConfig {
  return applyAgentDefaultModelPrimary(
    applyTokenHubProviderConfig(cfg),
    TOKENHUB_DEFAULT_MODEL_REF,
  );
}
