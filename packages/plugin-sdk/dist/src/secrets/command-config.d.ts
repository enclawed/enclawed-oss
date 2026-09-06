import type { EnclawedConfig } from "../config/types.enclawed.js";
export type CommandSecretAssignment = {
    path: string;
    pathSegments: string[];
    value: unknown;
};
export type ResolveAssignmentsFromSnapshotResult = {
    assignments: CommandSecretAssignment[];
    diagnostics: string[];
};
export type UnresolvedCommandSecretAssignment = {
    path: string;
    pathSegments: string[];
};
export type AnalyzeAssignmentsFromSnapshotResult = {
    assignments: CommandSecretAssignment[];
    diagnostics: string[];
    unresolved: UnresolvedCommandSecretAssignment[];
    inactive: UnresolvedCommandSecretAssignment[];
};
export declare function analyzeCommandSecretAssignmentsFromSnapshot(params: {
    sourceConfig: EnclawedConfig;
    resolvedConfig: EnclawedConfig;
    targetIds: ReadonlySet<string>;
    inactiveRefPaths?: ReadonlySet<string>;
    allowedPaths?: ReadonlySet<string>;
}): AnalyzeAssignmentsFromSnapshotResult;
export declare function collectCommandSecretAssignmentsFromSnapshot(params: {
    sourceConfig: EnclawedConfig;
    resolvedConfig: EnclawedConfig;
    commandName: string;
    targetIds: ReadonlySet<string>;
    inactiveRefPaths?: ReadonlySet<string>;
    allowedPaths?: ReadonlySet<string>;
}): ResolveAssignmentsFromSnapshotResult;
