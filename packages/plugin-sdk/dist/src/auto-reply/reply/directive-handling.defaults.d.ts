import { type ModelAliasIndex } from "../../agents/model-selection.js";
import type { EnclawedConfig } from "../../config/types.enclawed.js";
export declare function resolveDefaultModel(params: {
    cfg: EnclawedConfig;
    agentId?: string;
}): {
    defaultProvider: string;
    defaultModel: string;
    aliasIndex: ModelAliasIndex;
};
