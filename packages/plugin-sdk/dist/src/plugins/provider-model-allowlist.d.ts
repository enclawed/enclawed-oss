import type { EnclawedConfig } from "../config/types.enclawed.js";
export declare function ensureModelAllowlistEntry(params: {
    cfg: EnclawedConfig;
    modelRef: string;
    defaultProvider?: string;
}): EnclawedConfig;
