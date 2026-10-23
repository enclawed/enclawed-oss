import type { AgentDefaultsConfig } from "../config/types.agent-defaults.js";
import type { EnclawedConfig } from "../config/types.js";
import { resolveAgentIdFromSessionKey } from "../routing/session-key.js";
export { listAgentEntries, listAgentIds, resolveAgentConfig, resolveAgentContextLimits, resolveAgentDir, resolveAgentWorkspaceDir, resolveDefaultAgentId, type ResolvedAgentConfig, } from "./agent-scope-config.js";
export { resolveAgentIdFromSessionKey };
export declare function resolveSessionAgentIds(params: {
    sessionKey?: string;
    config?: EnclawedConfig;
    agentId?: string;
}): {
    defaultAgentId: string;
    sessionAgentId: string;
};
export declare function resolveSessionAgentId(params: {
    sessionKey?: string;
    config?: EnclawedConfig;
}): string;
export declare function resolveAgentExecutionContract(cfg: EnclawedConfig | undefined, agentId?: string | null): NonNullable<NonNullable<AgentDefaultsConfig["embeddedPi"]>["executionContract"]> | undefined;
export declare function resolveAgentSkillsFilter(cfg: EnclawedConfig, agentId: string): string[] | undefined;
export declare function resolveAgentExplicitModelPrimary(cfg: EnclawedConfig, agentId: string): string | undefined;
export declare function resolveAgentEffectiveModelPrimary(cfg: EnclawedConfig, agentId: string): string | undefined;
export declare function resolveAgentModelPrimary(cfg: EnclawedConfig, agentId: string): string | undefined;
export declare function resolveAgentModelFallbacksOverride(cfg: EnclawedConfig, agentId: string): string[] | undefined;
export declare function resolveFallbackAgentId(params: {
    agentId?: string | null;
    sessionKey?: string | null;
}): string;
export declare function resolveRunModelFallbacksOverride(params: {
    cfg: EnclawedConfig | undefined;
    agentId?: string | null;
    sessionKey?: string | null;
}): string[] | undefined;
export declare function hasConfiguredModelFallbacks(params: {
    cfg: EnclawedConfig | undefined;
    agentId?: string | null;
    sessionKey?: string | null;
}): boolean;
export declare function resolveEffectiveModelFallbacks(params: {
    cfg: EnclawedConfig;
    agentId: string;
    hasSessionModelOverride: boolean;
}): string[] | undefined;
export declare function resolveAgentIdsByWorkspacePath(cfg: EnclawedConfig, workspacePath: string): string[];
export declare function resolveAgentIdByWorkspacePath(cfg: EnclawedConfig, workspacePath: string): string | undefined;
export type AgentModelPrimaryWriteTarget = "agent" | "defaults";
/**
 * Writes a new primary model id to the config. If the agent has an explicit
 * model.primary entry, writes it back to that entry. Otherwise, writes to
 * agents.defaults. Returns which write target was used.
 */
export declare function setAgentEffectiveModelPrimary(cfg: EnclawedConfig, agentId: string, primary: string): AgentModelPrimaryWriteTarget;
