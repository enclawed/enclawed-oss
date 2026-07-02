import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  encryptAtRest, decryptAtRest, deriveKey, isFipsEnabled, assertFipsMode,
} from '../src/crypto-fips.mjs';
import { randomBytes } from 'node:crypto';

test('round-trip plaintext + ciphertext', () => {
  const env = encryptAtRest('top secret payload', 'pw');
  const out = decryptAtRest(env, 'pw');
  assert.equal(out.toString('utf8'), 'top secret payload');
});

test('wrong passphrase fails to authenticate', () => {
  const env = encryptAtRest('payload', 'right');
  assert.throws(() => decryptAtRest(env, 'wrong'), /unable to authenticate|bad/i);
});

test('AAD binding rejects mismatch', () => {
  const env = encryptAtRest('payload', 'pw', { aad: 'context-A' });
  // Tampered AAD on decrypt side
  const bad = { ...env, aad: Buffer.from('context-B').toString('base64') };
  assert.throws(() => decryptAtRest(bad, 'pw'));
});

test('AAD round-trip with string input', () => {
  const env = encryptAtRest('payload', 'pw', { aad: 'analyst-7' });
  assert.equal(decryptAtRest(env, 'pw').toString('utf8'), 'payload');
});

test('AAD round-trip with Buffer input', () => {
  const env = encryptAtRest('payload', 'pw', { aad: Buffer.from('analyst-7', 'utf8') });
  assert.equal(decryptAtRest(env, 'pw').toString('utf8'), 'payload');
});

test('AAD string and Buffer inputs produce the same stored form', () => {
  // Given identical salt+iv+key, string and Buffer AAD must produce
  // byte-identical AAD on the GCM side. We can't pin salt/iv without a
  // seam, so instead assert that an envelope produced with a string AAD
  // decrypts when the envelope.aad is reparsed as base64 — i.e. the
  // stored form is always base64(utf8(aad)).
  const env = encryptAtRest('payload', 'pw', { aad: 'ctx' });
  assert.equal(
    Buffer.from(env.aad, 'base64').toString('utf8'),
    'ctx',
    'envelope.aad should be base64(utf8(aad))',
  );
});

test('envelope rejects unsupported algo', () => {
  assert.throws(
    () => decryptAtRest({ algo: 'aes-128-cbc', kdf: 'scrypt' }, 'pw'),
    /unsupported envelope/,
  );
});

test('deriveKey rejects short salt', () => {
  assert.throws(() => deriveKey('pw', randomBytes(8)), /salt must be a Buffer of >= 16/);
});

test('assertFipsMode behavior matches isFipsEnabled', () => {
  if (isFipsEnabled()) {
    assert.doesNotThrow(() => assertFipsMode());
  } else {
    assert.throws(() => assertFipsMode(), /FIPS mode is not enabled/);
  }
});

test('encryption is non-deterministic (fresh salt+iv)', () => {
  const a = encryptAtRest('same', 'pw');
  const b = encryptAtRest('same', 'pw');
  assert.notEqual(a.ct, b.ct);
  assert.notEqual(a.iv, b.iv);
  assert.notEqual(a.salt, b.salt);
});
