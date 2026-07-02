// Proof-carrying skill bundle producer + bootstrap re-checker.
// Implements §8 of the formal-verification paper.
//
// A formal-verified skill ships, alongside SKILL.md and its scripts,
// four artefacts that together discharge the FORMAL verification
// level:
//
//   evidence/static.json          — Method A output (skill-formal-static)
//   evidence/types.proof.json     — Method B output (skill-formal-types)
//   evidence/smt.unsat.json       — Method C output (skill-formal-bmc)
//   evidence/manifest.attest.json — signed attestation binding the
//                                   manifest hash to FORMAL, listing
//                                   the three evidence-file hashes
//                                   and the toolchain identities
//
// The bundle is a CACHE, not a trust source: the runtime re-runs each
// method at bootstrap and checks the cached result reproduces. A
// cache miss does not silently downgrade — it aborts admission at
// FORMAL and degrades the manifest to DECLARED, logging the reason.
//
// Producer/verifier signatures use Ed25519 from module-signing.mjs
// (the same primitive used for module manifests and OSCAL).

import {
  readFileSync, writeFileSync, mkdirSync, existsSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

import { signManifest, verifyManifestSignature } from './module-signing.mjs';
import { methodA } from './skill-formal-static.mjs';
import { methodB } from './skill-formal-types.mjs';
import { methodC } from './skill-formal-bmc.mjs';

const TOOLCHAIN = Object.freeze({
  methodA: { name: 'enclawed-skill-formal-static', version: '1.0.0' },
  methodB: { name: 'enclawed-skill-formal-types',  version: '1.0.0' },
  methodC: { name: 'enclawed-skill-formal-bmc',    version: '1.0.0' },
});

const ATTESTATION_VERIFICATION_LEVEL = 'formal';

// ----------------------------------------------------------- canonicalize
//
// Sorted-key, no-whitespace JSON canonicalisation. Same shape used by
// the OSCAL emit pipeline (oscal/canonical.mjs); kept separate here so
// the skill-formal surface is self-contained.

function canonicalize(value) {
  if (value === undefined) {
    throw new TypeError('cannot canonicalize undefined');
  }
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError('cannot canonicalize non-finite number');
    }
    return JSON.stringify(value);
  }
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return '[' + value.map((v) => canonicalize(v === undefined ? null : v)).join(',') + ']';
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalize(value[k])).join(',') + '}';
  }
  throw new TypeError('cannot canonicalize value of type ' + typeof value);
}

function sha256OfCanonical(value) {
  return createHash('sha256').update(canonicalize(value), 'utf8').digest('hex');
}

// ----------------------------------------------------------- producer

/**
 * Produce a formal-verification bundle for the given skill, manifest,
 * and BMC bound.
 *
 * @param {Object} args
 * @param {string}   args.skillDir       — directory containing the skill
 *                                          (SKILL.md + scripts).
 * @param {Object}   args.manifest       — the parsed skill manifest
 *                                          ({id, version, caps, ...}).
 * @param {string}   [args.signerKeyId]  — id of the signer producing the
 *                                          attestation; mandatory for a
 *                                          publishable bundle but
 *                                          omittable in tests.
 * @param {string}   [args.privateKeyPem]
 *                                       — PEM private key of the signer;
 *                                          mandatory iff signerKeyId is
 *                                          set.
 * @param {number}   [args.bound=8]      — Method-C BMC bound.
 * @returns {Object}                     — the bundle (a JSON object).
 */
export function produceFormalBundle({
  skillDir, manifest, signerKeyId, privateKeyPem, bound = 8,
}) {
  if (!skillDir) throw new TypeError('produceFormalBundle: skillDir required');
  if (!manifest) throw new TypeError('produceFormalBundle: manifest required');
  if (!Array.isArray(manifest.caps) && !(manifest.caps instanceof Set)) {
    throw new TypeError('produceFormalBundle: manifest.caps required');
  }
  if (signerKeyId && !privateKeyPem) {
    throw new TypeError('produceFormalBundle: privateKeyPem required when signerKeyId is set');
  }
  if (privateKeyPem && !signerKeyId) {
    throw new TypeError('produceFormalBundle: signerKeyId required when privateKeyPem is set');
  }

  const declared = [...new Set(manifest.caps)].sort();

  const a = methodA({ dir: skillDir, declaredCaps: declared });
  const b = methodB({ manifest });
  const c = methodC({ declaredCaps: declared, bound });

  const allContained = a.contained && b.contained && c.contained;

  const evidence = {
    static:    a,
    types:     b,
    smt_unsat: c,
  };

  const manifestHash = sha256OfCanonical(manifest);
  const evidenceHashes = {
    static:    sha256OfCanonical(a),
    types:     sha256OfCanonical(b),
    smt_unsat: sha256OfCanonical(c),
  };

  const attestation = {
    schemaVersion:     1,
    verificationLevel: ATTESTATION_VERIFICATION_LEVEL,
    skillId:           manifest.id ?? null,
    skillVersion:      manifest.version ?? null,
    manifestHash,
    evidenceHashes,
    toolchain:         TOOLCHAIN,
    bound,
    contained:         allContained,
    producedAt:        new Date().toISOString(),
    signerKeyId:       signerKeyId ?? null,
  };

  if (signerKeyId && privateKeyPem) {
    const sig = signManifest(
      Buffer.from(canonicalize(attestation), 'utf8'),
      privateKeyPem,
    );
    attestation.signature = sig;
  }

  return {
    schemaVersion: 1,
    evidence,
    attestation,
  };
}

/**
 * Persist a bundle to disk under bundleDir, one file per evidence
 * artefact plus the attestation. The shape matches paper §8:
 *   <bundleDir>/static.json
 *   <bundleDir>/types.proof.json
 *   <bundleDir>/smt.unsat.json
 *   <bundleDir>/manifest.attest.json
 *
 * @param {Object} bundle  — a value returned by produceFormalBundle
 * @param {string} bundleDir
 */
export function writeFormalBundle(bundle, bundleDir) {
  if (!existsSync(bundleDir)) mkdirSync(bundleDir, { recursive: true });
  writeFileSync(
    path.join(bundleDir, 'static.json'),
    JSON.stringify(bundle.evidence.static, null, 2) + '\n',
  );
  writeFileSync(
    path.join(bundleDir, 'types.proof.json'),
    JSON.stringify(bundle.evidence.types, null, 2) + '\n',
  );
  writeFileSync(
    path.join(bundleDir, 'smt.unsat.json'),
    JSON.stringify(bundle.evidence.smt_unsat, null, 2) + '\n',
  );
  writeFileSync(
    path.join(bundleDir, 'manifest.attest.json'),
    JSON.stringify(bundle.attestation, null, 2) + '\n',
  );
}

/**
 * Load a bundle from disk. Inverse of writeFormalBundle.
 */
export function readFormalBundle(bundleDir) {
  const evidence = {
    static:    JSON.parse(readFileSync(path.join(bundleDir, 'static.json'), 'utf8')),
    types:     JSON.parse(readFileSync(path.join(bundleDir, 'types.proof.json'), 'utf8')),
    smt_unsat: JSON.parse(readFileSync(path.join(bundleDir, 'smt.unsat.json'), 'utf8')),
  };
  const attestation = JSON.parse(readFileSync(path.join(bundleDir, 'manifest.attest.json'), 'utf8'));
  return { schemaVersion: attestation.schemaVersion ?? 1, evidence, attestation };
}

// ----------------------------------------------------------- verifier

/**
 * Bootstrap-time re-check of a formal-verification bundle.
 *
 * Discharges the four checks of paper §8:
 *   1. Verify the bundle's attestation signature against the trust
 *      root (caller supplies the signer's public key).
 *   2. Re-run Method A on the skill directory and confirm the
 *      verdict is reproduced byte-for-byte (modulo per-script effect
 *      ordering, which is canonicalised before comparison).
 *   3. Re-run Method B against the same manifest and confirm the
 *      probe outcomes reproduce.
 *   4. Re-run Method C at the bundle's pinned bound and confirm
 *      UNSAT.
 *
 * Returns
 *   { admit: bool, verificationLevel: 'formal'|'declared',
 *     reasons: string[], evidence: {...}, freshlyComputed: {...} }
 *
 * On any reproduction mismatch the verdict drops to 'declared' (the
 * runtime's safe degraded level) with a human-readable reason. The
 * runtime never trusts the producer's say-so; the bundle is a
 * pre-computed cache and the runtime is the verifier.
 *
 * @param {Object} args
 * @param {string} args.skillDir
 * @param {Object} args.manifest
 * @param {Object} args.bundle
 * @param {string} [args.signerPublicKeyPem]  — required if the bundle
 *                                                carries a signature.
 * @param {Set<string>|Array<string>} [args.authorisedFormalSigners]
 *                                                — optional set of
 *                                                signer keyIds the
 *                                                runtime trusts to
 *                                                attest at level
 *                                                FORMAL. If supplied,
 *                                                an attestation by
 *                                                a non-listed signer
 *                                                is rejected.
 */
export function verifyFormalBundle({
  skillDir, manifest, bundle, signerPublicKeyPem, authorisedFormalSigners,
}) {
  const reasons = [];
  let admit = true;

  // -- 1. signature ---------------------------------------------------
  if (bundle.attestation?.signature) {
    if (!signerPublicKeyPem) {
      admit = false;
      reasons.push('attestation-signed-but-no-public-key-provided');
    } else {
      const attestationCopy = { ...bundle.attestation };
      const sig = attestationCopy.signature;
      delete attestationCopy.signature;
      const ok = verifyManifestSignature(
        Buffer.from(canonicalize(attestationCopy), 'utf8'),
        sig,
        signerPublicKeyPem,
      );
      if (!ok) {
        admit = false;
        reasons.push('attestation-signature-failed');
      }
    }
  } else {
    // An unsigned bundle is admissible for testing but produces a
    // recorded warning on production paths.
    reasons.push('attestation-unsigned-warning-only');
  }

  if (authorisedFormalSigners) {
    const authorised = authorisedFormalSigners instanceof Set
      ? authorisedFormalSigners
      : new Set(authorisedFormalSigners);
    if (!bundle.attestation?.signerKeyId || !authorised.has(bundle.attestation.signerKeyId)) {
      admit = false;
      reasons.push(
        `attestation-signer-not-authorised-for-formal: ${bundle.attestation?.signerKeyId ?? '(none)'}`,
      );
    }
  }

  // -- 2. re-run Method A --------------------------------------------
  const declared = [...new Set(manifest.caps ?? [])].sort();
  const freshA = methodA({ dir: skillDir, declaredCaps: declared });
  const cachedA = bundle.evidence.static;
  const aHashFresh  = sha256OfCanonical(freshA);
  const aHashCached = sha256OfCanonical(cachedA);
  if (aHashFresh !== aHashCached) {
    admit = false;
    reasons.push('method-A-cache-miss-effect-summary-drifted');
  } else if (!freshA.contained) {
    admit = false;
    reasons.push('method-A-not-contained: ' + freshA.reason);
  }

  // -- 3. re-run Method B --------------------------------------------
  const freshB = methodB({ manifest });
  const cachedB = bundle.evidence.types;
  const bHashFresh  = sha256OfCanonical(freshB);
  const bHashCached = sha256OfCanonical(cachedB);
  if (bHashFresh !== bHashCached) {
    admit = false;
    reasons.push('method-B-cache-miss-refinement-probe-drifted');
  } else if (!freshB.contained) {
    admit = false;
    reasons.push('method-B-not-contained: ' + freshB.reason);
  }

  // -- 4. re-run Method C --------------------------------------------
  const bound = bundle.evidence.smt_unsat.bound ?? 8;
  const freshC = methodC({ declaredCaps: declared, bound });
  const cachedC = bundle.evidence.smt_unsat;
  // BMC is deterministic per (declaredCaps, bound); compare on the
  // pinned instanceHash which is exactly that pair.
  if (freshC.instanceHash !== cachedC.instanceHash) {
    admit = false;
    reasons.push('method-C-cache-miss-instance-hash-drifted');
  } else if (freshC.contained !== cachedC.contained) {
    admit = false;
    reasons.push('method-C-cache-miss-verdict-drifted');
  } else if (!freshC.contained) {
    admit = false;
    reasons.push('method-C-not-contained: ' + freshC.reason);
  }

  // -- 5. evidence-hash cross-check vs the attestation --------------
  if (bundle.attestation?.evidenceHashes) {
    const eh = bundle.attestation.evidenceHashes;
    if (eh.static    !== aHashCached) { admit = false; reasons.push('attestation-static-hash-mismatch'); }
    if (eh.types     !== bHashCached) { admit = false; reasons.push('attestation-types-hash-mismatch'); }
    if (eh.smt_unsat !== sha256OfCanonical(cachedC)) {
      admit = false; reasons.push('attestation-smt-hash-mismatch');
    }
  }

  return {
    admit,
    verificationLevel: admit ? 'formal' : 'declared',
    reasons,
    evidence: bundle.evidence,
    freshlyComputed: { static: freshA, types: freshB, smt_unsat: freshC },
  };
}

// Re-export canonicalize & sha256 helpers for consumer convenience.
export { canonicalize, sha256OfCanonical, TOOLCHAIN, ATTESTATION_VERIFICATION_LEVEL };
