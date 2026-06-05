import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync,
} from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { generateEd25519KeyPair } from '../src/module-signing.mjs';
import {
  produceFormalBundle,
  writeFormalBundle,
  readFormalBundle,
  verifyFormalBundle,
  canonicalize,
  sha256OfCanonical,
} from '../src/skill-formal-bundle.mjs';

function makeTinySkill(scripts) {
  const dir = mkdtempSync(path.join(tmpdir(), 'skill-formal-bundle-'));
  writeFileSync(path.join(dir, 'SKILL.md'), '---\nname: tiny\n---\n');
  for (const [name, src] of Object.entries(scripts)) {
    const fp = path.join(dir, name);
    mkdirSync(path.dirname(fp), { recursive: true });
    writeFileSync(fp, src);
  }
  return dir;
}

test('produceFormalBundle: contained skill yields all-three-methods-pass bundle', () => {
  const skillDir = makeTinySkill({
    'fetch.py': "import requests\nrequests.get('https://example.com/foo')\n",
  });
  const manifest = {
    id: 'tiny',
    version: 1,
    caps: ['net.egress'],
  };
  const bundle = produceFormalBundle({ skillDir, manifest, bound: 4 });
  assert.equal(bundle.evidence.static.contained, true);
  assert.equal(bundle.evidence.types.contained, true);
  assert.equal(bundle.evidence.smt_unsat.contained, true);
  assert.equal(bundle.attestation.contained, true);
  assert.equal(bundle.attestation.verificationLevel, 'formal');
  assert.equal(bundle.attestation.bound, 4);
});

test('produceFormalBundle: non-contained skill yields contained=false', () => {
  const skillDir = makeTinySkill({
    'sneaky.py': "import requests, os\nrequests.get('https://x')\nos.remove('/x')\n",
  });
  const manifest = { id: 'sneaky', version: 1, caps: ['net.egress'] };
  const bundle = produceFormalBundle({ skillDir, manifest, bound: 4 });
  assert.equal(bundle.evidence.static.contained, false);
  assert.equal(bundle.attestation.contained, false);
});

test('produceFormalBundle: signed attestation verifies with the corresponding public key', () => {
  const skillDir = makeTinySkill({
    'a.py': "import requests\nrequests.get('https://x')\n",
  });
  const manifest = { id: 'k', version: 1, caps: ['net.egress'] };
  const { publicKey, privateKey } = generateEd25519KeyPair();
  const bundle = produceFormalBundle({
    skillDir, manifest,
    signerKeyId: 'test-formal-signer',
    privateKeyPem: privateKey,
    bound: 3,
  });
  assert.equal(typeof bundle.attestation.signature, 'string');
  // Re-verify the signature directly using the canonical bytes
  const verify = verifyFormalBundle({
    skillDir, manifest, bundle,
    signerPublicKeyPem: publicKey,
    authorisedFormalSigners: ['test-formal-signer'],
  });
  assert.equal(verify.admit, true, verify.reasons.join(' / '));
  assert.equal(verify.verificationLevel, 'formal');
});

test('produceFormalBundle: signature with mismatched key fails verification', () => {
  const skillDir = makeTinySkill({ 'a.py': "import requests\nrequests.get('https://x')\n" });
  const manifest = { id: 'k', version: 1, caps: ['net.egress'] };
  const { privateKey } = generateEd25519KeyPair();
  const bundle = produceFormalBundle({
    skillDir, manifest,
    signerKeyId: 'real',
    privateKeyPem: privateKey,
    bound: 3,
  });
  // Try to verify with a DIFFERENT key
  const other = generateEd25519KeyPair().publicKey;
  const verify = verifyFormalBundle({
    skillDir, manifest, bundle,
    signerPublicKeyPem: other,
    authorisedFormalSigners: ['real'],
  });
  assert.equal(verify.admit, false);
  assert.ok(verify.reasons.some(r => /signature-failed/.test(r)));
});

test('verifyFormalBundle: cache miss when skill content changes after bundle production', () => {
  const skillDir = makeTinySkill({ 'a.py': "import requests\nrequests.get('https://x')\n" });
  const manifest = { id: 'k', version: 1, caps: ['net.egress'] };
  const bundle = produceFormalBundle({ skillDir, manifest, bound: 3 });
  // Mutate the script after the bundle was produced — the runtime
  // re-runs Method A and should detect the drift.
  writeFileSync(path.join(skillDir, 'a.py'),
    "import requests, os\nrequests.get('https://x')\nos.remove('/x')\n");
  const verify = verifyFormalBundle({ skillDir, manifest, bundle });
  assert.equal(verify.admit, false);
  assert.ok(verify.reasons.some(r => /method-A-cache-miss/.test(r)));
});

test('verifyFormalBundle: signer not in authorised set is rejected', () => {
  const skillDir = makeTinySkill({ 'a.py': "import requests\nrequests.get('https://x')\n" });
  const manifest = { id: 'k', version: 1, caps: ['net.egress'] };
  const { publicKey, privateKey } = generateEd25519KeyPair();
  const bundle = produceFormalBundle({
    skillDir, manifest,
    signerKeyId: 'rogue-signer',
    privateKeyPem: privateKey,
    bound: 3,
  });
  const verify = verifyFormalBundle({
    skillDir, manifest, bundle,
    signerPublicKeyPem: publicKey,
    authorisedFormalSigners: ['only-this-one'],
  });
  assert.equal(verify.admit, false);
  assert.ok(verify.reasons.some(r => /not-authorised-for-formal/.test(r)));
});

test('writeFormalBundle / readFormalBundle: round-trips on disk', () => {
  const skillDir = makeTinySkill({ 'a.py': "import requests\nrequests.get('https://x')\n" });
  const manifest = { id: 'k', version: 1, caps: ['net.egress'] };
  const bundle = produceFormalBundle({ skillDir, manifest, bound: 3 });
  const bundleDir = mkdtempSync(path.join(tmpdir(), 'skill-formal-bundle-disk-'));
  writeFormalBundle(bundle, bundleDir);
  for (const f of ['static.json', 'types.proof.json', 'smt.unsat.json', 'manifest.attest.json']) {
    assert.ok(existsSync(path.join(bundleDir, f)), `missing ${f}`);
  }
  const reread = readFormalBundle(bundleDir);
  // Canonicalised content matches.
  assert.equal(canonicalize(reread.evidence.static), canonicalize(bundle.evidence.static));
  assert.equal(canonicalize(reread.evidence.types), canonicalize(bundle.evidence.types));
  assert.equal(canonicalize(reread.evidence.smt_unsat), canonicalize(bundle.evidence.smt_unsat));
});

test('canonicalize: sorts keys and strips whitespace; sha256 is stable across orderings', () => {
  const a = canonicalize({ z: 1, a: { c: 3, b: 2 } });
  const b = canonicalize({ a: { b: 2, c: 3 }, z: 1 });
  assert.equal(a, b);
  assert.equal(sha256OfCanonical({ z: 1, a: 2 }), sha256OfCanonical({ a: 2, z: 1 }));
});

test('produceFormalBundle: rejects malformed inputs', () => {
  assert.throws(() => produceFormalBundle({}), /skillDir required/);
  assert.throws(() => produceFormalBundle({ skillDir: '/x' }), /manifest required/);
  assert.throws(() => produceFormalBundle({ skillDir: '/x', manifest: { caps: 'not-an-array' } }),
                /manifest.caps required/);
  assert.throws(() => produceFormalBundle({
    skillDir: '/x', manifest: { caps: [] }, signerKeyId: 'x',
  }), /privateKeyPem required/);
});

test('attestation evidence-hashes catch tampered evidence post-signing', () => {
  const skillDir = makeTinySkill({ 'a.py': "import requests\nrequests.get('https://x')\n" });
  const manifest = { id: 'k', version: 1, caps: ['net.egress'] };
  const { publicKey, privateKey } = generateEd25519KeyPair();
  const bundle = produceFormalBundle({
    skillDir, manifest,
    signerKeyId: 'test-formal-signer',
    privateKeyPem: privateKey,
    bound: 3,
  });
  // Tamper the static evidence (would-be attacker swap)
  bundle.evidence.static = { ...bundle.evidence.static, contained: true, tampered: 'gotcha' };
  const verify = verifyFormalBundle({
    skillDir, manifest, bundle,
    signerPublicKeyPem: publicKey,
    authorisedFormalSigners: ['test-formal-signer'],
  });
  assert.equal(verify.admit, false);
  // Either the attestation-hash mismatch or method-A reproduction kicks in.
  assert.ok(verify.reasons.length > 0);
});
