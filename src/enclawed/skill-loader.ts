// Bootstrap-time skill verification (paper §3.4).
//
// loadSkill walks seven steps in order, fail-closed, before any external
// input is read. A skill that survives all seven steps is loaded and its
// content is reachable by the agent at the registered verification level.
// A failure at any step produces a typed audit record and aborts the load.
//
// After bootstrap completes, the loaded set is frozen for the session;
// loading a new skill at run time requires a re-bootstrap and is governed
// by the no-runtime-mutation rule (paper §3.2).

import {
  type Label,
  dominates,
} from "./classification.js";
import { verifyManifestSignature } from "./module-signing.js";
import {
  type SkillManifest,
  type VerificationLevel,
  VERIFICATION,
  canonicalSkillBytes,
  contentSha256,
  parseSkillManifest,
  verificationRank,
} from "./skill-manifest.js";
import { findSigner, type TrustedSigner } from "./trust-root.js";
import { clearanceToRank } from "./module-manifest.js";

export class SkillLoadError extends Error {
  override name = "SkillLoadError";
  constructor(public readonly step: string, message: string) {
    super(`skill-load: step "${step}": ${message}`);
  }
}

export type LoadedSkill = Readonly<{
  manifest: SkillManifest;
  contentSha256: string;
  signerKeyId: string;
}>;

export type LoadInput = Readonly<{
  manifestJson: unknown;
  content: Buffer | string;
  signature: string;
  userClearance: Label;
  // Optional per-signer cap on the verification level the signer is
  // authorized to attest. Defaults to "declared" for any trust-root signer
  // (anything beyond requires explicit attestation authority).
  signerVerificationAuthority?: (signer: TrustedSigner) => VerificationLevel;
  // Optional trust-root resolver, primarily for tests. Defaults to the
  // process-wide trust root from trust-root.ts.
  resolveSigner?: (keyId: string) => TrustedSigner | undefined;
}>;

const DEFAULT_SIGNER_VERIFICATION_AUTHORITY: VerificationLevel = VERIFICATION.DECLARED;

function defaultAuthority(_s: TrustedSigner): VerificationLevel {
  return DEFAULT_SIGNER_VERIFICATION_AUTHORITY;
}

// The seven-step verification sequence (paper §3.4).
export function verifySkill(input: LoadInput): LoadedSkill {
  // Step 1: canonical-JSON parse, reject unknown fields and proto keys.
  let manifest: SkillManifest;
  try {
    manifest = parseSkillManifest(input.manifestJson);
  } catch (err) {
    throw new SkillLoadError("parse", (err as Error).message);
  }

  // Step 2: resolve signer in the trust root.
  const resolve = input.resolveSigner ?? findSigner;
  const signer = resolve(manifest.signer);
  if (!signer) {
    throw new SkillLoadError("resolve-signer", `signer "${manifest.signer}" not in trust root`);
  }
  if (signer.notAfter && Date.parse(signer.notAfter) < Date.now()) {
    throw new SkillLoadError(
      "resolve-signer",
      `signer "${signer.keyId}" expired (${signer.notAfter})`,
    );
  }

  // Step 3: verify σ over canonical bytes of (M, content).
  const contentHash = contentSha256(input.content);
  const canon = canonicalSkillBytes(manifest, contentHash);
  if (!verifyManifestSignature(canon, input.signature, signer.publicKeyPem)) {
    throw new SkillLoadError("verify-signature", "signature did not verify");
  }

  // Step 4: M.label ≼ signer.maxClearance — signer cannot endorse above
  // their authorized clearance.
  if (!signerCoversLabel(signer, manifest.label)) {
    throw new SkillLoadError(
      "signer-clearance-bound",
      `signer "${signer.keyId}" not approved for label level ${manifest.label.level}`,
    );
  }

  // Step 5: M.label ≼ user.clearance — operator cannot load a skill that
  // exceeds their own clearance.
  if (!dominates(input.userClearance, manifest.label)) {
    throw new SkillLoadError(
      "user-clearance-bound",
      `user clearance does not dominate skill label`,
    );
  }

  // Step 6: M.verification ≤ signer's authorized verification level.
  const authority = (input.signerVerificationAuthority ?? defaultAuthority)(signer);
  if (verificationRank(manifest.verification) > verificationRank(authority)) {
    throw new SkillLoadError(
      "verification-authority",
      `signer "${signer.keyId}" not authorized for verification level "${manifest.verification}"`,
    );
  }

  // Step 7: caller of this fn (skill-runtime) registers caps with the gate.
  return Object.freeze({
    manifest,
    contentSha256: contentHash,
    signerKeyId: signer.keyId,
  });
}

function signerCoversLabel(signer: TrustedSigner, label: Label): boolean {
  // signer.approvedClearance is a list of ClearanceLevel name strings;
  // resolve each to a numeric rank and take the max.
  let maxRank = -1;
  for (const name of signer.approvedClearance) {
    const r = clearanceToRank(name);
    if (r === undefined) continue;
    if (r > maxRank) maxRank = r;
  }
  return maxRank >= label.level;
}
