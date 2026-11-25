// Host-only checks of the factor-authorised operations' host interface: the sealed frame and an
// unlock receipt against fixed golden vectors (a fixed device test key: RFC 8032 test 1), the
// identity-log parser against a fixed signed answer, and the input bounds. No device involved.
import { describe, expect, it } from "vitest";
import {
  FactorError,
  identityFingerprint,
  parseIdentityLog,
  parseUnlockBody,
  readDeviceEntropy,
  sealFrame,
  verifyUnlockReceipt,
  type UnlockRecord,
} from "./device-factors.js";

const H = (s: string) => Buffer.from(s, "hex");
const PUB = H("d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a");
const UID = H("a0a1a2a3a4a5a6a7a8a9aaab");
const NONCE = H("000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f");
const USE_BODY =
  "010100020300010007000000000000002a00000000000000c02709003814090000d2496b0000000005d2496b000000000087930301000000a0a1a2a3a4a5a6a7a8a9aaab404142434445464748494a4b4c4d4e4f505152535455565758595a5b5c5d5e5f";
const USE_SIG =
  "09e19b0bda7f733946d19e85df41bf3ee5320e8fbec8b6da4cd045ca5ec44139c99bc5fa48fdf5aacd83a70c5c6fd53f23cecb2678fb31c5d049a6bc4ea92201";
const SCOPE = H("404142434445464748494a4b4c4d4e4f505152535455565758595a5b5c5d5e5f");

describe("sealed frame", () => {
  it("matches the golden frame and wipes its keys", () => {
    const s = {
      id: 9n,
      uid: UID,
      kEnc: H("edf3edea8463800a447c0ebf067097f160d5d738b1fb1d5dac2c62e1cff0c050"),
      kMac: H("ee6ba1186c280cbc661438b37f28276f0109f2ea8673a29225831e980ab71316"),
    };
    const f = sealFrame(
      s,
      0x2d,
      H(
        "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f6a61040000d2496b0000000001",
      ),
    );
    expect(f.toString("hex")).toBe(
      "09000000000000002d2d002b6ef3ab281742e52efa2f29b47544f012c16e70124aaf8d2cb02128dd9e437b9e6b81cf020260a47b4a41fb0f9e68c0ec07aff71eb0a85d51414981769a381f94823576b89e78ec0a1befe9af",
    );
    expect(s.kEnc.equals(Buffer.alloc(32)) && s.kMac.equals(Buffer.alloc(32))).toBe(true);
    expect(() => sealFrame({ ...s }, 0x2d, Buffer.alloc(321))).toThrow();
  });
});

describe("unlock receipt", () => {
  const rec: UnlockRecord = {
    v: 1,
    tag: "use",
    uid: UID.toString("hex"),
    pubkey: PUB.toString("hex"),
    nonce: NONCE.toString("hex"),
    body: USE_BODY,
    sig: USE_SIG,
  };
  it("verifies the golden receipt for its nonce, uid, scope and time", () => {
    const b = verifyUnlockReceipt(rec, {
      pubkeyRaw: PUB,
      uid: UID,
      nonce: NONCE,
      scope: SCOPE,
      nowS: 1_800_000_005,
    });
    expect(b).not.toBeNull();
    expect(b!.kind).toBe("use");
    expect(b!.useIndex).toBe(1);
    expect(b!.gid).toBe(7n);
  });
  it("refuses another nonce, scope, uid, a stale time, an altered body, or a non-receipt tag", () => {
    const ok = { pubkeyRaw: PUB, uid: UID, nonce: NONCE, scope: SCOPE, nowS: 1_800_000_005 };
    expect(verifyUnlockReceipt(rec, { ...ok, nonce: Buffer.alloc(32) })).toBeNull();
    expect(verifyUnlockReceipt(rec, { ...ok, scope: Buffer.alloc(32) })).toBeNull();
    expect(verifyUnlockReceipt(rec, { ...ok, uid: Buffer.alloc(12) })).toBeNull();
    expect(verifyUnlockReceipt(rec, { ...ok, nowS: 1_800_005_000 })).toBeNull();
    const body = H(USE_BODY);
    body[52] ^= 1;
    expect(verifyUnlockReceipt({ ...rec, body: body.toString("hex") }, ok)).toBeNull();
    expect(verifyUnlockReceipt({ ...rec, tag: "state" }, ok)).toBeNull();
  });
  it("parses the body layout", () => {
    const b = parseUnlockBody(H(USE_BODY));
    expect([b.state, b.uses, b.used, b.boot, b.leaseMs]).toEqual(["active", 3, 1, 42n, 600_000]);
    expect(() => parseUnlockBody(Buffer.alloc(99))).toThrow();
  });
});

describe("identity log", () => {
  const body = H(
    "0500000000000000030000000000000003030000000000000005000000000000000100000100000000054f341a2fa584bbd2000000000000000200000000000000050000000000000002010101ffffffff0000000000000000cd000000000000000100000000000000040000000000000003020107010000000000000000000000cd81010000000000",
  );
  const sig = H(
    "ee239c09460c80f37a0d4075d99bbd0e10e409180e53a0d1d0cca166a186f916aa0110e4dc21af4525eee1de173657ef974e00022e70cbf18817efa91eacd707",
  );
  const answer = Buffer.concat([Buffer.from([0]), body, sig]);
  it("parses and verifies a fixed signed answer for its nonce", () => {
    const L = parseIdentityLog(answer, NONCE, PUB, UID);
    expect(L.boot).toBe(5n);
    expect(L.total).toBe(3n);
    expect(L.events.map((e) => e.kind)).toEqual(["mint", "load-failure", "zeroize"]);
    expect(L.events[1].reasonText).toBe("magic missing");
    expect(L.events[2].reasonText).toBe("environmental failure");
    expect(L.events[0].fingerprint.equals(identityFingerprint(PUB))).toBe(true);
  });
  it("refuses it under another nonce or uid, or altered", () => {
    expect(() => parseIdentityLog(answer, Buffer.alloc(32), PUB, UID)).toThrow(FactorError);
    expect(() => parseIdentityLog(answer, NONCE, PUB, Buffer.alloc(12))).toThrow(FactorError);
    const bad = Buffer.from(answer);
    bad[1 + 17 + 16] ^= 1;
    expect(() => parseIdentityLog(bad, NONCE, PUB, UID)).toThrow(FactorError);
  });
});

describe("extra entropy", () => {
  it("refuses out-of-bounds sizes and a malformed answer", async () => {
    const dev = {
      request: async (_t: number, _i: number, p?: Buffer) => ({
        payload: Buffer.concat([
          Buffer.from([0, p![0], p![1]]),
          Buffer.alloc(p!.readUInt16LE(0), 7),
        ]),
      }),
    };
    await expect(readDeviceEntropy(dev, 0)).rejects.toBeInstanceOf(RangeError);
    await expect(readDeviceEntropy(dev, 257)).rejects.toBeInstanceOf(RangeError);
    expect((await readDeviceEntropy(dev, 8)).equals(Buffer.alloc(8, 7))).toBe(true);
    const short = { request: async () => ({ payload: Buffer.from([0, 8, 0, 1]) }) };
    await expect(readDeviceEntropy(short, 8)).rejects.toMatchObject({ code: "bad-record" });
  });
});
