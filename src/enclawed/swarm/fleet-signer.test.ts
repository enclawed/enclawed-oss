// A principal with several Enclaweders: every device signs for it, any one of
// them verifies, and nothing outside the registered list does.

import { generateKeyPairSync, sign as edSign } from "node:crypto";
import { describe, expect, it } from "vitest";
import { heartbeatDigest, signHeartbeat, verifyHeartbeat } from "./heartbeat.js";
import {
  fleetSigner,
  isPrincipalKey,
  MAX_DEVICE_MEMBERS,
  softwareSigner,
  verifyDigest,
  type SigningFleet,
} from "./signer.js";

/**
 * A stand-in for an Enclaweder, for the multi-device paths only: a machine
 * here has at most one real device. It signs as verifyChallenge expects:
 * tag || nonce || uid.
 */
function fakeEnclaweder(uidHex: string) {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const pubkeyRaw = Buffer.from(String(publicKey.export({ format: "jwk" }).x), "base64url");
  const uid = Buffer.from(uidHex, "hex");
  return {
    async getIdentity() {
      return { uid, pubkeyRaw };
    },
    async challenge(nonce32: Buffer) {
      const msg = Buffer.concat([Buffer.from("ECW-CHALLENGE-01"), nonce32, uid]);
      return { uid, sig: edSign(null, msg, privateKey) };
    },
  };
}

const uidHex = (i: number) => (i + 1).toString(16).padStart(2, "0").repeat(12);

async function device(i: number) {
  const dev = fakeEnclaweder(uidHex(i));
  const ident = await dev.getIdentity();
  return { dev, uid: ident.uid.toString("hex"), pubkey: ident.pubkeyRaw.toString("hex") };
}

/** A fleet that dispatches round-robin and counts the work each device did. */
async function fleet(n: number) {
  const devs = await Promise.all(Array.from({ length: n }, (_, i) => device(i)));
  const used = devs.map(() => 0);
  let next = 0;
  const f: SigningFleet = {
    members: devs.map((d) => ({ uid: d.uid, pubkey: d.pubkey })),
    run: async (fn) => {
      const i = next++ % devs.length;
      used[i]++;
      return fn(devs[i].dev);
    },
  };
  return { f, devs, used };
}

const digest = (i: number) => Buffer.alloc(32, i);

describe("fleet signer", () => {
  it("signs through every device, and each signature verifies for the principal", async () => {
    const { f, used } = await fleet(3);
    const s = fleetSigner("node-a", f);
    expect(s.key.members).toHaveLength(2);
    expect(isPrincipalKey(s.key)).toBe(true);
    for (let i = 0; i < 9; i++) {
      const sig = await s.sign(digest(i));
      expect(verifyDigest(s.key, digest(i), sig)).toBe(true);
      expect(verifyDigest(s.key, digest(i + 100), sig)).toBe(false);
    }
    expect(used).toEqual([3, 3, 3]);
  });

  it("writes the primary's signature plain and a member's tagged with its uid", async () => {
    const { f, devs } = await fleet(2);
    const s = fleetSigner("node-b", f);
    const a = await s.sign(digest(1));
    const b = await s.sign(digest(2));
    expect(a).toMatch(/^[0-9a-f]{128}$/);
    expect(b).toBe(`${devs[1].uid}:${b.split(":")[1]}`);
  });

  it("one device is a plain device key, as before", async () => {
    const { f } = await fleet(1);
    const s = fleetSigner("solo", f);
    expect(s.key.members).toBeUndefined();
    const sig = await s.sign(digest(3));
    expect(sig).toMatch(/^[0-9a-f]{128}$/);
    expect(verifyDigest(s.key, digest(3), sig)).toBe(true);
    // The primary may also be named explicitly.
    expect(verifyDigest(s.key, digest(3), `${s.key.uid}:${sig}`)).toBe(true);
  });

  it("refuses a device that answers from outside the fleet", async () => {
    const { f } = await fleet(2);
    const stranger = await device(9);
    const s = fleetSigner("node-c", { ...f, run: (fn) => fn(stranger.dev) });
    await expect(s.sign(digest(4))).rejects.toThrow(/outside the fleet/);
  });

  it("refuses an empty fleet and one with too many devices", async () => {
    expect(() => fleetSigner("x", { members: [], run: async () => undefined as never })).toThrow(
      /no members/,
    );
    const many = Array.from({ length: MAX_DEVICE_MEMBERS + 2 }, (_, i) => ({
      uid: uidHex(i),
      pubkey: "aa".repeat(32),
    }));
    expect(() => fleetSigner("x", { members: many, run: async () => undefined as never })).toThrow(
      /more than/,
    );
  });

  it("verifies heartbeats signed by any device of a node", async () => {
    const { f } = await fleet(3);
    const s = fleetSigner("node-d", f);
    for (let seq = 1; seq <= 6; seq++) {
      const hb = await signHeartbeat(s, {
        swarmId: "sw",
        nodeId: "node-d",
        epoch: 0,
        seq,
        time: seq,
        status: "CLEAN",
      });
      expect(verifyHeartbeat(s.key, hb)).toBe(true);
      expect(hb.sig).toBeDefined();
      expect(heartbeatDigest(hb.body)).toHaveLength(32);
    }
  });
});

describe("verifier", () => {
  it("rejects a tagged signature whose uid is not one of the principal's devices", async () => {
    const { f } = await fleet(2);
    const s = fleetSigner("node-e", f);
    const sig = (await s.sign(digest(5))).replace(/^.*:/, "");
    expect(verifyDigest(s.key, digest(5), `${uidHex(7)}:${sig}`)).toBe(false);
  });

  it("rejects a member's signature presented under another member's uid", async () => {
    const { f, devs } = await fleet(3);
    const s = fleetSigner("node-f", f);
    await s.sign(digest(6)); // device 0
    const byOne = await s.sign(digest(6)); // device 1, tagged
    const raw = byOne.split(":")[1];
    expect(verifyDigest(s.key, digest(6), `${devs[2].uid}:${raw}`)).toBe(false);
    expect(verifyDigest(s.key, digest(6), raw)).toBe(false); // not the primary's
  });

  it("rejects a tagged signature on a software key", async () => {
    const sw = softwareSigner("soft");
    const sig = await sw.sign(digest(8));
    expect(verifyDigest(sw.key, digest(8), sig)).toBe(true);
    expect(verifyDigest(sw.key, digest(8), `${uidHex(0)}:${sig}`)).toBe(false);
  });

  it("rejects malformed signatures", async () => {
    const { f } = await fleet(2);
    const s = fleetSigner("node-g", f);
    for (const bad of ["", "zz", `${"a".repeat(24)}:`, `:${"a".repeat(128)}`, "a".repeat(127)]) {
      expect(verifyDigest(s.key, digest(1), bad)).toBe(false);
    }
    expect(verifyDigest(s.key, digest(1), 42 as unknown as string)).toBe(false);
  });
});

describe("principal key shape", () => {
  const base = { id: "n", kind: "device", publicKey: "ab".repeat(32), uid: uidHex(0) };
  const m = (i: number) => ({ publicKey: "cd".repeat(32), uid: uidHex(i) });

  it("accepts a device key with distinct members", () => {
    expect(isPrincipalKey({ ...base, members: [m(1), m(2)] })).toBe(true);
  });

  it.each([
    ["an empty member list", { ...base, members: [] }],
    ["a member repeating the primary's uid", { ...base, members: [m(0)] }],
    ["two members with one uid", { ...base, members: [m(1), m(1)] }],
    ["a member with a bad key", { ...base, members: [{ publicKey: "xyz", uid: uidHex(1) }] }],
    ["a member with a bad uid", { ...base, members: [{ publicKey: "cd".repeat(32), uid: "12" }] }],
    ["a null member", { ...base, members: [null] }],
    ["members that are not a list", { ...base, members: { a: 1 } }],
    [
      "too many members",
      { ...base, members: Array.from({ length: MAX_DEVICE_MEMBERS + 1 }, (_, i) => m(i + 1)) },
    ],
    [
      "members on a software key",
      { id: "s", kind: "software", publicKey: "ab".repeat(32), members: [m(1)] },
    ],
  ])("rejects %s", (_name, key) => {
    expect(isPrincipalKey(key)).toBe(false);
  });

  it("a device key needs no members, and a software key no uid", () => {
    expect(isPrincipalKey(base)).toBe(true);
    expect(isPrincipalKey({ id: "s", kind: "software", publicKey: "ab".repeat(32) })).toBe(true);
    expect(
      isPrincipalKey({ id: "s", kind: "software", publicKey: "ab".repeat(32), uid: uidHex(0) }),
    ).toBe(false);
  });
});
