import type { EnclawedConfig } from "../../config/types.enclawed.js";

export function makeModelFallbackCfg(overrides: Partial<EnclawedConfig> = {}): EnclawedConfig {
  return {
    agents: {
      defaults: {
        model: {
          primary: "openai/gpt-4.1-mini",
          fallbacks: ["anthropic/claude-haiku-3-5"],
        },
      },
    },
    ...overrides,
  } as EnclawedConfig;
}
