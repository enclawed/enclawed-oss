import type { EnclawedConfig } from "./types.js";
export type RuntimeConfigSnapshotRefreshParams = {
    sourceConfig: EnclawedConfig;
};
export type ConfigWriteAfterWrite = {
    mode: "auto";
} | {
    mode: "restart";
    reason: string;
} | {
    mode: "none";
    reason: string;
};
export type ConfigWriteFollowUp = {
    mode: "auto";
    requiresRestart: false;
} | {
    mode: "none";
    reason: string;
    requiresRestart: false;
} | {
    mode: "restart";
    reason: string;
    requiresRestart: true;
};
export declare function resolveConfigWriteAfterWrite(afterWrite?: ConfigWriteAfterWrite): ConfigWriteAfterWrite;
export declare function resolveConfigWriteFollowUp(afterWrite?: ConfigWriteAfterWrite): ConfigWriteFollowUp;
export type RuntimeConfigSnapshotRefreshHandler = {
    refresh: (params: RuntimeConfigSnapshotRefreshParams) => boolean | Promise<boolean>;
    clearOnRefreshFailure?: () => void;
};
export type RuntimeConfigWriteNotification = {
    configPath: string;
    sourceConfig: EnclawedConfig;
    runtimeConfig: EnclawedConfig;
    persistedHash: string;
    revision: number;
    fingerprint: string;
    sourceFingerprint: string | null;
    writtenAtMs: number;
    afterWrite?: ConfigWriteAfterWrite;
};
export type RuntimeConfigSnapshotMetadata = {
    revision: number;
    fingerprint: string;
    sourceFingerprint: string | null;
    updatedAtMs: number;
};
export declare function hashRuntimeConfigValue(value: EnclawedConfig): string;
export declare function setRuntimeConfigSnapshot(config: EnclawedConfig, sourceConfig?: EnclawedConfig): void;
export declare function resetConfigRuntimeState(): void;
export declare function clearRuntimeConfigSnapshot(): void;
export declare function getRuntimeConfigSnapshot(): EnclawedConfig | null;
export declare function getRuntimeConfigSourceSnapshot(): EnclawedConfig | null;
export declare function getRuntimeConfigSnapshotMetadata(): RuntimeConfigSnapshotMetadata | null;
export declare function resolveRuntimeConfigCacheKey(config: EnclawedConfig): string;
export declare function createRuntimeConfigWriteNotification(params: {
    configPath: string;
    sourceConfig: EnclawedConfig;
    runtimeConfig: EnclawedConfig;
    persistedHash: string;
    writtenAtMs?: number;
    afterWrite?: ConfigWriteAfterWrite;
}): RuntimeConfigWriteNotification;
export declare function selectApplicableRuntimeConfig(params: {
    inputConfig?: EnclawedConfig;
    runtimeConfig?: EnclawedConfig | null;
    runtimeSourceConfig?: EnclawedConfig | null;
}): EnclawedConfig | undefined;
export declare function setRuntimeConfigSnapshotRefreshHandler(refreshHandler: RuntimeConfigSnapshotRefreshHandler | null): void;
export declare function getRuntimeConfigSnapshotRefreshHandler(): RuntimeConfigSnapshotRefreshHandler | null;
export declare function registerRuntimeConfigWriteListener(listener: (event: RuntimeConfigWriteNotification) => void): () => void;
export declare function notifyRuntimeConfigWriteListeners(event: RuntimeConfigWriteNotification): void;
export declare function loadPinnedRuntimeConfig(loadFresh: () => EnclawedConfig): EnclawedConfig;
export declare function finalizeRuntimeSnapshotWrite(params: {
    nextSourceConfig: EnclawedConfig;
    hadRuntimeSnapshot: boolean;
    hadBothSnapshots: boolean;
    loadFreshConfig: () => EnclawedConfig;
    notifyCommittedWrite: () => void;
    createRefreshError: (detail: string, cause: unknown) => Error;
    formatRefreshError: (error: unknown) => string;
}): Promise<void>;
