import type { EnclawedConfig } from "../config/types.enclawed.js";
export declare function resolveAgentTimeoutSeconds(cfg?: EnclawedConfig): number;
export declare function resolveAgentTimeoutMs(opts: {
    cfg?: EnclawedConfig;
    overrideMs?: number | null;
    overrideSeconds?: number | null;
    minMs?: number;
}): number;
