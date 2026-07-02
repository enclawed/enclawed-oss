import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalManifestBytes,
  canonicalManifestHash,
  meetsClearance,
  parseManifest,
} from '../src/module-manifest.mjs';

const VALID = {
  v: 1,
  id: 'demo',
  publisher: 'enclawed',
  version: '1.0.0',
  clearance: 'cui',
  capabilities: ['tool'],
};

test('parseManifest accepts a valid manifest', () => {
  const m = parseManifest(VALID);
  assert.equal(m.id, 'demo');
  assert.equal(m.clearance, 'cui');
});

test('parseManifest rejects unknown clearance', () => {
  assert.throws(() => parseManifest({ ...VALID, clearance: 'mauve' }), /not a recognized name/);
});

test('parseManifest requires id and publisher', () => {
  assert.throws(() => parseManifest({ ...VALID, id: '' }), /id is required/);
  assert.throws(() => parseManifest({ ...VALID, publisher: '' }), /publisher is required/);
});

test('canonicalManifestBytes is stable regardless of capability order', () => {
  const a = parseManifest({ ...VALID, capabilities: ['a', 'b', 'c'] });
  const b = parseManifest({ ...VALID, capabilities: ['c', 'a', 'b'] });
  assert.equal(canonicalManifestHash(a), canonicalManifestHash(b));
  assert.deepEqual(canonicalManifestBytes(a), canonicalManifestBytes(b));
});

test('canonicalManifestBytes excludes the signature so signing is stable', () => {
  const a = parseManifest({ ...VALID, signerKeyId: 'k', signature: 'AAAA' });
  const b = parseManifest({ ...VALID, signerKeyId: 'k', signature: 'BBBB' });
  assert.equal(canonicalManifestHash(a), canonicalManifestHash(b));
});

test('meetsClearance enforces ordering', () => {
  assert.equal(meetsClearance('q-cleared', 'secret'), true);
  assert.equal(meetsClearance('cui', 'secret'), false);
  assert.equal(meetsClearance('q-cleared', 'q-cleared'), true);
});
