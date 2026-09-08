import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { verifyCert, ACC_STATE } from "./enclaweder-hid.js";
import { HardwareRootGuard, HaltError, type GuardDevice } from "./guard.js";

// Mirrors provisioning/cert.py: build a birth cert (119B) signed by a given root over a device key.
const CHALLENGE_TAG = Buffer.from("ECW-CHALLENGE-01");

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

function mockDevice(o: {
  uid: Buffer;
  devicePubRaw: Buffer;
  devicePriv: crypto.KeyObject;
  cert: Buffer | null;
  state?: number;
}): GuardDevice {
  return {
    async getIdentity() {
      return {
        uid: o.uid,
        serial: "ENCLW-" + o.uid.toString("hex").toUpperCase(),
        pubkeyRaw: o.devicePubRaw,
        flags: 0x0f,
      };
    },
    async getStatus() {
      return {
        state: o.state ?? ACC_STATE.READY,
        gate: 0,
        k: 4,
        n: 5,
        nodesOnline: 5,
        ledger: 0,
        locked: 1,
      };
    },
    async challenge(nonce: Buffer) {
      const msg = Buffer.concat([CHALLENGE_TAG, nonce, o.uid]);
      return { uid: o.uid, sig: crypto.sign(null, msg, o.devicePriv) };
    },
    async getCert() {
      return o.cert;
    },
  };
}
const tmpState = (): string =>
  path.join(os.tmpdir(), `hwguard-${crypto.randomBytes(6).toString("hex")}.state`);

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

  it("boot() binds a GENUINE certified device", async () => {
    const g = new HardwareRootGuard({
      statePath: tmpState(),
      rootPubkey: root.raw,
    });
    const bound = await g.boot(
      mockDevice({
        uid,
        devicePubRaw: dev.raw,
        devicePriv: dev.privateKey,
        cert: goodCert,
      }),
    );
    expect(g.status).toBe("CLEAN");
    expect(bound.pubkey).toBe(dev.raw.toString("hex"));
  });

  it("boot() REFUSES a device with NO certificate (zeroized/unprovisioned)", async () => {
    const g = new HardwareRootGuard({
      statePath: tmpState(),
      rootPubkey: root.raw,
    });
    await expect(
      g.boot(
        mockDevice({
          uid,
          devicePubRaw: dev.raw,
          devicePriv: dev.privateKey,
          cert: null,
        }),
      ),
    ).rejects.toThrow(/not GENUINE/);
    expect(g.status).not.toBe("CLEAN");
  });

  it("boot() REFUSES a counterfeit (cert signed by a non-manufacturer root), even with a valid challenge", async () => {
    const attacker = ed25519();
    const forged = buildCert(uid, dev.raw, attacker.privateKey, attacker.raw);
    const g = new HardwareRootGuard({
      statePath: tmpState(),
      rootPubkey: root.raw,
    });
    await expect(
      g.boot(
        mockDevice({
          uid,
          devicePubRaw: dev.raw,
          devicePriv: dev.privateKey,
          cert: forged,
        }),
      ),
    ).rejects.toThrow(HaltError);
  });
});
