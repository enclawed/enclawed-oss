import type { EnclawedConfig } from "./types.js";
export type DuplicateAgentDir = {
    agentDir: string;
    agentIds: string[];
};
export declare class DuplicateAgentDirError extends Error {
    readonly duplicates: DuplicateAgentDir[];
    constructor(duplicates: DuplicateAgentDir[]);
}
export declare function findDuplicateAgentDirs(cfg: EnclawedConfig, deps?: {
    env?: NodeJS.ProcessEnv;
    homedir?: () => string;
}): DuplicateAgentDir[];
export declare function formatDuplicateAgentDirError(dups: DuplicateAgentDir[]): string;
