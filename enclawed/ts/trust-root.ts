// TypeScript shim over ../src/trust-root.mjs.

import * as impl from "../src/trust-root.mjs";

export type TrustRootSigner = Readonly<{
  keyId: string;
  publicKeyPem: string;
  approvedClearance: ReadonlyArray<string>;
  description?: string;
  notAfter?: string;
}>;

export const DEFAULT_TRUST_ROOT: ReadonlyArray<TrustRootSigner> =
  impl.DEFAULT_TRUST_ROOT as ReadonlyArray<TrustRootSigner>;

export class TrustRootLockedError extends Error {
  constructor() {
    super("trust root is locked; setTrustRoot/resetTrustRoot rejected post-lock");
    this.name = "TrustRootLockedError";
  }
}

export function getTrustRoot(): ReadonlyArray<TrustRootSigner> {
  return impl.getTrustRoot() as ReadonlyArray<TrustRootSigner>;
}

export function setTrustRoot(signers: ReadonlyArray<TrustRootSigner>): void {
  impl.setTrustRoot(signers as unknown as Parameters<typeof impl.setTrustRoot>[0]);
}

export function findSigner(keyId: string): TrustRootSigner | undefined {
  return impl.findSigner(keyId) as TrustRootSigner | undefined;
}

export function lockTrustRoot(): void {
  impl.lockTrustRoot();
}

export function isTrustRootLocked(): boolean {
  return impl.isTrustRootLocked();
}

export function resetTrustRoot(): void {
  impl.resetTrustRoot();
}

export function _unsafeUnlockTrustRootForTest(): void {
  impl._unsafeUnlockTrustRootForTest();
}
