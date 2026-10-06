import type { EnclawedConfig } from "../config/types.enclawed.js";
export declare function resolveDiagnosticFlags(cfg?: EnclawedConfig, env?: NodeJS.ProcessEnv): string[];
export declare function matchesDiagnosticFlag(flag: string, enabledFlags: string[]): boolean;
export declare function isDiagnosticFlagEnabled(flag: string, cfg?: EnclawedConfig, env?: NodeJS.ProcessEnv): boolean;
