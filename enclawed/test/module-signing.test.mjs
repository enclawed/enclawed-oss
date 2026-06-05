import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateEd25519KeyPair,
  signManifest,
  verifyManifestSignature,
} from '../src/module-signing.mjs';
import { canonicalManifestBytes, parseManifest } from '../src/module-manifest.mjs';

const MANIFEST = parseManifest({
  v: 1,
  id: 'demo',
  publisher: 'enclawed',
  version: '1.0.0',
  clearance: 'cui',
  capabilities: ['tool'],
  signerKeyId: 'k1',
});

test('sign + verify round-trip', () => {
  const { publicKey, privateKey } = generateEd25519KeyPair();
  const bytes = canonicalManifestBytes(MANIFEST);
  const sig = signManifest(bytes, privateKey);
  assert.equal(verifyManifestSignature(bytes, sig, publicKey), true);
});

test('verify fails with wrong key', () => {
  const a = generateEd25519KeyPair();
  const b = generateEd25519KeyPair();
  const bytes = canonicalManifestBytes(MANIFEST);
  const sig = signManifest(bytes, a.privateKey);
  assert.equal(verifyManifestSignature(bytes, sig, b.publicKey), false);
});

test('verify fails with tampered bytes', () => {
  const { publicKey, privateKey } = generateEd25519KeyPair();
  const bytes = canonicalManifestBytes(MANIFEST);
  const sig = signManifest(bytes, privateKey);
  const tamperedManifest = parseManifest({
    v: 1,
    id: 'demo',
    publisher: 'evil',
    version: '1.0.0',
    clearance: 'cui',
    capabilities: ['tool'],
    signerKeyId: 'k1',
  });
  const tamperedBytes = canonicalManifestBytes(tamperedManifest);
  assert.equal(verifyManifestSignature(tamperedBytes, sig, publicKey), false);
});

test('verify rejects malformed signature', () => {
  const { publicKey } = generateEd25519KeyPair();
  const bytes = canonicalManifestBytes(MANIFEST);
  assert.equal(verifyManifestSignature(bytes, 'not-base64-of-correct-length', publicKey), false);
});
