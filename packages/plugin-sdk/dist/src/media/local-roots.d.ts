import type { EnclawedConfig } from "../config/types.js";
type BuildMediaLocalRootsOptions = {
    preferredTmpDir?: string;
};
export declare function buildMediaLocalRoots(stateDir: string, configDir: string, options?: BuildMediaLocalRootsOptions): string[];
export declare function getDefaultMediaLocalRoots(): readonly string[];
export declare function getAgentScopedMediaLocalRoots(cfg: EnclawedConfig, agentId?: string): readonly string[];
export declare function appendLocalMediaParentRoots(roots: readonly string[], mediaSources?: readonly string[]): string[];
export declare function getAgentScopedMediaLocalRootsForSources(params: {
    cfg: EnclawedConfig;
    agentId?: string;
    mediaSources?: readonly string[];
}): readonly string[];
export {};
