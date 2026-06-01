import type { EnclawedConfig } from "../config/types.enclawed.js";
export type ToolFsPolicy = {
    workspaceOnly: boolean;
};
export declare function createToolFsPolicy(params: {
    workspaceOnly?: boolean;
}): ToolFsPolicy;
export declare function resolveToolFsConfig(params: {
    cfg?: EnclawedConfig;
    agentId?: string;
}): {
    workspaceOnly?: boolean;
};
export declare function resolveEffectiveToolFsWorkspaceOnly(params: {
    cfg?: EnclawedConfig;
    agentId?: string;
}): boolean;
export declare function resolveEffectiveToolFsRootExpansionAllowed(params: {
    cfg?: EnclawedConfig;
    agentId?: string;
}): boolean;
