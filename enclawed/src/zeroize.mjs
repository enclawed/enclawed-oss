// Zeroize sensitive byte buffers to reduce post-use memory exposure.
//
// LIMITATION: V8 garbage collection, copy-on-write heap allocations, swap,
// hibernation, and core dumps can leave copies of secrets that this helper
// will never reach. JS strings are immutable and cannot be zeroized at all
// — pass secrets as Buffer/Uint8Array, never strings. CWE-226 / CWE-244.
// A real classified deployment must additionally disable swap and core
// dumps, use mlock-equivalent protections, and zero on-disk artifacts.

export function zeroize(buf) {
  if (!buf) return;
  if (Buffer.isBuffer(buf)) { buf.fill(0); return; }
  if (buf instanceof Uint8Array) { buf.fill(0); return; }
  if (Array.isArray(buf)) { for (let i = 0; i < buf.length; i++) buf[i] = 0; return; }
  throw new TypeError('zeroize: expected Buffer/Uint8Array/Array');
}

export async function withSecret(material, fn) {
  try {
    return await fn(material);
  } finally {
    zeroize(material);
  }
}

import { randomBytes } from 'node:crypto';

export function secureRandomBytes(n) {
  return randomBytes(n);
}
