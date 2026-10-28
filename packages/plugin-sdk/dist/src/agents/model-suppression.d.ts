import type { EnclawedConfig } from "../config/types.enclawed.js";
export declare function shouldSuppressBuiltInModel(params: {
    provider?: string | null;
    id?: string | null;
    baseUrl?: string | null;
    config?: EnclawedConfig;
}): boolean;
export declare function buildSuppressedBuiltInModelError(params: {
    provider?: string | null;
    id?: string | null;
    baseUrl?: string | null;
    config?: EnclawedConfig;
}): string | undefined;
