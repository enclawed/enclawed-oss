import type { EnclawedConfig } from "../config/types.enclawed.js";
import type { AnyAgentTool } from "./tools/common.js";
export declare function collectPresentEnclawedTools(candidates: readonly (AnyAgentTool | null | undefined)[]): AnyAgentTool[];
export declare function isUpdatePlanToolEnabledForEnclawedTools(params: {
    config?: EnclawedConfig;
    agentSessionKey?: string;
    agentId?: string | null;
    modelProvider?: string;
    modelId?: string;
}): boolean;
