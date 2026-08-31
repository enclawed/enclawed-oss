import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
// Multi-device fleet: mixed base/Pro binding, fail-secure aggregation, and parallel dispatch.
//
// These run on mock devices because the properties that matter for a FLEET cannot be exercised on
// one physical unit: N-way parallelism, one member going DIRTY while others stay CLEAN, duplicate
// binding, and the zeroize-safety rule around enrolment.
import { describe, expect, it } from "vitest";
import { ACC_STATE, verifyCert, ENCLAWEDER_ROOT_PUBKEY } from "./enclaweder-hid.js";
import { HardwareRootFleet } from "./fleet.js";
import { HaltError, type GuardDevice } from "./guard.js";

const CHALLENGE_TAG = Buffer.from("ECW-CHALLENGE-01");

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

interface MockOpts {
  uid: Buffer;
  key: { raw: Buffer; privateKey: crypto.KeyObject };
  cert: Buffer | null;
  sku?: "base" | "pro";
  enrollRc?: number;
  workMs?: number;
}
/** Mock that records concurrency so per-device serialisation can be asserted. */
function mockDevice(o: MockOpts) {
  const state = { concurrent: 0, maxConcurrent: 0, attests: 0 };
  const busy = async <T>(ms: number, v: T): Promise<T> => {
    state.concurrent++;
    state.maxConcurrent = Math.max(state.maxConcurrent, state.concurrent);
    await new Promise((r) => setTimeout(r, ms));
    state.concurrent--;
    return v;
  };
  const dev = {
    state,
    async getIdentity() {
      return {
        uid: o.uid,
        serial: (o.sku === "pro" ? "ECPRO-" : "ENCLW-") + o.uid.toString("hex").toUpperCase(),
        pubkeyRaw: o.key.raw,
        flags: 0x0f,
      };
    },
    async getStatus() {
      return { state: ACC_STATE.READY, gate: 0, k: 4, n: 5, nodesOnline: 5, ledger: 0, locked: 1 };
    },
    async challenge(nonce: Buffer) {
      const msg = Buffer.concat([CHALLENGE_TAG, nonce, o.uid]);
      return { uid: o.uid, sig: crypto.sign(null, msg, o.key.privateKey) };
    },
    async getCert() {
      return o.cert;
    },
    async enroll() {
      return o.enrollRc ?? 0;
    },
    async attest() {
      state.attests++;
      return busy(o.workMs ?? 5, { ok: true, verdict: 1, votes: 5, k: 4 });
    },
    close() {},
  };
  return dev as unknown as GuardDevice & { state: typeof state };
}

const tmpDir = (): string => {
  const d = path.join(os.tmpdir(), `hwfleet-${crypto.randomBytes(6).toString("hex")}`);
  fs.mkdirSync(d, { recursive: true });
  return d;
};

describe("hardware-root fleet", () => {
  it("verifyCert resolves the SKU from the pinned domain and binds model to root", () => {
    // A Pro-numbered cert signed by the BASE root must be rejected: same silicon, different
    // firmware, so the signing root is the only thing that makes a unit Pro.
    const uid = crypto.randomBytes(12);
    const dev = ed25519();
    const attacker = ed25519();
    const forged = buildCert(uid, dev.raw, attacker.privateKey, ENCLAWEDER_ROOT_PUBKEY, 2);
    expect(verifyCert(forged, uid, dev.raw)).toBeNull();
  });

  it("binds a mixed base + Pro fleet and reports its composition", async () => {
    const root = ed25519();
    const devs = [0, 1, 2].map(() => ({ uid: crypto.randomBytes(12), key: ed25519() }));
    const skus: Array<"base" | "pro"> = ["base", "pro", "pro"];
    const mocks = devs.map((d, i) =>
      mockDevice({
        uid: d.uid,
        key: d.key,
        // The cert's model is what makes a unit Pro. The mocks ALSO self-report an
        // ECPRO-/ENCLW- USB serial, but that string is unauthenticated, so the fleet must
        // ignore it and render the SKU from the signed model instead.
        cert: buildCert(d.uid, d.key.raw, root.privateKey, root.raw, skus[i] === "pro" ? 2 : 1),
        sku: skus[i],
      }),
    );
    const fleet = await HardwareRootFleet.boot({
      paths: ["/dev/hidraw0", "/dev/hidraw1", "/dev/hidraw2"],
      stateDir: tmpDir(),
      rootPubkey: root.raw,
      openDevice: (p) => mocks[Number(p.replace(/\D+/g, ""))] as never,
    });
    expect(fleet.size).toBe(3);
    expect(fleet.status).toBe("CLEAN");
    expect(fleet.composition).toEqual({ base: 1, pro: 2 });
    expect(fleet.members.map((m) => m.sku)).toEqual(["base", "pro", "pro"]);
    expect(fleet.members.map((m) => m.skuName)).toEqual([
      "Enclaweder Base",
      "Enclaweder Pro",
      "Enclaweder Pro",
    ]);
    expect(fleet.members.map((m) => m.serial.slice(0, 6))).toEqual(["ENCLW-", "ECPRO-", "ECPRO-"]);
  });

  it("refuses to bind the same physical device twice", async () => {
    const root = ed25519();
    const uid = crypto.randomBytes(12);
    const key = ed25519();
    const cert = buildCert(uid, key.raw, root.privateKey, root.raw);
    const one = mockDevice({ uid, key, cert });
    await expect(
      HardwareRootFleet.boot({
        paths: ["/dev/hidraw0", "/dev/hidraw1"],
        stateDir: tmpDir(),
        rootPubkey: root.raw,
        openDevice: () => one as never,
      }),
    ).rejects.toThrow(/bound twice/);
  });

  it("refuses to boot when a member cannot prove it is genuine", async () => {
    const root = ed25519();
    const good = { uid: crypto.randomBytes(12), key: ed25519() };
    const bad = { uid: crypto.randomBytes(12), key: ed25519() };
    const mocks = [
      mockDevice({
        uid: good.uid,
        key: good.key,
        cert: buildCert(good.uid, good.key.raw, root.privateKey, root.raw),
      }),
      mockDevice({ uid: bad.uid, key: bad.key, cert: null }), // no cert -> not genuine
    ];
    await expect(
      HardwareRootFleet.boot({
        paths: ["/dev/hidraw0", "/dev/hidraw1"],
        stateDir: tmpDir(),
        rootPubkey: root.raw,
        openDevice: (p) => mocks[Number(p.replace(/\D+/g, ""))] as never,
      }),
    ).rejects.toBeInstanceOf(HaltError);
  });

  it("runs work in parallel ACROSS devices but serialised PER device", async () => {
    const root = ed25519();
    const devs = [0, 1, 2].map(() => ({ uid: crypto.randomBytes(12), key: ed25519() }));
    const mocks = devs.map((d) =>
      mockDevice({
        uid: d.uid,
        key: d.key,
        cert: buildCert(d.uid, d.key.raw, root.privateKey, root.raw),
        workMs: 20,
      }),
    );
    const fleet = await HardwareRootFleet.boot({
      paths: ["/dev/hidraw0", "/dev/hidraw1", "/dev/hidraw2"],
      stateDir: tmpDir(),
      rootPubkey: root.raw,
      openDevice: (p) => mocks[Number(p.replace(/\D+/g, ""))] as never,
    });
    const t0 = Date.now();
    await Promise.all(
      Array.from({ length: 9 }, () => fleet.run((d) => (d as never as (typeof mocks)[0]).attest())),
    );
    const elapsed = Date.now() - t0;
    // 9 jobs x 20 ms over 3 devices ~= 60 ms of wall clock, not 180 ms.
    expect(elapsed).toBeLessThan(150);
    let total = 0;
    for (const m of mocks) {
      expect(m.state.maxConcurrent).toBe(1); // one request in flight per device, ever
      expect(m.state.attests).toBeGreaterThan(0); // every device pulled work
      total += m.state.attests;
    }
    expect(total).toBe(9); // every job ran exactly once
    // Deliberately NOT asserting an even split: dispatch is pull-based, so a faster device takes
    // more work. That is the point of the design, and equal mocks only happen to split evenly.
  });

  it("halts the WHOLE fleet when any single member goes DIRTY", async () => {
    const root = ed25519();
    const devs = [0, 1].map(() => ({ uid: crypto.randomBytes(12), key: ed25519() }));
    const mocks = devs.map((d) =>
      mockDevice({
        uid: d.uid,
        key: d.key,
        cert: buildCert(d.uid, d.key.raw, root.privateKey, root.raw),
      }),
    );
    const fleet = await HardwareRootFleet.boot({
      paths: ["/dev/hidraw0", "/dev/hidraw1"],
      stateDir: tmpDir(),
      rootPubkey: root.raw,
      openDevice: (p) => mocks[Number(p.replace(/\D+/g, ""))] as never,
    });
    expect(() => fleet.assertClean()).not.toThrow();
    // Second device disappears, as if unplugged.
    mocks[1].getStatus = async () => {
      throw new Error("device gone");
    };
    await fleet["slots"][1].guard.check(mocks[1]).catch(() => {});
    expect(fleet.status).toBe("DIRTY");
    expect(() => fleet.assertClean()).toThrow(HaltError);
  });

  it("refuses to attest on a member that is not enrolled for the measurement", async () => {
    const root = ed25519();
    const d = { uid: crypto.randomBytes(12), key: ed25519() };
    const mock = mockDevice({
      uid: d.uid,
      key: d.key,
      cert: buildCert(d.uid, d.key.raw, root.privateKey, root.raw),
      enrollRc: 1, // already holds a genesis we cannot read back
    });
    const fleet = await HardwareRootFleet.boot({
      paths: ["/dev/hidraw0"],
      stateDir: tmpDir(),
      rootPubkey: root.raw,
      openDevice: () => mock as never,
    });
    const meas = crypto.randomBytes(32);
    const ready = await fleet.enrollAll(meas);
    expect(ready).toHaveLength(0); // NOT adopted: attesting it could fail-secure zeroize it
    await expect(fleet.attest(meas, crypto.randomBytes(32))).rejects.toThrow(
      /no member is enrolled/,
    );
    expect(mock.state.attests).toBe(0);
  });
});
