// Tests for the Q-cleared MCP server-clearance verifier. Uses the
// .mjs framework primitives so it runs without a TS build step.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalManifestBytes,
  parseManifest,
} from '../../../enclawed/src/module-manifest.mjs';
import {
  generateEd25519KeyPair,
  signManifest,
} from '../../../enclawed/src/module-signing.mjs';
import { resetTrustRoot, setTrustRoot } from '../../../enclawed/src/trust-root.mjs';
import { checkModule } from '../../../enclawed/src/module-loader.mjs';

// The MCP client side of the verifier uses fetch + a one-off URL. The
// .mjs reference checks the verification *logic* by feeding manifests
// directly through checkModule(). The server-clearance-verifier.ts file
// composes parseManifest + checkModule; we already test those primitives
// elsewhere, plus the full integration is exercised via the
// integration twin at enclawed/ts/integration.test.ts which can
// mock fetch().

function buildSignedAssertion(privateKey, signerKeyId, clearance, capabilities) {
  const base = {
    v: 1,
    id: 'q-mcp-server-1',
    publisher: 'enclawed lab',
    version: '1.0.0',
    clearance,
    capabilities,
    signerKeyId,
  };
  const unsigned = parseManifest(base);
  const sig = signManifest(canonicalManifestBytes(unsigned), privateKey);
  return parseManifest({ ...base, signature: sig });
}

test('q-cleared MCP server: signed assertion at q-cleared is accepted', () => {
  const { publicKey, privateKey } = generateEd25519KeyPair();
  setTrustRoot([{
    keyId: 'lab-q-signer',
    publicKeyPem: publicKey,
    approvedClearance: ['q-cleared'],
    description: 'lab Q-cleared signer',
  }]);
  try {
    const assertion = buildSignedAssertion(privateKey, 'lab-q-signer', 'q-cleared', ['mcp-server']);
    const d = checkModule(assertion, { flavor: 'enclaved', requiredClearance: 'q-cleared' });
    assert.equal(d.allowed, true);
  } finally { resetTrustRoot(); }
});

test('q-cleared MCP server: a Secret-only server is rejected', () => {
  const { publicKey, privateKey } = generateEd25519KeyPair();
  setTrustRoot([{
    keyId: 'lab-secret-signer',
    publicKeyPem: publicKey,
    approvedClearance: ['secret'],
    description: 'secret-only',
  }]);
  try {
    const assertion = buildSignedAssertion(privateKey, 'lab-secret-signer', 'secret', ['mcp-server']);
    const d = checkModule(assertion, { flavor: 'enclaved', requiredClearance: 'q-cleared' });
    assert.equal(d.allowed, false);
    assert.match(d.reason, /below required/);
  } finally { resetTrustRoot(); }
});

test('q-cleared MCP server: assertion with wrong signer key is rejected', () => {
  const a = generateEd25519KeyPair();
  const b = generateEd25519KeyPair();
  setTrustRoot([{
    keyId: 'lab-q-signer',
    publicKeyPem: a.publicKey,  // trust root has A's public key
    approvedClearance: ['q-cleared'],
    description: 'lab Q-cleared signer',
  }]);
  try {
    // assertion was signed with B's private key — must fail verification
    const assertion = buildSignedAssertion(b.privateKey, 'lab-q-signer', 'q-cleared', ['mcp-server']);
    const d = checkModule(assertion, { flavor: 'enclaved', requiredClearance: 'q-cleared' });
    assert.equal(d.allowed, false);
    assert.match(d.reason, /signature verification failed/);
  } finally { resetTrustRoot(); }
});

test('q-cleared MCP server: open flavor warns but does not deny on signature failure', () => {
  const a = generateEd25519KeyPair();
  const b = generateEd25519KeyPair();
  setTrustRoot([{
    keyId: 'lab-q-signer',
    publicKeyPem: a.publicKey,
    approvedClearance: ['q-cleared'],
    description: 'lab Q-cleared signer',
  }]);
  try {
    const assertion = buildSignedAssertion(b.privateKey, 'lab-q-signer', 'q-cleared', ['mcp-server']);
    const d = checkModule(assertion, { flavor: 'open' });
    assert.equal(d.allowed, true);
    assert.match(d.warnings.join('|'), /signature verification failed/);
  } finally { resetTrustRoot(); }
});
