export type TrustRootSigner = Readonly<{
  keyId: string;
  publicKeyPem: string;
  approvedClearance: ReadonlyArray<string>;
  description?: string;
}>;

export const DEFAULT_TRUST_ROOT: ReadonlyArray<TrustRootSigner>;

export class TrustRootLockedError extends Error {
  constructor();
}

export function getTrustRoot(): ReadonlyArray<TrustRootSigner>;
export function setTrustRoot(signers: ReadonlyArray<TrustRootSigner>): void;
export function findSigner(keyId: string): TrustRootSigner | undefined;
export function lockTrustRoot(): void;
export function isTrustRootLocked(): boolean;
export function resetTrustRoot(): void;
export function _unsafeUnlockTrustRootForTest(): void;
