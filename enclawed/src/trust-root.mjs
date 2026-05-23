// PLACEHOLDER trust root for the standalone .mjs reference. Mirrors
// src/enclawed/trust-root.ts; lab deployments must replace these keys.

const PLACEHOLDER_ENCLAWED_PUBKEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAGb9ECWmEzf6FQbrBZ9w7lshQhqowtrbLDFw4rXAxZv8=
-----END PUBLIC KEY-----
`;

const REFERENCE_ATTESTED_PUBKEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAzSWxiIufG9qsDIvBjEIDSIhbLNLHB0UGP9+eQmKIFzc=
-----END PUBLIC KEY-----
`;

// Bundled-extension dev signer. Same key as src/enclawed/trust-root.ts;
// scripts/dev/sign-all-bundled-manifests.mjs keeps the two in sync.
const BUNDLED_DEV_PUBKEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAq5da6vSXnWlRwIJTzNqhybV6jxmFLeoZ1cIoKL5HV20=
-----END PUBLIC KEY-----
`;

export const DEFAULT_TRUST_ROOT = Object.freeze([
  Object.freeze({
    keyId: 'enclawed-community-2026',
    publicKeyPem: PLACEHOLDER_ENCLAWED_PUBKEY,
    approvedClearance: Object.freeze(['public', 'internal']),
    description: 'Placeholder community signer.',
  }),
  Object.freeze({
    keyId: 'enclawed-bundled-dev-2026',
    publicKeyPem: BUNDLED_DEV_PUBKEY,
    approvedClearance: Object.freeze(['public', 'internal']),
    description: 'Bundled-extension dev signer. Signs every shipped extensions/<id>/enclawed.module.json.',
  }),
  Object.freeze({
    keyId: 'enclawed-attested-reference-2026',
    publicKeyPem: REFERENCE_ATTESTED_PUBKEY,
    approvedClearance: Object.freeze(['public', 'internal', 'confidential', 'restricted', 'restricted-plus']),
    description: 'Reference highest-tier signer for the bundled mcp-attested module.',
  }),
]);

let runtimeTrustRoot = DEFAULT_TRUST_ROOT;
let trustRootLocked = false;

export class TrustRootLockedError extends Error {
  constructor() {
    super('trust root is locked; setTrustRoot/resetTrustRoot rejected post-lock');
    this.name = 'TrustRootLockedError';
  }
}

export function getTrustRoot() { return runtimeTrustRoot; }

export function setTrustRoot(signers) {
  if (trustRootLocked) throw new TrustRootLockedError();
  if (!Array.isArray(signers)) throw new TypeError('setTrustRoot: signers must be array');
  for (const s of signers) {
    if (!s || typeof s.keyId !== 'string' || !s.publicKeyPem || !s.approvedClearance) {
      throw new TypeError('setTrustRoot: each signer must define keyId, publicKeyPem, approvedClearance');
    }
  }
  runtimeTrustRoot = Object.freeze(signers.map((s) => Object.freeze({ ...s })));
}

export function findSigner(keyId) {
  return runtimeTrustRoot.find((s) => s.keyId === keyId);
}

// Lock the trust root so no further setTrustRoot / resetTrustRoot calls
// succeed. Bootstrap calls this in the enclaved flavor immediately after
// the deploying-organization-supplied signers are loaded.
export function lockTrustRoot() { trustRootLocked = true; }

export function isTrustRootLocked() { return trustRootLocked; }

// Test helper: restore the default trust root. Throws if the trust root is
// locked (production state should never call this).
export function resetTrustRoot() {
  if (trustRootLocked) throw new TrustRootLockedError();
  runtimeTrustRoot = DEFAULT_TRUST_ROOT;
}

// Test-only escape hatch to forcibly unlock the trust root for harness
// teardown. NEVER call this from production code paths.
export function _unsafeUnlockTrustRootForTest() { trustRootLocked = false; }
