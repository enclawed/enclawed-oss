import type { EnclawedConfig } from "../../config/types.enclawed.js";
export type SessionToolsVisibility = "self" | "tree" | "agent" | "all";
export type AgentToAgentPolicy = {
    enabled: boolean;
    matchesAllow: (agentId: string) => boolean;
    isAllowed: (requesterAgentId: string, targetAgentId: string) => boolean;
};
export type SessionAccessAction = "history" | "send" | "list" | "status";
export type SessionAccessResult = {
    allowed: true;
} | {
    allowed: false;
    error: string;
    status: "forbidden";
};
export declare function resolveSessionToolsVisibility(cfg: EnclawedConfig): SessionToolsVisibility;
export declare function resolveEffectiveSessionToolsVisibility(params: {
    cfg: EnclawedConfig;
    sandboxed: boolean;
}): SessionToolsVisibility;
export declare function resolveSandboxSessionToolsVisibility(cfg: EnclawedConfig): "spawned" | "all";
export declare function resolveSandboxedSessionToolContext(params: {
    cfg: EnclawedConfig;
    agentSessionKey?: string;
    sandboxed?: boolean;
}): {
    mainKey: string;
    alias: string;
    visibility: "spawned" | "all";
    requesterInternalKey: string | undefined;
    effectiveRequesterKey: string;
    restrictToSpawned: boolean;
};
export declare function createAgentToAgentPolicy(cfg: EnclawedConfig): AgentToAgentPolicy;
export declare function createSessionVisibilityGuard(params: {
    action: SessionAccessAction;
    requesterSessionKey: string;
    visibility: SessionToolsVisibility;
    a2aPolicy: AgentToAgentPolicy;
}): Promise<{
    check: (targetSessionKey: string) => SessionAccessResult;
}>;
