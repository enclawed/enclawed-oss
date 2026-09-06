import type { EnclawedConfig } from "../../config/types.enclawed.js";
import type { AuthProfileStore } from "./types.js";
type OAuthSecretRefPolicyViolation = {
    profileId: string;
    path: string;
    reason: string;
};
export declare function collectOAuthSecretRefPolicyViolations(params: {
    store: AuthProfileStore;
    cfg?: EnclawedConfig;
    profileIds?: Iterable<string>;
}): OAuthSecretRefPolicyViolation[];
export declare function assertNoOAuthSecretRefPolicyViolations(params: {
    store: AuthProfileStore;
    cfg?: EnclawedConfig;
    profileIds?: Iterable<string>;
    context?: string;
}): void;
export {};
