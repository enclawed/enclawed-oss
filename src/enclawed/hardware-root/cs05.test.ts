// Command set 0.5 at the host-protocol level: the bound anchor session (record v3), the fresh
// anchor read, activation-gated key derivation, and what `audit verify` concludes from them.
//
// Two kinds of evidence. (1) Answers the FIRMWARE produced through its own dispatch (its command set
// 0.5 test vectors, emulator keys), checked by this host's
// verifiers: the two implementations agree byte for byte. (2) A stand-in device that signs with a
// software key exactly the structures the Enclaweder host protocol specifies, and keeps the activations the device
// keeps; each "owner" is a function that relays, peeks at or alters frames. No real device.
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  bindingNames,
  clearActivations,
  deviceFactorActivations,
  noteActivation,
  parseBinding,
  peekActivation,
  verifyAnchorRead,
} from "./activation.js";
import { boundAnchorRefusal, decideAuditAnchorVerdict } from "./audit-anchor-verdict.js";
import type { AnchorRelayType, RootHealth, VerifiedMember } from "./broker.js";
import { activate, direct, StandIn, unlockRecord } from "./cs05-standin.test-support.js";
import {
  AnchorAuthError,
  AnchorSession,
  parseAnchor,
  verifyAnchorRecord,
} from "./enclaweder-hid.js";
import { enclawederHeadAnchor, HeadAnchorTampered } from "./head-anchor.js";
import { deriveDeviceKey, openKeyDeriveAnswer } from "./key-derive.js";
import { relayedAnchorDevice } from "./relayed-anchor.js";

const H = (s: string) => Buffer.from(s, "hex");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cs05-"));
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));
beforeEach(() => clearActivations());

// ---- (1) the firmware's own answers ----------------------------------------------------------
const FW = {
  devicePub: H("8f5afc0046ac44844e4dff950c473910e689fbf7acc76cefb06f0d1c5d4b5ac6"),
  uid: H("d3c226e2e4b0354c72ead9e9"),
};

describe("command set 0.5: the firmware's own answers verify here", () => {
  const V = {
    readNonce: H("e6802319b2fc33a5354106f4f0153ad748d933d38c905d47f213528fd021c6b7"),
    readAnswer: H(
      "00010f00000100000000000000fbd943e1138ac25e2368cdb71c4d4c7d7f16fbe089c5e8883f2e81e82142421cd3c226e2e4b0354c72ead9e90100000000000000010000000000000001000000000000000200000002879303000000000000000001000000000000000300000000000000eb0e44b5d3045bdf4822726eb472527bc0cdc654e3ba21821e413786a109b1fcb9ede913095156ba0dfb68701a9dd01cfde27afffa9f840dc0de07c1bee28e02",
    ),
    recordV3: H(
      "00030100000000000000fbd943e1138ac25e2368cdb71c4d4c7d7f16fbe089c5e8883f2e81e82142421cd3c226e2e4b0354c72ead9e9010000000000000001000000000000000200000002879303000000000000000001000000000000000300000000000000f80a9cc3e8fe3f1aaf0b875043315ee4410a8196313b51999bd67e3ed23d2d72519b9050cd4c0a08e80a4486c6eb42bfdfe3ec78d2f2d366c9adacf35e20f40d",
    ),
    kEnc: H("bbf611ebf1221956dd2a6252e98571a409d411f7833110413e55684af38b657e"),
    kMac: H("7156d1e7579ed56b897c2f68988da759fff1dfa7cec6b10384c30bdf3ba2c61d"),
    sealId: H("0200000000000000").readBigUInt64LE(0),
    kdvAnswer: H(
      "00010001001d87930305000000000000000200000000000000000000000000000021b4869c70c8961e225b01d834f689f9725d50c541a4197fcab6e2f4ae3d9f6f15b54481375f852a6581ca6ab7f5eae8c19b7307ef4f6d89453a730785b33a28",
    ),
    kdvKey: H("342586d97a46d1af013dedea75ed63ef1dd450eee05b2ba1e383e4408551192e"),
  };
  it("ANCHOR_READ: live, bound, head set by the live session, signed over the reader's nonce", () => {
    const r = verifyAnchorRead(FW.devicePub, V.readNonce, V.readAnswer, FW.uid);
    expect(r).not.toBeNull();
    expect(r?.anchored && r.live && r.headByLive && r.liveBind !== null).toBe(true);
    expect(parseBinding(r?.liveBind)?.kind).toBe("totp");
    const other = Buffer.from(V.readNonce);
    other[0] ^= 1;
    expect(verifyAnchorRead(FW.devicePub, other, V.readAnswer)).toBeNull();
  });
  it("record v3 parses and verifies, and carries the same binding as the read", () => {
    const rec = parseAnchor(V.recordV3);
    expect(rec.version).toBe(3);
    expect(verifyAnchorRecord(FW.devicePub, rec)).toBe(true);
    const r = verifyAnchorRead(FW.devicePub, V.readNonce, V.readAnswer)!;
    expect(rec.bind?.equals(r.liveBind!)).toBe(true);
    expect(rec.counter).toBe(r.counter);
    expect(rec.sess).toBe(r.sess);
    expect(verifyAnchorRecord(FW.devicePub, { ...rec, bind: Buffer.alloc(32) })).toBe(false);
  });
  it("KEY_DERIVE: the firmware's sealed answer opens here to the key its own client decrypted", () => {
    const o = openKeyDeriveAnswer(V.kEnc, V.kMac, FW.uid, V.sealId, V.kdvAnswer);
    expect(o?.key.equals(V.kdvKey)).toBe(true);
    expect(parseBinding(o?.binding)).toMatchObject({ kind: "unlock-use", useIndex: 1 });
    const t = Buffer.from(V.kdvAnswer);
    t[50] ^= 1;
    expect(openKeyDeriveAnswer(V.kEnc, V.kMac, FW.uid, V.sealId, t)).toBeNull();
    expect(openKeyDeriveAnswer(V.kEnc, V.kMac, FW.uid, V.sealId + 1n, V.kdvAnswer)).toBeNull();
  });
});

describe("activations", () => {
  it("a counted unlock use is remembered with its nonce and the receipt's (gid, use index)", async () => {
    const dev = new StandIn();
    const a = await activate(dev);
    const held = peekActivation(dev.raw.toString("hex"), "anchor");
    expect(held?.nonce.equals(a.nonce)).toBe(true);
    expect(held?.facts).toEqual({ kind: "unlock-use", gid: 7n, useIndex: 1, boot: 3n });
    expect(peekActivation(randomBytes(32).toString("hex"), "anchor")).toBeNull();
  });
  it("an activation older than 120 s is not offered", () => {
    const pub = randomBytes(32).toString("hex");
    noteActivation(
      pub,
      randomBytes(32),
      { kind: "totp", step: 1, counter: 2n },
      Date.now() - 121_000,
    );
    expect(peekActivation(pub, "anchor")).toBeNull();
  });
  it("a binding names exactly one activation", () => {
    const b = Buffer.alloc(32);
    b[0] = 1;
    b.writeUInt16LE(4, 2);
    b.writeBigUInt64LE(9n, 8);
    expect(bindingNames(b, { kind: "unlock-use", gid: 9n, useIndex: 4 })).toBe(true);
    expect(bindingNames(b, { kind: "unlock-use", gid: 9n, useIndex: 5 })).toBe(false);
    expect(bindingNames(b, { kind: "unlock-use", gid: 8n, useIndex: 4 })).toBe(false);
    expect(bindingNames(b, { kind: "totp", step: 0, counter: 0n })).toBe(false);
    const t = Buffer.alloc(32);
    t[0] = 2;
    t.writeUInt32LE(57_000_000, 4);
    t.writeBigUInt64LE(41n, 24);
    expect(bindingNames(t, { kind: "totp", step: 57_000_000, counter: 41n })).toBe(true);
    expect(bindingNames(t, { kind: "totp", step: 57_000_000, counter: 42n })).toBe(false);
    expect(parseBinding(t)?.kind).toBe("totp");
    expect(parseBinding(Buffer.alloc(31))).toBeNull();
  });
  it("a log's verified device-factor records are its activations; refusals and unparseable ones are not", () => {
    const acts = deviceFactorActivations([
      unlockRecord(7n, 2),
      {
        type: "x.auth.device-factor",
        payload: { outcome: "refused", via: "device-unlock", gid: "7", useIndex: 3 },
      },
      {
        type: "auth.device-factor",
        payload: { outcome: "verified", via: "device-totp", step: 5, counter: "9" },
      },
      { type: "auth.device-factor", payload: { outcome: "verified", via: "device-totp" } },
      {
        type: "other",
        payload: { outcome: "verified", via: "device-unlock", gid: "1", useIndex: 1 },
      },
      null,
    ]);
    expect(acts).toEqual([
      { kind: "unlock-use", gid: 7n, useIndex: 2 },
      { kind: "totp", step: 5, counter: 9n },
    ]);
  });
});

describe("ANCHOR_OPEN_BOUND and record v3", () => {
  it("opens bound on the activation; the transcript and every record carry its binding", async () => {
    const dev = new StandIn();
    const a = await activate(dev);
    const s = await AnchorSession.openBound(dev.frames(), dev.raw, a.nonce);
    expect(bindingNames(s.binding, { kind: "unlock-use", gid: 7n, useIndex: 1 })).toBe(true);
    const r = await s.set(Buffer.alloc(32, 1));
    expect(r.version).toBe(3);
    expect(r.bind?.equals(s.binding!)).toBe(true);
    expect(verifyAnchorRecord(dev.raw, r)).toBe(true);
    // The binding is signed: another binding, or the v2 tag over the same fields, does not verify.
    expect(verifyAnchorRecord(dev.raw, { ...r, bind: Buffer.alloc(32, 9) })).toBe(false);
    expect(verifyAnchorRecord(dev.raw, { ...r, version: 2 })).toBe(false);
  });
  it("a forged binding in the open answer fails the signature", async () => {
    const dev = new StandIn();
    const a = await activate(dev);
    const frames = {
      request: async (t: number, _i: number, p = Buffer.alloc(0)) => {
        const ans = dev.answer(t, p);
        if (t === 0x37) {
          ans[77 + 2] ^= 1; // use_index
        }
        return { payload: ans };
      },
    };
    await expect(AnchorSession.openBound(frames, dev.raw, a.nonce)).rejects.toMatchObject({
      code: "bad-signature",
    });
  });
  it("a bound session refuses a v2 record, or a v3 record with another binding", async () => {
    const dev = new StandIn();
    const a = await activate(dev);
    let mode: "v2" | "other" | null = null;
    const frames = {
      request: async (t: number, _i: number, p = Buffer.alloc(0)) => {
        const ans = dev.answer(t, p);
        if (t === 0x17 && mode === "v2") {
          const sess = dev.session!;
          dev.session = { ...sess, bind: null };
          const v2 = dev.record();
          dev.session = sess;
          return { payload: v2 };
        }
        if (t === 0x17 && mode === "other") {
          const sess = dev.session!;
          dev.session = { ...sess, bind: Buffer.alloc(32, 1) };
          const o = dev.record();
          dev.session = sess;
          return { payload: o };
        }
        return { payload: ans };
      },
    };
    const s = await AnchorSession.openBound(frames, dev.raw, a.nonce);
    mode = "v2";
    await expect(s.set(Buffer.alloc(32, 2))).rejects.toMatchObject({ code: "bad-record" });
    mode = "other";
    await expect(s.set(Buffer.alloc(32, 3))).rejects.toMatchObject({ code: "bad-record" });
  });
  it("an unbound session refuses a v3 record", async () => {
    const dev = new StandIn();
    const frames = {
      request: async (t: number, _i: number, p = Buffer.alloc(0)) => {
        const ans = dev.answer(t, p);
        if (t === 0x17) {
          const sess = dev.session!;
          dev.session = { ...sess, bind: Buffer.alloc(32, 1) };
          const v3 = dev.record();
          dev.session = sess;
          return { payload: v3 };
        }
        return { payload: ans };
      },
    };
    const s = await AnchorSession.open(frames, dev.raw);
    await expect(s.set(Buffer.alloc(32, 2))).rejects.toMatchObject({ code: "bad-record" });
  });
  it("an activation the device does not hold is ERR_AUTH; old firmware is unsupported", async () => {
    const dev = new StandIn();
    await expect(
      AnchorSession.openBound(dev.frames(), dev.raw, randomBytes(32)),
    ).rejects.toMatchObject({
      code: "auth",
    });
    dev.cs04 = true;
    const err = await AnchorSession.openBound(dev.frames(), dev.raw, randomBytes(32)).catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(AnchorAuthError);
    expect((err as AnchorAuthError).code).toBe("unsupported");
  });
});

describe("ANCHOR_READ", () => {
  it("verifies only over the reader's own nonce, for the expected uid", () => {
    const dev = new StandIn();
    dev.counter = 4n;
    dev.headSess = 2n;
    const n = randomBytes(32);
    const ans = dev.answer(0x38, n);
    const r = verifyAnchorRead(dev.raw, n, ans, dev.uid);
    expect(r?.anchored && r.counter === 4n && r.sess === 2n).toBe(true);
    expect(verifyAnchorRead(dev.raw, randomBytes(32), ans)).toBeNull(); // a replayed read
    expect(verifyAnchorRead(dev.raw, n, ans, randomBytes(12))).toBeNull(); // another device's
    const t = Buffer.from(ans);
    t[1 + 4] ^= 1; // the counter
    expect(verifyAnchorRead(dev.raw, n, t)).toBeNull();
    expect(verifyAnchorRead(dev.raw, n, Buffer.from([8]))).toBeNull();
  });
});

describe("the head anchor with command set 0.5", () => {
  it("anchors under a bound session, reads fresh, and verify matches the log's own launch", async () => {
    const dev = new StandIn();
    const a = await activate(dev);
    const sink = enclawederHeadAnchor({
      device: direct(dev),
      devicePublicKey: dev.raw,
      path: path.join(dir, "bound.anchor"),
    });
    const head = Buffer.alloc(32, 5).toString("hex");
    await sink.write(head);
    expect(dev.session?.bind).not.toBeNull();
    const stored = JSON.parse(fs.readFileSync(path.join(dir, "bound.anchor"), "utf8"));
    expect(stored.version).toBe(3);
    const r = await sink.readAttested!();
    expect(r.attested).toBe("device");
    expect(r.anchor).toMatchObject({ fresh: true, version: 3 });
    const log = [unlockRecord(7n, a.receipt.useIndex)];
    expect(boundAnchorRefusal(r.anchor!, deviceFactorActivations(log))).toBeNull();
    const verdict = decideAuditAnchorVerdict({
      claims: [{ line: 1, type: "x.launch", hardware: "held" }],
      device: null,
      chainAnchor: "matched",
      attestation: r.anchor,
      activations: deviceFactorActivations(log),
    });
    expect(verdict.ok).toBe(true);
    // A forger's log names another use: the device's binding does not match it.
    expect(
      decideAuditAnchorVerdict({
        claims: [{ line: 1, type: "x.launch", hardware: "held" }],
        device: null,
        chainAnchor: "matched",
        attestation: r.anchor,
        activations: deviceFactorActivations([unlockRecord(7n, a.receipt.useIndex + 1)]),
      }),
    ).toMatchObject({ ok: false, code: "anchor-unbound" });
    await sink.write(Buffer.alloc(32, 6).toString("hex"));
    expect(dev.opens).toBe(1n); // the same session: one activation, one bound open
  });

  it("a logger that opened plainly before the launch was activated re-opens bound once it is", async () => {
    const dev = new StandIn();
    const sink = enclawederHeadAnchor({
      device: direct(dev),
      devicePublicKey: dev.raw,
      path: path.join(dir, "late.anchor"),
    });
    await sink.write(Buffer.alloc(32, 11).toString("hex")); // before the activation: plain
    expect(dev.session?.bind).toBeNull();
    const a = await activate(dev);
    await sink.write(Buffer.alloc(32, 12).toString("hex"));
    expect(
      bindingNames(dev.session?.bind, {
        kind: "unlock-use",
        gid: 7n,
        useIndex: a.receipt.useIndex,
      }),
    ).toBe(true);
    const r = await sink.readAttested!();
    expect(r.anchor).toMatchObject({ fresh: true, version: 3 });
    expect(
      boundAnchorRefusal(
        r.anchor!,
        deviceFactorActivations([unlockRecord(7n, a.receipt.useIndex)]),
      ),
    ).toBeNull();
    await sink.write(Buffer.alloc(32, 13).toString("hex"));
    expect(dev.opens).toBe(2n); // one plain open, one bound re-open: no more
  });

  it("variant 1d: a plain squatter is replaced by the bound open, and its unbound head is refused", async () => {
    const dev = new StandIn();
    // The squatter: a plain open and a fabricated head (an unbound v2 record).
    const sq = await AnchorSession.open(dev.frames(), dev.raw);
    await sq.set(Buffer.alloc(32, 0xee));
    const n = randomBytes(32);
    const rr = verifyAnchorRead(dev.raw, n, dev.answer(0x38, n))!;
    const unbound = {
      fresh: true,
      counter: rr.counter.toString(),
      sess: rr.sess.toString(),
      version: 2 as const,
      bind: null,
    };
    expect(boundAnchorRefusal(unbound, [{ kind: "unlock-use", gid: 7n, useIndex: 1 }])).toMatch(
      /no device-verified launch activation bound/,
    );
    // No fresh read: the binding cannot be shown (verify refuses as anchor-read-unproven first).
    expect(boundAnchorRefusal(null, [])).toMatch(/no fresh anchor read/);
  });

  it("with no activation held, or on old firmware, the session is plain (and verify refuses it on 0.5)", async () => {
    const dev = new StandIn();
    const sink = enclawederHeadAnchor({
      device: direct(dev),
      devicePublicKey: dev.raw,
      path: path.join(dir, "plain.anchor"),
    });
    await sink.write(Buffer.alloc(32, 7).toString("hex"));
    expect(dev.session?.bind).toBeNull();
    const r = await sink.readAttested!();
    expect(r.anchor).toMatchObject({ fresh: true, version: 2, bind: null });
    expect(boundAnchorRefusal(r.anchor!, [])).not.toBeNull();

    const old = new StandIn();
    old.cs04 = true;
    await activate(old);
    const sink2 = enclawederHeadAnchor({
      device: direct(old),
      devicePublicKey: old.raw,
      path: path.join(dir, "old.anchor"),
    });
    await sink2.write(Buffer.alloc(32, 8).toString("hex"));
    expect(old.session?.bind).toBeNull();
    const r2 = await sink2.readAttested!();
    expect(r2.attested).toBe("device"); // ANCHOR_GET locally, as before
    expect(r2.anchor).toBeUndefined();
    // A log whose launch held the root does not verify on it: no fresh read proves command set 0.5.
    const claims = [{ line: 1, type: "x.launch", hardware: "held" }];
    expect(
      decideAuditAnchorVerdict({
        claims,
        device: null,
        chainAnchor: "matched",
        attestation: r2.anchor ?? null,
        activations: [],
      }),
    ).toMatchObject({ ok: false, code: "anchor-read-unproven" });
  });

  it("verify's downgrade pin: an owner faking \"unsupported\" for ANCHOR_READ at verify time (locally or relayed) leaves a held-root log anchor-read-unproven; a fresh read over verify's own nonce verifies", async () => {
    const claims = [{ line: 1, type: "x.launch", hardware: "required" }];
    const dev = new StandIn();
    const a = await activate(dev);
    const log = [unlockRecord(7n, a.receipt.useIndex)];
    const file = path.join(dir, "pin.anchor");
    const honest = enclawederHeadAnchor({
      device: direct(dev),
      devicePublicKey: dev.raw,
      path: file,
    });
    await honest.write(Buffer.alloc(32, 11).toString("hex"));
    const verdictOf = (r: Awaited<ReturnType<NonNullable<typeof honest.readAttested>>>) =>
      decideAuditAnchorVerdict({
        claims,
        device: null,
        chainAnchor:
          r.attested === "device"
            ? "matched"
            : r.attested === "offline"
              ? "matched-offline"
              : "absent",
        attestation: r.anchor ?? null,
        activations: deviceFactorActivations(log),
      });
    // Honest: a fresh read over this verification's nonce, bound to the log's own launch.
    expect(verdictOf(await honest.readAttested!())).toEqual({ ok: true, rootClaimed: true });
    // Something between verify and the device says "firmware before 0.5" (ERR_UNSUPPORTED).
    const faking = enclawederHeadAnchor({
      device: { ...direct(dev), anchorRead: async () => Buffer.from([8]) },
      devicePublicKey: dev.raw,
      path: file,
    });
    const r = await faking.readAttested!();
    expect(r.attested).toBe("device"); // the plain ANCHOR_GET still matches the head ...
    expect(verdictOf(r)).toMatchObject({ ok: false, code: "anchor-read-unproven" }); // ... never enough
    // Relayed: the owner fakes "unsupported" (relayed reads have no plain fallback: offline at best).
    const d = relayedAnchorDevice(
      {
        members: [
          {
            uid: dev.uid.toString("hex"),
            pubkey: dev.raw.toString("hex"),
            serial: "ENCLW-TEST",
            cert: "00",
            sku: "base",
          } as unknown as VerifiedMember,
        ],
        relayAnchor: async (t: AnchorRelayType, p: Buffer) =>
          t === 0x38 ? Buffer.from([8]) : dev.answer(t, p),
        relaySealed: async (t: 0x35 | 0x36, p: Buffer) => dev.answer(t, p),
      },
      (): RootHealth => ({ status: "CLEAN" }),
    )!;
    const relayed = enclawederHeadAnchor({ device: d, devicePublicKey: dev.raw, path: file });
    const rr = await relayed.readAttested!();
    expect(rr.anchor?.fresh).not.toBe(true);
    expect(verdictOf(rr)).toMatchObject({ ok: false, code: "anchor-read-unproven" });
    // An unavailable device, or no read at all: the same.
    for (const device of ["unavailable", "unanchored", null] as const) {
      expect(decideAuditAnchorVerdict({ claims, device })).toMatchObject({
        ok: false,
        code: "anchor-read-unproven",
      });
    }
  });

  it("a session bound to another activation than the one presented is refused", async () => {
    const dev = new StandIn();
    const a = await activate(dev);
    const other = Buffer.alloc(32);
    other[0] = 1;
    other.writeUInt16LE(a.receipt.useIndex + 3, 2);
    other.writeBigUInt64LE(7n, 8);
    dev.acts.get(a.nonce.toString("hex"))!.bind = other; // the device binds something else
    const sink = enclawederHeadAnchor({
      device: direct(dev),
      devicePublicKey: dev.raw,
      path: path.join(dir, "other.anchor"),
    });
    await expect(sink.write(Buffer.alloc(32, 10).toString("hex"))).rejects.toBeInstanceOf(
      HeadAnchorTampered,
    );
  });

  it("a fresh read that does not verify over this process's nonce is tampering, never offline", async () => {
    const dev = new StandIn();
    const d = direct(dev);
    const sink = enclawederHeadAnchor({
      device: { ...d, anchorRead: async () => dev.answer(0x38, randomBytes(32)) },
      devicePublicKey: dev.raw,
      path: path.join(dir, "replay.anchor"),
    });
    await sink.write(Buffer.alloc(32, 9).toString("hex"));
    await expect(sink.readAttested!()).rejects.toBeInstanceOf(HeadAnchorTampered);
  });
});

describe("relayed through the owner", () => {
  type Owner = (type: AnchorRelayType, payload: Buffer) => Promise<Buffer>;
  const clean = (): RootHealth => ({ status: "CLEAN" });
  function rootOf(
    dev: StandIn,
    owner: Owner,
    sealed: (t: 0x35 | 0x36, p: Buffer) => Promise<Buffer>,
  ) {
    const member = {
      uid: dev.uid.toString("hex"),
      pubkey: dev.raw.toString("hex"),
      serial: "ENCLW-TEST",
      cert: "00",
      sku: "base",
    } as unknown as VerifiedMember;
    return { members: [member], relayAnchor: owner, relaySealed: sealed };
  }

  it("the bound open travels sealed (the owner never sees the activation nonce) and reads are fresh", async () => {
    const dev = new StandIn();
    const a = await activate(dev);
    const seen: Buffer[] = [];
    const d = relayedAnchorDevice(
      rootOf(
        dev,
        async (t, p) => {
          seen.push(p);
          return dev.answer(t, p);
        },
        async (t, p) => {
          seen.push(p);
          return dev.answer(t, p);
        },
      ),
      clean,
    )!;
    const sink = enclawederHeadAnchor({
      device: d,
      devicePublicKey: dev.raw,
      path: path.join(dir, "relayed.anchor"),
    });
    await sink.write(Buffer.alloc(32, 3).toString("hex"));
    expect(dev.session?.bind).not.toBeNull();
    expect(seen.some((p) => p.includes(a.nonce.subarray(0, 8)))).toBe(false);
    const r = await sink.readAttested!();
    expect(r.attested).toBe("device");
    expect(r.anchor?.version).toBe(3);
  });

  it("an owner that replays an earlier read is caught", async () => {
    const dev = new StandIn();
    let first: Buffer | null = null;
    const d = relayedAnchorDevice(
      rootOf(
        dev,
        async (t, p) => {
          if (t === 0x38) {
            first ??= dev.answer(t, p);
            return first;
          }
          return dev.answer(t, p);
        },
        async (t, p) => dev.answer(t, p),
      ),
      clean,
    )!;
    const sink = enclawederHeadAnchor({
      device: d,
      devicePublicKey: dev.raw,
      path: path.join(dir, "replayed.anchor"),
    });
    await sink.write(Buffer.alloc(32, 4).toString("hex"));
    await sink.readAttested!();
    await expect(sink.readAttested!()).rejects.toBeInstanceOf(HeadAnchorTampered);
  });
});

describe("KEY_DERIVE", () => {
  const relayOf =
    (dev: StandIn, peek?: (p: Buffer) => void) => async (t: 0x35 | 0x36, p: Buffer) => {
      peek?.(p);
      const ans = dev.answer(t, p);
      peek?.(ans);
      return ans;
    };
  it("derives the same key per label, once per activation, and the relay sees neither key nor nonce", async () => {
    const dev = new StandIn();
    const label = randomBytes(32);
    const a = await activate(dev);
    const seen: Buffer[] = [];
    const k1 = await deriveDeviceKey(
      relayOf(dev, (p) => seen.push(p)),
      dev.raw,
      dev.uid,
      label,
    );
    expect(k1.ok).toBe(true);
    if (!k1.ok) {
      return;
    }
    expect(
      bindingNames(k1.binding, { kind: "unlock-use", gid: 7n, useIndex: a.receipt.useIndex }),
    ).toBe(true);
    expect(
      seen.some((p) => p.includes(k1.key.subarray(0, 8)) || p.includes(a.nonce.subarray(0, 8))),
    ).toBe(false);
    // the same activation again: spent here (and on the device)
    expect(await deriveDeviceKey(relayOf(dev), dev.raw, dev.uid, label)).toEqual({
      ok: false,
      code: "no-activation",
    });
    await activate(dev);
    const k2 = await deriveDeviceKey(relayOf(dev), dev.raw, dev.uid, label);
    expect(k2.ok && k2.key.equals(k1.key)).toBe(true);
    await activate(dev);
    const k3 = await deriveDeviceKey(relayOf(dev), dev.raw, dev.uid, randomBytes(32));
    expect(k3.ok && !k3.key.equals(k1.key)).toBe(true);
  });
  it("an altered answer, a device that does not hold the activation, and old firmware are refusals", async () => {
    const dev = new StandIn();
    await activate(dev);
    const flip = async (t: 0x35 | 0x36, p: Buffer) => {
      const ans = dev.answer(t, p);
      if (t === 0x36 && ans.length === 97) {
        ans[40] ^= 1;
      }
      return ans;
    };
    expect(await deriveDeviceKey(flip, dev.raw, dev.uid, randomBytes(32))).toEqual({
      ok: false,
      code: "bad-response",
    });
    noteActivation(dev.raw.toString("hex"), randomBytes(32), {
      kind: "unlock-use",
      gid: 7n,
      useIndex: 99,
    });
    expect(await deriveDeviceKey(relayOf(dev), dev.raw, dev.uid, randomBytes(32))).toEqual({
      ok: false,
      code: "refused",
    });
    const old = new StandIn();
    old.cs04 = true;
    await activate(old);
    expect(await deriveDeviceKey(relayOf(old), old.raw, old.uid, randomBytes(32))).toEqual({
      ok: false,
      code: "unsupported",
    });
  });
  it("a binding that is not the activation presented is refused", async () => {
    const dev = new StandIn();
    const a = await activate(dev);
    const held = peekActivation(dev.raw.toString("hex"), "key")!;
    // The device answers for the nonce, but this process believes it was another use.
    const lie = {
      ...held,
      facts: { kind: "unlock-use" as const, gid: 7n, useIndex: a.receipt.useIndex + 5 },
    };
    expect(await deriveDeviceKey(relayOf(dev), dev.raw, dev.uid, randomBytes(32), lie)).toEqual({
      ok: false,
      code: "bad-response",
    });
  });
  it("openKeyDeriveAnswer checks the tag in full", () => {
    const k = randomBytes(32);
    expect(openKeyDeriveAnswer(k, k, randomBytes(12), 1n, Buffer.alloc(97))).toBeNull();
    expect(openKeyDeriveAnswer(k, k, randomBytes(12), 1n, Buffer.alloc(96))).toBeNull();
  });
});
