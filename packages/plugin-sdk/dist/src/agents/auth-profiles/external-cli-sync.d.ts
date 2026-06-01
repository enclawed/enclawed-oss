import type { AuthProfileStore, OAuthCredential } from "./types.js";
export type ExternalCliResolvedProfile = {
    profileId: string;
    credential: OAuthCredential;
};
export declare function areOAuthCredentialsEquivalent(a: OAuthCredential | undefined, b: OAuthCredential): boolean;
export declare function shouldReplaceStoredOAuthCredential(existing: OAuthCredential | undefined, incoming: OAuthCredential): boolean;
export declare function hasUsableOAuthCredential(credential: OAuthCredential | undefined, now?: number): boolean;
export declare function shouldBootstrapFromExternalCliCredential(params: {
    existing: OAuthCredential | undefined;
    imported: OAuthCredential;
    now?: number;
}): boolean;
export declare function readExternalCliBootstrapCredential(params: {
    profileId: string;
    credential: OAuthCredential;
}): OAuthCredential | null;
export declare const readManagedExternalCliCredential: typeof readExternalCliBootstrapCredential;
export declare function resolveExternalCliAuthProfiles(store: AuthProfileStore): ExternalCliResolvedProfile[];
