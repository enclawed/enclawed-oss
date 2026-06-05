// AES-256-GCM envelope encryption for at-rest storage. Optionally enforces
// that Node is running with OpenSSL FIPS provider enabled.
//
// LIMITATION: an accreditation-grade deployment must (1) use a FIPS 140-3
// validated cryptographic module, (2) bind keys to an HSM or sealed key
// store rather than a passphrase parameter, (3) rotate keys per policy,
// and (4) cover ALL on-disk artifacts uniformly (sessions, credentials,
// transcripts, telemetry, swap, core dumps). The wrapper here is a
// reference shape; the deployment must replace `deriveKey` and key
// management. See enclawed/MODIFICATIONS.md "Cryptography & key management".

import { createCipheriv, createDecipheriv, randomBytes, scryptSync, getFips } from 'node:crypto';

const ALGO = 'aes-256-gcm';
const KEY_LEN = 32;
const IV_LEN = 12;
const TAG_LEN = 16;
const SCRYPT_PARAMS = Object.freeze({ N: 2 ** 15, r: 8, p: 1 });
// Node's default scrypt maxmem (32 MiB) is right at the boundary for the
// params above; lift it explicitly so encryption is not OOM-rejected.
const SCRYPT_MAXMEM = 64 * 1024 * 1024;

export function isFipsEnabled() {
  try { return getFips() === 1; } catch { return false; }
}

export function assertFipsMode() {
  if (!isFipsEnabled()) {
    throw new Error(
      'FIPS mode is not enabled in this Node binary. Re-launch with ' +
      'OPENSSL_CONF pointing to a FIPS-enabled provider config and a ' +
      'FIPS 140-3 validated OpenSSL module. (CWE-327)',
    );
  }
}

export function deriveKey(passphrase, salt) {
  if (!Buffer.isBuffer(salt) || salt.length < 16) {
    throw new Error('deriveKey: salt must be a Buffer of >= 16 bytes');
  }
  const pwd = Buffer.isBuffer(passphrase) ? passphrase : Buffer.from(passphrase, 'utf8');
  return scryptSync(pwd, salt, KEY_LEN, { ...SCRYPT_PARAMS, maxmem: SCRYPT_MAXMEM });
}

export function encryptAtRest(plaintext, passphrase, { aad } = {}) {
  if (!plaintext) throw new Error('encryptAtRest: plaintext required');
  const pt = Buffer.isBuffer(plaintext) ? plaintext : Buffer.from(plaintext, 'utf8');
  const salt = randomBytes(16);
  const iv = randomBytes(IV_LEN);
  const key = deriveKey(passphrase, salt);
  try {
    const cipher = createCipheriv(ALGO, key, iv);
    if (aad) cipher.setAAD(Buffer.isBuffer(aad) ? aad : Buffer.from(aad, 'utf8'));
    const ct = Buffer.concat([cipher.update(pt), cipher.final()]);
    const tag = cipher.getAuthTag();
    return {
      v: 1,
      algo: ALGO,
      kdf: 'scrypt',
      kdfParams: { ...SCRYPT_PARAMS },
      salt: salt.toString('base64'),
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
      ct: ct.toString('base64'),
      aad: aad
        ? (Buffer.isBuffer(aad) ? aad : Buffer.from(aad, 'utf8')).toString('base64')
        : undefined,
    };
  } finally {
    key.fill(0);
  }
}

export function decryptAtRest(envelope, passphrase) {
  if (!envelope || envelope.algo !== ALGO || envelope.kdf !== 'scrypt') {
    throw new Error('decryptAtRest: unsupported envelope');
  }
  const salt = Buffer.from(envelope.salt, 'base64');
  const iv = Buffer.from(envelope.iv, 'base64');
  const tag = Buffer.from(envelope.tag, 'base64');
  const ct = Buffer.from(envelope.ct, 'base64');
  if (iv.length !== IV_LEN || tag.length !== TAG_LEN) {
    throw new Error('decryptAtRest: malformed envelope');
  }
  const key = deriveKey(passphrase, salt);
  try {
    const decipher = createDecipheriv(ALGO, key, iv);
    if (envelope.aad) {
      const aadBuf = typeof envelope.aad === 'string'
        ? Buffer.from(envelope.aad, 'base64')
        : envelope.aad;
      decipher.setAAD(aadBuf);
    }
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]);
  } finally {
    key.fill(0);
  }
}
