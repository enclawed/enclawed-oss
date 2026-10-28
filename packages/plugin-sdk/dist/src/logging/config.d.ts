import type { EnclawedConfig } from "../config/types.enclawed.js";
type LoggingConfig = EnclawedConfig["logging"];
export declare function shouldSkipMutatingLoggingConfigRead(argv?: string[]): boolean;
export declare function readLoggingConfig(): LoggingConfig | undefined;
export {};
