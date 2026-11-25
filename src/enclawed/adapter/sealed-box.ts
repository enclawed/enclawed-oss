// enclawed adapter kit: a sealed box for state kept at rest between sessions, whose OPENING key
// exists only at the start of a launch and whose SEALING key is public.
//
// Why. The device key a launch derives (credential-keys.ts, KEY_DERIVE on command set 0.5) is the
// same for the same label on the same device every time. A symmetric key held in the launcher's
// memory for the whole session (to seal a refreshed login, or the session's context at its end)
// would hand root, reading that memory once, the key to every seal made under that label, then
// and later. A sealed box splits the two: the launch derives an X25519 key pair from the device
// key, opens what it needs at the start, and then forgets the private key (close()); what is left
// in memory, the public key, seals and never opens. Root reading the launcher's memory after the
// start finds no key that opens anything at rest.
//
// Construction: an ephemeral X25519 key per record, HKDF-SHA256 over the shared secret (salt: the
// ephemeral and the box's public key), AES-256-GCM with the caller's associated data. Anyone with
// the public key can seal: what a sealed record is worth as evidence comes from the record of it
// in the device-anchored audit log (context-seal.ts), not from the box.

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createPrivateKey,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  hkdfSync,
  type KeyObject,
  randomBytes,
} from "node:crypto";

/** A sealed record (base64 fields), as stored inside a host-specific envelope. */
export type BoxRecord = Readonly<{
  /** The box's id (it names the device, the purpose and the public key's fingerprint). */
  key: string;
  epk: string;
  iv: string;
  tag: string;
  data: string;
}>;

/** A box: seals with its public key always; opens only until close(). */
export type SealBox = Readonly<{
  id: string;
  /** Raw X25519 public key (32 bytes). */
  publicKey: Buffer;
  /** True until close(): the private key is still held. */
  canOpen(): boolean;
  /** Opens a record of this box (null: another box, altered, or the box was closed). */
  open(rec: BoxRecord, aad: Buffer): Buffer | null;
  /** Forget the private key (idempotent). */
  close(): void;
}>;

const PKCS8_X25519 = Buffer.from("302e020100300506032b656e04220420", "hex");
const SPKI_X25519 = Buffer.from("302a300506032b656e032100", "hex");
const BOX_INFO = "enclawed.adapter.sealed-box.v1";

const rawPublic = (k: KeyObject): Buffer =>
  Buffer.from((k.export({ format: "der", type: "spki" }) as Buffer).subarray(SPKI_X25519.length));
const publicFromRaw = (raw: Buffer): KeyObject =>
  createPublicKey({ key: Buffer.concat([SPKI_X25519, raw]), format: "der", type: "spki" });

/** The fingerprint a box id carries: SHA-256 of the purpose and the public key, 16 hex digits. */
export function boxFingerprint(publicKey: Buffer): string {
  return createHash("sha256").update(BOX_INFO).update(publicKey).digest("hex").slice(0, 16);
}

function boxKey(shared: Buffer, epk: Buffer, pub: Buffer): Buffer {
  return Buffer.from(hkdfSync("sha256", shared, Buffer.concat([epk, pub]), BOX_INFO, 32));
}

/**
 * The box of a 32-byte seed (derived by the caller from a device key; the seed is not kept: the
 * caller wipes it). `idPrefix` names the device and purpose; the id ends in the key's fingerprint.
 */
export function sealBoxFromSeed(seed32: Buffer, idPrefix: string): SealBox {
  if (seed32.length !== 32) {
    throw new Error("a sealed-box seed is 32 bytes");
  }
  const der = Buffer.concat([PKCS8_X25519, seed32]);
  let priv: KeyObject | null = createPrivateKey({ key: der, format: "der", type: "pkcs8" });
  der.fill(0);
  const publicKey = rawPublic(createPublicKey(priv));
  const id = `${idPrefix}:${boxFingerprint(publicKey)}`;
  return {
    id,
    publicKey,
    canOpen: () => priv !== null,
    open(rec, aad) {
      if (!priv || rec.key !== id) {
        return null;
      }
      try {
        const epk = Buffer.from(rec.epk, "base64");
        if (epk.length !== 32) {
          return null;
        }
        const shared = diffieHellman({ privateKey: priv, publicKey: publicFromRaw(epk) });
        const key = boxKey(shared, epk, publicKey);
        shared.fill(0);
        const d = createDecipheriv("aes-256-gcm", key, Buffer.from(rec.iv, "base64"));
        d.setAAD(aad);
        d.setAuthTag(Buffer.from(rec.tag, "base64"));
        const out = Buffer.concat([d.update(Buffer.from(rec.data, "base64")), d.final()]);
        key.fill(0);
        return out;
      } catch {
        return null;
      }
    },
    close() {
      // The KeyObject's memory is released by OpenSSL, which clears private key material on free.
      priv = null;
    },
  };
}

/** A box that only seals (its public key known, never its private key): what a closed box is. */
export function sealOnlyBox(id: string, publicKey: Buffer): SealBox {
  if (publicKey.length !== 32 || !id.endsWith(`:${boxFingerprint(publicKey)}`)) {
    throw new Error("the box id does not name this public key");
  }
  return { id, publicKey, canOpen: () => false, open: () => null, close: () => {} };
}

/** Seal `plain` to the box (public key only), with `aad` bound. */
export function sealToBox(
  box: Pick<SealBox, "id" | "publicKey">,
  plain: Buffer,
  aad: Buffer,
): BoxRecord {
  const eph = generateKeyPairSync("x25519");
  const epk = rawPublic(eph.publicKey);
  const shared = diffieHellman({
    privateKey: eph.privateKey,
    publicKey: publicFromRaw(box.publicKey),
  });
  const key = boxKey(shared, epk, box.publicKey);
  shared.fill(0);
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  c.setAAD(aad);
  const data = Buffer.concat([c.update(plain), c.final()]);
  key.fill(0);
  return {
    key: box.id,
    epk: epk.toString("base64"),
    iv: iv.toString("base64"),
    tag: c.getAuthTag().toString("base64"),
    data: data.toString("base64"),
  };
}

/** Whether `x` has the shape of a box record. */
export function isBoxRecord(x: unknown): x is BoxRecord {
  const r = x as Record<string, unknown> | null;
  return (
    !!r &&
    typeof r === "object" &&
    ["key", "epk", "iv", "tag", "data"].every((k) => typeof r[k] === "string")
  );
}
