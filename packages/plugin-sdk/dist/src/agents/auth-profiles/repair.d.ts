import type { EnclawedConfig } from "../../config/types.enclawed.js";
import type { AuthProfileIdRepairResult, AuthProfileStore } from "./types.js";
export declare function suggestOAuthProfileIdForLegacyDefault(params: {
    cfg?: EnclawedConfig;
    store: AuthProfileStore;
    provider: string;
    legacyProfileId: string;
}): string | null;
export declare function repairOAuthProfileIdMismatch(params: {
    cfg: EnclawedConfig;
    store: AuthProfileStore;
    provider: string;
    legacyProfileId?: string;
}): AuthProfileIdRepairResult;
