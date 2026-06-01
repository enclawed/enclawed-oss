import type { EnclawedConfig } from "../../config/types.enclawed.js";
import type { AuthProfileStore } from "./types.js";
export declare function resolveAuthProfileDisplayLabel(params: {
    cfg?: EnclawedConfig;
    store: AuthProfileStore;
    profileId: string;
}): string;
