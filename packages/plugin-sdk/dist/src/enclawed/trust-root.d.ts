import type { ClearanceLevel } from "./module-manifest.js";
export type TrustedSigner = Readonly<{
    keyId: string;
    publicKeyPem: string;
    approvedClearance: ReadonlyArray<ClearanceLevel>;
    description: string;
    notAfter?: string;
}>;
export declare const DEFAULT_TRUST_ROOT: ReadonlyArray<TrustedSigner>;
export declare class TrustRootLockedError extends Error {
    name: string;
    constructor();
}
export declare function getTrustRoot(): ReadonlyArray<TrustedSigner>;
export declare function setTrustRoot(signers: ReadonlyArray<TrustedSigner>): void;
export declare function findSigner(keyId: string): TrustedSigner | undefined;
export declare function lockTrustRoot(): void;
export declare function isTrustRootLocked(): boolean;
