import fs from "node:fs";
import JSON5 from "json5";
import type { ConfigWriteOptions } from "./io.types.js";
import { clearRuntimeConfigSnapshot as clearRuntimeConfigSnapshotState, getRuntimeConfigSnapshot as getRuntimeConfigSnapshotState, getRuntimeConfigSourceSnapshot as getRuntimeConfigSourceSnapshotState, resetConfigRuntimeState as resetConfigRuntimeStateState, setRuntimeConfigSnapshot as setRuntimeConfigSnapshotState, setRuntimeConfigSnapshotRefreshHandler as setRuntimeConfigSnapshotRefreshHandlerState, type RuntimeConfigWriteNotification } from "./runtime-snapshot.js";
import type { EnclawedConfig, ConfigFileSnapshot } from "./types.js";
export { clearRuntimeConfigSnapshotState as clearRuntimeConfigSnapshot, getRuntimeConfigSnapshotState as getRuntimeConfigSnapshot, getRuntimeConfigSourceSnapshotState as getRuntimeConfigSourceSnapshot, resetConfigRuntimeStateState as resetConfigRuntimeState, setRuntimeConfigSnapshotState as setRuntimeConfigSnapshot, setRuntimeConfigSnapshotRefreshHandlerState as setRuntimeConfigSnapshotRefreshHandler, };
export { CircularIncludeError, ConfigIncludeError } from "./includes.js";
export { MissingEnvVarError } from "./env-substitution.js";
export { resolveShellEnvExpectedKeys } from "./shell-env-expected-keys.js";
export type ParseConfigJson5Result = {
    ok: true;
    parsed: unknown;
} | {
    ok: false;
    error: string;
};
export type { ConfigWriteOptions };
export type ReadConfigFileSnapshotForWriteResult = {
    snapshot: ConfigFileSnapshot;
    writeOptions: ConfigWriteOptions;
};
export type ConfigWriteNotification = RuntimeConfigWriteNotification;
export declare class ConfigRuntimeRefreshError extends Error {
    constructor(message: string, options?: {
        cause?: unknown;
    });
}
export declare function resolveConfigSnapshotHash(snapshot: {
    hash?: string;
    raw?: string | null;
}): string | null;
export type ConfigIoDeps = {
    fs?: typeof fs;
    json5?: typeof JSON5;
    env?: NodeJS.ProcessEnv;
    homedir?: () => string;
    configPath?: string;
    logger?: Pick<typeof console, "error" | "warn">;
};
export declare function parseConfigJson5(raw: string, json5?: {
    parse: (value: string) => unknown;
}): ParseConfigJson5Result;
export declare function createConfigIO(overrides?: ConfigIoDeps): {
    configPath: string;
    loadConfig: () => EnclawedConfig;
    readBestEffortConfig: () => Promise<EnclawedConfig>;
    readSourceConfigBestEffort: () => Promise<EnclawedConfig>;
    readConfigFileSnapshot: () => Promise<ConfigFileSnapshot>;
    readConfigFileSnapshotForWrite: () => Promise<ReadConfigFileSnapshotForWriteResult>;
    writeConfigFile: (cfg: EnclawedConfig, options?: ConfigWriteOptions) => Promise<{
        persistedHash: string;
    }>;
};
export declare function clearConfigCache(): void;
export declare function registerConfigWriteListener(listener: (event: ConfigWriteNotification) => void): () => void;
export declare function projectConfigOntoRuntimeSourceSnapshot(config: EnclawedConfig): EnclawedConfig;
export declare function loadConfig(): EnclawedConfig;
export declare function getRuntimeConfig(): EnclawedConfig;
export declare function readBestEffortConfig(): Promise<EnclawedConfig>;
export declare function readSourceConfigBestEffort(): Promise<EnclawedConfig>;
export declare function readConfigFileSnapshot(): Promise<ConfigFileSnapshot>;
export declare function readSourceConfigSnapshot(): Promise<ConfigFileSnapshot>;
export declare function readConfigFileSnapshotForWrite(): Promise<ReadConfigFileSnapshotForWriteResult>;
export declare function readSourceConfigSnapshotForWrite(): Promise<ReadConfigFileSnapshotForWriteResult>;
export declare function writeConfigFile(cfg: EnclawedConfig, options?: ConfigWriteOptions): Promise<void>;
