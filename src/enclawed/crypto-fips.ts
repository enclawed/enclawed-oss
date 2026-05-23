// AES-256-GCM envelope encryption. See enclawed/MODIFICATIONS.md §7.3 for
// the FIPS 140-3 / HSM / key-management requirements that an ATO must add.

import { createCipheriv, createDecipheriv, getFips, randomBytes, scryptSync } from "node:crypto";

const ALGO = "aes-256-gcm" as const;
const KEY_LEN = 32;
const IV_LEN = 12;
const TAG_LEN = 16;
const SCRYPT_PARAMS = Object.freeze({ N: 2 ** 15, r: 8, p: 1 });
const SCRYPT_MAXMEM = 64 * 1024 * 1024;

export type Envelope = {
  v: 1;
  algo: typeof ALGO;
  kdf: "scrypt";
  kdfParams: { N: number; r: number; p: number };
  salt: string;
  iv: string;
  tag: string;
  ct: string;
  aad?: string;
};

export function isFipsEnabled(): boolean {
  try {
    return getFips() === 1;
  } catch {
    return false;
  }
}

export function assertFipsMode(): void {
  if (!isFipsEnabled()) {
    throw new Error(
      "FIPS mode is not enabled in this Node binary. Re-launch with " +
        "OPENSSL_CONF pointing to a FIPS-enabled provider config and a " +
        "FIPS 140-3 validated OpenSSL module. (CWE-327)",
    );
  }
}

export function deriveKey(passphrase: string | Buffer, salt: Buffer): Buffer {
  if (!Buffer.isBuffer(salt) || salt.length < 16) {
    throw new Error("deriveKey: salt must be a Buffer of >= 16 bytes");
  }
  const pwd = Buffer.isBuffer(passphrase) ? passphrase : Buffer.from(passphrase, "utf8");
  return scryptSync(pwd, salt, KEY_LEN, { ...SCRYPT_PARAMS, maxmem: SCRYPT_MAXMEM });
}

export function encryptAtRest(
  plaintext: string | Buffer,
  passphrase: string | Buffer,
  opts?: { aad?: string | Buffer },
): Envelope {
  if (!plaintext) throw new Error("encryptAtRest: plaintext required");
  const pt = Buffer.isBuffer(plaintext) ? plaintext : Buffer.from(plaintext, "utf8");
  const salt = randomBytes(16);
  const iv = randomBytes(IV_LEN);
  const key = deriveKey(passphrase, salt);
  try {
    const cipher = createCipheriv(ALGO, key, iv);
    if (opts?.aad) {
      cipher.setAAD(Buffer.isBuffer(opts.aad) ? opts.aad : Buffer.from(opts.aad, "utf8"));
    }
    const ct = Buffer.concat([cipher.update(pt), cipher.final()]);
    const tag = cipher.getAuthTag();
    return {
      v: 1,
      algo: ALGO,
      kdf: "scrypt",
      kdfParams: { ...SCRYPT_PARAMS },
      salt: salt.toString("base64"),
      iv: iv.toString("base64"),
      tag: tag.toString("base64"),
      ct: ct.toString("base64"),
      aad: opts?.aad
        ? Buffer.isBuffer(opts.aad)
          ? opts.aad.toString("base64")
          : Buffer.from(opts.aad, "utf8").toString("base64")
        : undefined,
    };
  } finally {
    key.fill(0);
  }
}

export function decryptAtRest(envelope: Envelope, passphrase: string | Buffer): Buffer {
  if (!envelope || envelope.algo !== ALGO || envelope.kdf !== "scrypt") {
    throw new Error("decryptAtRest: unsupported envelope");
  }
  const salt = Buffer.from(envelope.salt, "base64");
  const iv = Buffer.from(envelope.iv, "base64");
  const tag = Buffer.from(envelope.tag, "base64");
  const ct = Buffer.from(envelope.ct, "base64");
  if (iv.length !== IV_LEN || tag.length !== TAG_LEN) {
    throw new Error("decryptAtRest: malformed envelope");
  }
  const key = deriveKey(passphrase, salt);
  try {
    const decipher = createDecipheriv(ALGO, key, iv);
    if (envelope.aad) {
      decipher.setAAD(Buffer.from(envelope.aad, "base64"));
    }
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]);
  } finally {
    key.fill(0);
  }
}
