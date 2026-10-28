import type { EnclawedConfig } from "../../config/types.enclawed.js";
import type { AuthProfileStore } from "./types.js";
export declare function buildAuthProfileId(params: {
    providerId: string;
    profileName?: string | null;
    profilePrefix?: string;
}): string;
export declare function resolveAuthProfileMetadata(params: {
    cfg?: EnclawedConfig;
    store?: AuthProfileStore;
    profileId: string;
}): {
    displayName?: string;
    email?: string;
};
