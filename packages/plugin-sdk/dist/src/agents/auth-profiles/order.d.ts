import type { EnclawedConfig } from "../../config/types.enclawed.js";
import { type AuthCredentialReasonCode } from "./credential-state.js";
import type { AuthProfileStore } from "./types.js";
export type AuthProfileEligibilityReasonCode = AuthCredentialReasonCode | "profile_missing" | "provider_mismatch" | "mode_mismatch";
export type AuthProfileEligibility = {
    eligible: boolean;
    reasonCode: AuthProfileEligibilityReasonCode;
};
export declare function resolveAuthProfileEligibility(params: {
    cfg?: EnclawedConfig;
    store: AuthProfileStore;
    provider: string;
    profileId: string;
    now?: number;
}): AuthProfileEligibility;
export declare function resolveAuthProfileOrder(params: {
    cfg?: EnclawedConfig;
    store: AuthProfileStore;
    provider: string;
    preferredProfile?: string;
}): string[];
