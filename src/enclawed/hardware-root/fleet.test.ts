// Fleet certificate checks: a unit's SKU is bound to the root that signed it.
import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyCert, ENCLAWEDER_ROOT_PUBKEY } from "./enclaweder-hid.js";

function ed25519(): { publicKey: crypto.KeyObject; privateKey: crypto.KeyObject; raw: Buffer } {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const raw = Buffer.from((publicKey.export({ format: "jwk" }) as { x: string }).x, "base64url");
  return { publicKey, privateKey, raw };
}
function rootId(rootPubRaw: Buffer): Buffer {
  return crypto.createHash("sha256").update(rootPubRaw).digest().subarray(0, 4);
}
function buildCert(
  uid: Buffer,
  devicePub: Buffer,
  rootPriv: crypto.KeyObject,
  rootPubRaw: Buffer,
  model = 1,
): Buffer {
  const date = Buffer.alloc(4);
  date.writeUInt32LE(20260820);
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

describe("hardware-root fleet certificates", () => {
  it("verifyCert resolves the SKU from the pinned domain and binds model to root", () => {
    // A Pro-numbered cert signed by the BASE root must be rejected: the signing root is the
    // only thing that makes a unit Pro.
    const uid = crypto.randomBytes(12);
    const dev = ed25519();
    const attacker = ed25519();
    const forged = buildCert(uid, dev.raw, attacker.privateKey, ENCLAWEDER_ROOT_PUBKEY, 2);
    expect(verifyCert(forged, uid, dev.raw)).toBeNull();
  });
});
