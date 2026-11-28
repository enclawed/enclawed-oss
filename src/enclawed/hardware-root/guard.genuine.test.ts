import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyCert } from "./enclaweder-hid.js";

function ed25519(): {
  publicKey: crypto.KeyObject;
  privateKey: crypto.KeyObject;
  raw: Buffer;
} {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const raw = Buffer.from((publicKey.export({ format: "jwk" }) as { x: string }).x, "base64url");
  return { publicKey, privateKey, raw };
}
function rootId(rootPubRaw: Buffer): Buffer {
  return crypto.createHash("sha256").update(rootPubRaw).digest().subarray(0, 4);
}
// Build a birth cert (119B) signed by a given root over a device key.
function buildCert(
  uid: Buffer,
  devicePub: Buffer,
  rootPriv: crypto.KeyObject,
  rootPubRaw: Buffer,
  opts: { model?: number; date?: number } = {},
): Buffer {
  const model = opts.model ?? 1;
  const date = Buffer.alloc(4);
  date.writeUInt32LE(opts.date ?? 20260709);
  const body = Buffer.concat([
    Buffer.from([1]),
    uid,
    devicePub,
    Buffer.from([model & 0xff, (model >> 8) & 0xff]),
    date,
    rootId(rootPubRaw),
  ]);
  return Buffer.concat([body, crypto.sign(null, body, rootPriv)]);
}

describe("hardware-root GENUINE gate", () => {
  const root = ed25519();
  const dev = ed25519();
  const uid = crypto.randomBytes(12);
  const goodCert = buildCert(uid, dev.raw, root.privateKey, root.raw);

  it("verifyCert accepts a root-signed cert for the right device", () => {
    const c = verifyCert(goodCert, uid, dev.raw, root.raw);
    expect(c).not.toBeNull();
    expect(c?.model).toBe(1);
    expect(c?.date).toBe(20260709);
  });

  it("verifyCert rejects a cert signed by a different (counterfeit) root", () => {
    const attacker = ed25519();
    expect(
      verifyCert(
        buildCert(uid, dev.raw, attacker.privateKey, attacker.raw),
        uid,
        dev.raw,
        root.raw,
      ),
    ).toBeNull();
  });

  it("verifyCert rejects a cert that certifies a different device key", () => {
    const other = ed25519();
    expect(
      verifyCert(buildCert(uid, other.raw, root.privateKey, root.raw), uid, dev.raw, root.raw),
    ).toBeNull();
  });

  it("verifyCert rejects a tampered signature and a bad length", () => {
    const tampered = Buffer.from(goodCert);
    tampered[100] ^= 0xff;
    expect(verifyCert(tampered, uid, dev.raw, root.raw)).toBeNull();
    expect(verifyCert(goodCert.subarray(0, 100), uid, dev.raw, root.raw)).toBeNull();
  });
});
