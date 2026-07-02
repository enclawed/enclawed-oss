import type { EnclawedConfig } from "../config/types.enclawed.js";
import type { RuntimeEnv } from "../runtime.js";
export type RemovalResult = {
    ok: boolean;
    skipped?: boolean;
};
export type CleanupResolvedPaths = {
    stateDir: string;
    configPath: string;
    oauthDir: string;
    configInsideState: boolean;
    oauthInsideState: boolean;
};
export declare function collectWorkspaceDirs(cfg: EnclawedConfig | undefined): string[];
export declare function buildCleanupPlan(params: {
    cfg: EnclawedConfig | undefined;
    stateDir: string;
    configPath: string;
    oauthDir: string;
}): {
    configInsideState: boolean;
    oauthInsideState: boolean;
    workspaceDirs: string[];
};
export declare function isPathWithin(child: string, parent: string): boolean;
export declare function removePath(target: string, runtime: RuntimeEnv, opts?: {
    dryRun?: boolean;
    label?: string;
}): Promise<RemovalResult>;
export declare function removeStateAndLinkedPaths(cleanup: CleanupResolvedPaths, runtime: RuntimeEnv, opts?: {
    dryRun?: boolean;
}): Promise<void>;
export declare function removeWorkspaceDirs(workspaceDirs: readonly string[], runtime: RuntimeEnv, opts?: {
    dryRun?: boolean;
}): Promise<void>;
export declare function listAgentSessionDirs(stateDir: string): Promise<string[]>;
