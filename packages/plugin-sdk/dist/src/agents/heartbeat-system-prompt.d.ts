import type { EnclawedConfig } from "../config/types.enclawed.js";
export declare function shouldIncludeHeartbeatGuidanceForSystemPrompt(params: {
    config?: EnclawedConfig;
    agentId?: string;
    defaultAgentId?: string;
}): boolean;
export declare function resolveHeartbeatPromptForSystemPrompt(params: {
    config?: EnclawedConfig;
    agentId?: string;
    defaultAgentId?: string;
}): string | undefined;
