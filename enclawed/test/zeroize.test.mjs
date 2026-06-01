import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zeroize, withSecret, secureRandomBytes } from '../src/zeroize.mjs';

test('zeroize Buffer fills with zeros', () => {
  const b = Buffer.from('secret');
  zeroize(b);
  for (const byte of b) assert.equal(byte, 0);
});

test('zeroize Uint8Array fills with zeros', () => {
  const u = new Uint8Array([1, 2, 3, 4]);
  zeroize(u);
  for (const byte of u) assert.equal(byte, 0);
});

test('zeroize rejects unsupported types', () => {
  assert.throws(() => zeroize('a string'), /expected Buffer/);
});

test('zeroize on null/undefined is a no-op', () => {
  assert.doesNotThrow(() => zeroize(null));
  assert.doesNotThrow(() => zeroize(undefined));
});

test('withSecret zeroizes after fn returns', async () => {
  const b = Buffer.from('secret');
  await withSecret(b, async (s) => assert.equal(s.toString(), 'secret'));
  for (const byte of b) assert.equal(byte, 0);
});

test('withSecret zeroizes even when fn throws', async () => {
  const b = Buffer.from('secret');
  await assert.rejects(
    () => withSecret(b, async () => { throw new Error('boom'); }),
    /boom/,
  );
  for (const byte of b) assert.equal(byte, 0);
});

test('secureRandomBytes produces correct length', () => {
  const r = secureRandomBytes(32);
  assert.equal(r.length, 32);
  assert.ok(Buffer.isBuffer(r));
});
