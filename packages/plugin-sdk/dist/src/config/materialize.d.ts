import type { EnclawedConfig, ResolvedSourceConfig, RuntimeConfig } from "./types.js";
export type ConfigMaterializationMode = "load" | "missing" | "snapshot";
export declare function asResolvedSourceConfig(config: EnclawedConfig): ResolvedSourceConfig;
export declare function asRuntimeConfig(config: EnclawedConfig): RuntimeConfig;
export declare function materializeRuntimeConfig(config: EnclawedConfig, mode: ConfigMaterializationMode): RuntimeConfig;
