// See enclawed/MODIFICATIONS.md §7.6 for the OS-level memory hygiene gaps.

import { randomBytes } from "node:crypto";

export function zeroize(buf: Buffer | Uint8Array | number[] | null | undefined): void {
  if (!buf) return;
  if (Buffer.isBuffer(buf) || buf instanceof Uint8Array) {
    buf.fill(0);
    return;
  }
  if (Array.isArray(buf)) {
    for (let i = 0; i < buf.length; i++) buf[i] = 0;
    return;
  }
  throw new TypeError("zeroize: expected Buffer/Uint8Array/Array");
}

export async function withSecret<T>(
  material: Buffer | Uint8Array,
  fn: (m: Buffer | Uint8Array) => Promise<T> | T,
): Promise<T> {
  try {
    return await fn(material);
  } finally {
    zeroize(material);
  }
}

export function secureRandomBytes(n: number): Buffer {
  return randomBytes(n);
}
