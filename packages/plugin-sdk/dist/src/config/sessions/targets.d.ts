import type { EnclawedConfig } from "../types.enclawed.js";
export type SessionStoreSelectionOptions = {
    store?: string;
    agent?: string;
    allAgents?: boolean;
};
export type SessionStoreTarget = {
    agentId: string;
    storePath: string;
};
export declare function resolveAllAgentSessionStoreTargetsSync(cfg: EnclawedConfig, params?: {
    env?: NodeJS.ProcessEnv;
}): SessionStoreTarget[];
export declare function resolveAllAgentSessionStoreTargets(cfg: EnclawedConfig, params?: {
    env?: NodeJS.ProcessEnv;
}): Promise<SessionStoreTarget[]>;
export declare function resolveSessionStoreTargets(cfg: EnclawedConfig, opts: SessionStoreSelectionOptions, params?: {
    env?: NodeJS.ProcessEnv;
}): SessionStoreTarget[];
