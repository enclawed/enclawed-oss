import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkModule } from '../src/module-loader.mjs';
import { canonicalManifestBytes, parseManifest } from '../src/module-manifest.mjs';
import { generateEd25519KeyPair, signManifest } from '../src/module-signing.mjs';
import { resetTrustRoot, setTrustRoot } from '../src/trust-root.mjs';

function freshSignedManifest(overrides = {}) {
  const { publicKey, privateKey } = generateEd25519KeyPair();
  const base = {
    v: 1,
    id: 'demo',
    publisher: 'enclawed-test',
    version: '1.0.0',
    clearance: 'q-cleared',
    capabilities: ['tool'],
    signerKeyId: 'test-signer',
    ...overrides,
  };
  const unsigned = parseManifest(base);
  const sig = signManifest(canonicalManifestBytes(unsigned), privateKey);
  const signed = parseManifest({ ...base, signature: sig });
  return { manifest: signed, publicKey };
}

test('open flavor allows unsigned modules with a warning', () => {
  const m = parseManifest({
    v: 1,
    id: 'demo',
    publisher: 'p',
    version: '1.0.0',
    clearance: 'unclassified',
    capabilities: ['tool'],
  });
  const d = checkModule(m, { flavor: 'open' });
  assert.equal(d.allowed, true);
  assert.match(d.warnings.join('|'), /unsigned/);
});

test('enclaved flavor rejects unsigned modules', () => {
  const m = parseManifest({
    v: 1,
    id: 'demo',
    publisher: 'p',
    version: '1.0.0',
    clearance: 'q-cleared',
    capabilities: ['tool'],
  });
  const d = checkModule(m, { flavor: 'enclaved' });
  assert.equal(d.allowed, false);
  assert.match(d.reason, /no signature/);
});

test('enclaved flavor rejects unknown signer', () => {
  resetTrustRoot();
  const { manifest } = freshSignedManifest({ signerKeyId: 'unknown-signer' });
  const d = checkModule(manifest, { flavor: 'enclaved' });
  assert.equal(d.allowed, false);
  assert.match(d.reason, /not in trust root/);
});

test('enclaved flavor rejects signer not approved for the declared clearance', () => {
  const { manifest, publicKey } = freshSignedManifest({ clearance: 'q-cleared', signerKeyId: 'low-signer' });
  setTrustRoot([{
    keyId: 'low-signer',
    publicKeyPem: publicKey,
    approvedClearance: ['unclassified', 'cui'],
    description: 'low-only',
  }]);
  try {
    const d = checkModule(manifest, { flavor: 'enclaved' });
    assert.equal(d.allowed, false);
    assert.match(d.reason, /not approved for clearance/);
  } finally {
    resetTrustRoot();
  }
});

test('enclaved flavor accepts a properly signed Q-cleared module', () => {
  const { manifest, publicKey } = freshSignedManifest({ clearance: 'q-cleared', signerKeyId: 'q-signer' });
  setTrustRoot([{
    keyId: 'q-signer',
    publicKeyPem: publicKey,
    approvedClearance: ['unclassified', 'cui', 'secret', 'top-secret', 'q-cleared'],
    description: 'q ok',
  }]);
  try {
    const d = checkModule(manifest, { flavor: 'enclaved' });
    assert.equal(d.allowed, true);
    assert.equal(d.signerKeyId, 'q-signer');
    assert.equal(d.clearance, 'q-cleared');
  } finally {
    resetTrustRoot();
  }
});

test('enclaved flavor rejects a tampered manifest body', () => {
  const { manifest, publicKey } = freshSignedManifest({ clearance: 'q-cleared', signerKeyId: 'q-signer2' });
  setTrustRoot([{
    keyId: 'q-signer2',
    publicKeyPem: publicKey,
    approvedClearance: ['q-cleared'],
    description: 'q ok',
  }]);
  try {
    const tampered = parseManifest({
      v: 1, id: 'demo', publisher: 'enclawed-test', version: '2.0.0',  // version changed
      clearance: 'q-cleared', capabilities: ['tool'],
      signerKeyId: 'q-signer2', signature: manifest.signature,
    });
    const d = checkModule(tampered, { flavor: 'enclaved' });
    assert.equal(d.allowed, false);
    assert.match(d.reason, /signature verification failed/);
  } finally {
    resetTrustRoot();
  }
});

test('requiredClearance gates module load even when signed', () => {
  const { manifest, publicKey } = freshSignedManifest({ clearance: 'cui', signerKeyId: 'cui-signer' });
  setTrustRoot([{
    keyId: 'cui-signer',
    publicKeyPem: publicKey,
    approvedClearance: ['cui'],
    description: 'cui',
  }]);
  try {
    const d = checkModule(manifest, { flavor: 'enclaved', requiredClearance: 'q-cleared' });
    assert.equal(d.allowed, false);
    assert.match(d.reason, /below required/);
  } finally {
    resetTrustRoot();
  }
});

test('expired signer is rejected', () => {
  const { manifest, publicKey } = freshSignedManifest({ signerKeyId: 'old-signer' });
  setTrustRoot([{
    keyId: 'old-signer',
    publicKeyPem: publicKey,
    approvedClearance: ['q-cleared'],
    description: 'old',
    notAfter: new Date(Date.now() - 86400_000).toISOString(),
  }]);
  try {
    const d = checkModule(manifest, { flavor: 'enclaved' });
    assert.equal(d.allowed, false);
    assert.match(d.reason, /expired/);
  } finally {
    resetTrustRoot();
  }
});
