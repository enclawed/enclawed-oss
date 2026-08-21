import type { EnclawedConfig } from "./types.js";
export declare function collectConfigRuntimeEnvVars(cfg?: EnclawedConfig): Record<string, string>;
export declare function collectConfigServiceEnvVars(cfg?: EnclawedConfig): Record<string, string>;
/** @deprecated Use `collectConfigRuntimeEnvVars` or `collectConfigServiceEnvVars`. */
export declare function collectConfigEnvVars(cfg?: EnclawedConfig): Record<string, string>;
export declare function createConfigRuntimeEnv(cfg: EnclawedConfig, baseEnv?: NodeJS.ProcessEnv): NodeJS.ProcessEnv;
export declare function applyConfigEnvVars(cfg: EnclawedConfig, env?: NodeJS.ProcessEnv): void;
