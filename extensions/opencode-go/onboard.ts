import {
  applyAgentDefaultModelPrimary,
  type EnclawedConfig,
} from "@enclawed/plugin-sdk/provider-onboard";

export const OPENCODE_GO_DEFAULT_MODEL_REF = "opencode-go/kimi-k2.6";

export function applyOpencodeGoProviderConfig(cfg: EnclawedConfig): EnclawedConfig {
  return cfg;
}

export function applyOpencodeGoConfig(cfg: EnclawedConfig): EnclawedConfig {
  return applyAgentDefaultModelPrimary(
    applyOpencodeGoProviderConfig(cfg),
    OPENCODE_GO_DEFAULT_MODEL_REF,
  );
}
