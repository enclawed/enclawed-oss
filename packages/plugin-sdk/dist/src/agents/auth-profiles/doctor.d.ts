import type { EnclawedConfig } from "../../config/types.enclawed.js";
import type { AuthProfileStore } from "./types.js";
export declare function formatAuthDoctorHint(params: {
    cfg?: EnclawedConfig;
    store: AuthProfileStore;
    provider: string;
    profileId?: string;
}): Promise<string>;
