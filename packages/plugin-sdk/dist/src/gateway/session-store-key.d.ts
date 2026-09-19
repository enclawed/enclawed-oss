import type { EnclawedConfig } from "../config/types.enclawed.js";
export declare function canonicalizeSessionKeyForAgent(agentId: string, key: string): string;
export declare function resolveSessionStoreKey(params: {
    cfg: EnclawedConfig;
    sessionKey: string;
}): string;
export declare function resolveSessionStoreAgentId(cfg: EnclawedConfig, canonicalKey: string): string;
export declare function canonicalizeSpawnedByForAgent(cfg: EnclawedConfig, agentId: string, spawnedBy?: string): string | undefined;
