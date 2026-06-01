import type { AgentModelListConfig } from "../config/types.js";
import type { EnclawedConfig } from "../config/types.enclawed.js";
export declare function resolvePrimaryModel(model?: AgentModelListConfig | string): string | undefined;
export declare function applyAgentDefaultPrimaryModel(params: {
    cfg: EnclawedConfig;
    model: string;
    legacyModels?: Set<string>;
}): {
    next: EnclawedConfig;
    changed: boolean;
};
export declare function applyPrimaryModel(cfg: EnclawedConfig, model: string): EnclawedConfig;
