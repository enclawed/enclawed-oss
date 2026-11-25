// Host side of TOTP_VERIFY / SIGN_ATTESTED: the exact bytes the device signs, and the checks this
// host makes on every answer before it trusts a verdict.
import { describe, expect, it } from "vitest";
import type { LatchFrameDevice } from "./device-latch.js";
import {
  attestedMessage,
  checkVerdictAnswer,
  createDeviceTotpSecondFactor,
  deviceTotpVerdict,
  deviceTotpVerify,
  parseVerdictBody,
  summaryHash,
  verdictMessage,
  verifyAttestedSignature,
  verifyVerdictRecord,
  verifyVerdictSignature,
  type VerdictRecord,
} from "./totp-verify.js";

// Golden vectors for the signed TOTP_VERIFY verdict and SIGN_ATTESTED formats, made with the
// RFC 8032 test-1 key.
const V = {
  pub: "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a",
  nonce: "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
  uid: "a0a1a2a3a4a5a6a7a8a9aaab",
  passBody: "01010100008793032a0000000000000000000000a0a1a2a3a4a5a6a7a8a9aaab",
  passMsg:
    "656e636c6177656465722e746f74702d766572646963742e7631000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f01010100008793032a0000000000000000000000a0a1a2a3a4a5a6a7a8a9aaab",
  passSig:
    "5dc388782811f19f17d5b60be6c1743c5809241e9fcef3af9e8af7d8b18ac28010efe651d28301b966bcb936a74a9ef766f2f1ff54c97891054a69115c3f3e0f",
  failBody: "01010003000000002b00000000000000a00f0000a0a1a2a3a4a5a6a7a8a9aaab",
  failSig:
    "ce9bce73ba73faf074805520f46c2c51d35704d50aa19a252c9a34117de6a7d452c0039b1429aa34af1b21efd4d800ffe23cb1a2a6b41ce83eb40e24f2a15208",
  attBody: "01810100018793032c0000000000000000000000a0a1a2a3a4a5a6a7a8a9aaab",
  digest: "404142434445464748494a4b4c4d4e4f505152535455565758595a5b5c5d5e5f",
  summaryText: "admin policy: allow gateway.auth.mode none until 2027-01-01T00:00:00Z",
  summary: "e82839293461b0d663b8f4ff8f10f924981d856c42f97963cc87c58996f6282e",
  attMsg:
    "656e636c6177656465722e61747465737465642d7369676e2e7631000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f01810100018793032c0000000000000000000000a0a1a2a3a4a5a6a7a8a9aaab404142434445464748494a4b4c4d4e4f505152535455565758595a5b5c5d5e5fe82839293461b0d663b8f4ff8f10f924981d856c42f97963cc87c58996f6282e",
  attSig:
    "8cb3fb4c91dc55997497b2535ef7a063593c9b70dad887b25b01f5a20d05aea35fa0d233b820b3624292a15d7eef4a3c5185690c6e88c8d0fea51d9c1757b40a",
};
const h = (s: string) => Buffer.from(s, "hex");

describe("TOTP_VERIFY / SIGN_ATTESTED signed formats (golden vectors)", () => {
  it("builds the exact bytes the device signs and verifies the device's signatures", () => {
    expect(verdictMessage(h(V.nonce), h(V.passBody)).toString("hex")).toBe(V.passMsg);
    expect(verifyVerdictSignature(h(V.pub), h(V.nonce), h(V.passBody), h(V.passSig))).toBe(true);
    expect(verifyVerdictSignature(h(V.pub), h(V.nonce), h(V.failBody), h(V.failSig))).toBe(true);
    expect(summaryHash(V.summaryText).toString("hex")).toBe(V.summary);
    expect(
      attestedMessage(h(V.nonce), h(V.attBody), h(V.digest), h(V.summary)).toString("hex"),
    ).toBe(V.attMsg);
    expect(
      verifyAttestedSignature(
        h(V.pub),
        h(V.nonce),
        h(V.attBody),
        h(V.digest),
        h(V.summary),
        h(V.attSig),
      ),
    ).toBe(true);
  });

  it("parses the verdict body fields", () => {
    expect(parseVerdictBody(h(V.passBody))).toMatchObject({
      ver: 1,
      purpose: 1,
      pass: true,
      rfails: 0,
      step: 60_000_000,
      counter: 42n,
      waitMs: 0,
    });
    expect(parseVerdictBody(h(V.failBody))).toMatchObject({
      pass: false,
      rfails: 3,
      step: 0,
      counter: 43n,
      waitMs: 4000,
    });
  });

  it("keeps the domains apart: no verdict is an attested signature, and no other nonce or body verifies", () => {
    expect(verifyVerdictSignature(h(V.pub), h(V.nonce), h(V.attBody), h(V.attSig))).toBe(false);
    expect(
      verifyAttestedSignature(
        h(V.pub),
        h(V.nonce),
        h(V.passBody),
        h(V.digest),
        h(V.summary),
        h(V.passSig),
      ),
    ).toBe(false);
    const n2 = h(V.nonce);
    n2[0] ^= 1;
    expect(verifyVerdictSignature(h(V.pub), n2, h(V.passBody), h(V.passSig))).toBe(false);
    const d2 = h(V.digest);
    d2[31] ^= 1;
    expect(
      verifyAttestedSignature(h(V.pub), h(V.nonce), h(V.attBody), d2, h(V.summary), h(V.attSig)),
    ).toBe(false);
    expect(
      verifyAttestedSignature(
        h(V.pub),
        h(V.nonce),
        h(V.attBody),
        h(V.digest),
        summaryHash("something else"),
        h(V.attSig),
      ),
    ).toBe(false);
  });
});

describe("deviceTotpVerify / checkVerdictAnswer (host checks the device's signed verdict)", () => {
  const now = 1_800_000_000;

  it("refuses malformed codes and unknown purposes without asking the device", async () => {
    let asked = 0;
    const access = {
      pubkeyRaw: h(V.pub),
      uid: h(V.uid),
      run<T>(_fn: (dev: LatchFrameDevice) => Promise<T>): Promise<T> {
        asked++;
        throw new Error("the device must not be asked");
      },
    };
    expect(await deviceTotpVerify(access, { code: "12345", purpose: "admin" })).toMatchObject({
      code: "malformed-code",
    });
    expect(await deviceTotpVerify(access, { code: "123456", purpose: "nope" })).toMatchObject({
      code: "unknown-purpose",
    });
    expect(
      await deviceTotpVerify(access, { code: "123456", purpose: "constructor" }),
    ).toMatchObject({ code: "unknown-purpose" });
    expect(asked).toBe(0);
  });

  it("refuses a PASS whose step is far from this host's clock", async () => {
    // The golden PASS is for step 60 000 000 (unix 1 800 000 000): genuine, but an hour off our clock.
    const stale = checkVerdictAnswer(
      Buffer.concat([Buffer.from([0]), h(V.passBody), h(V.passSig)]),
      { nonce: h(V.nonce), pubkeyRaw: h(V.pub), uid: h(V.uid), purpose: 1, nowS: now + 3600 },
    );
    expect(stale).toMatchObject({ ok: false, code: "stale-step" });
    const fresh = checkVerdictAnswer(
      Buffer.concat([Buffer.from([0]), h(V.passBody), h(V.passSig)]),
      {
        nonce: h(V.nonce),
        pubkeyRaw: h(V.pub),
        uid: h(V.uid),
        purpose: 1,
        nowS: 60_000_000 * 30 + 10,
      },
    );
    expect(fresh.ok).toBe(true);
  });

  it("maps the device's refusal status bytes before evaluating anything", () => {
    const opts = { nonce: h(V.nonce), pubkeyRaw: h(V.pub), uid: h(V.uid), purpose: 1, nowS: now };
    for (const [status, code] of [
      [8, "unsupported"],
      [3, "not-enrolled"],
      [9, "locked"],
      [7, "backoff"],
      [2, "device-error"],
    ] as const) {
      expect(checkVerdictAnswer(Buffer.from([status]), opts)).toMatchObject({ ok: false, code });
    }
    expect(checkVerdictAnswer(Buffer.alloc(0), opts)).toMatchObject({ code: "no-response" });
  });

  it("refuses a verdict under another nonce, purpose or uid, or of the wrong length", () => {
    const answer = Buffer.concat([Buffer.from([0]), h(V.passBody), h(V.passSig)]);
    const opts = {
      nonce: h(V.nonce),
      pubkeyRaw: h(V.pub),
      uid: h(V.uid),
      purpose: 1,
      nowS: 60_000_000 * 30 + 10,
    };
    const n2 = h(V.nonce);
    n2[0] ^= 1;
    expect(checkVerdictAnswer(answer, { ...opts, nonce: n2 })).toMatchObject({
      code: "bad-signature",
    });
    expect(checkVerdictAnswer(answer, { ...opts, purpose: 2 })).toMatchObject({
      code: "bad-verdict",
    });
    expect(checkVerdictAnswer(answer, { ...opts, uid: Buffer.alloc(12) })).toMatchObject({
      code: "bad-verdict",
    });
    expect(checkVerdictAnswer(answer.subarray(0, 96), opts)).toMatchObject({ code: "bad-verdict" });
    const fail = Buffer.concat([Buffer.from([0]), h(V.failBody), h(V.failSig)]);
    expect(checkVerdictAnswer(fail, opts)).toMatchObject({ ok: false, code: "rejected" });
  });

  it("maps ERR_TIME (command set 0.6) to clock-disagrees, still a checked signed refusal", () => {
    const opts = {
      nonce: h(V.nonce),
      pubkeyRaw: h(V.pub),
      uid: h(V.uid),
      purpose: 1,
      nowS: 60_000_000 * 30 + 10,
    };
    const time = Buffer.concat([Buffer.from([10]), h(V.failBody), h(V.failSig)]);
    const r = checkVerdictAnswer(time, opts);
    expect(r).toMatchObject({ ok: false, code: "clock-disagrees" });
    expect(!r.ok && r.signed).toBeTruthy();
    // ERR_TIME never turns a signed PASS body into a pass, and a forged one does not verify.
    const timePass = Buffer.concat([Buffer.from([10]), h(V.passBody), h(V.passSig)]);
    expect(checkVerdictAnswer(timePass, opts)).toMatchObject({
      ok: false,
      code: "clock-disagrees",
    });
    const n2 = h(V.nonce);
    n2[0] ^= 1;
    expect(checkVerdictAnswer(time, { ...opts, nonce: n2 })).toMatchObject({
      code: "bad-signature",
    });
    // A status this host does not know is a refusal, never a pass.
    expect(checkVerdictAnswer(Buffer.from([11]), opts)).toMatchObject({
      ok: false,
      code: "device-error",
    });
  });
});

describe("createDeviceTotpSecondFactor (the auth/device-factor.ts contract)", () => {
  it("is null without a bound, CLEAN device", () => {
    expect(createDeviceTotpSecondFactor(() => null)).toBeNull();
  });
});

// Verdict records (deviceTotpVerdict / verifyVerdictRecord), from the same golden vectors: the
// session-start PASS above, and an unlock PASS over another caller-chosen nonce.
const R = {
  passRecord: {
    v: 1,
    purpose: 1,
    uid: V.uid,
    pubkey: V.pub,
    nonce: V.nonce,
    body: V.passBody,
    sig: V.passSig,
  } as VerdictRecord,
  unlockNonce: "c0ffee00000000000000000000000000000000000000000000000000000000ee",
  unlockBody: "01090100018793032c0000000000000000000000a0a1a2a3a4a5a6a7a8a9aaab",
  unlockSig:
    "8ae630863da831181bcddb3f5ebede2bd3b521a5e1390f5d18480cb3fefeee486110cf3b54183a552405fca8e8d9863b55c3b1c95b4f6d17551893aff4f25503",
};
const unlockRecord = (): VerdictRecord => ({
  v: 1,
  purpose: 9,
  uid: V.uid,
  pubkey: V.pub,
  nonce: R.unlockNonce,
  body: R.unlockBody,
  sig: R.unlockSig,
});
const expectFor = (purpose: "session-start" | "unlock", nonce: string) => ({
  purpose,
  nonce: h(nonce),
  pubkeyRaw: h(V.pub),
  uid: h(V.uid),
});

/** An access that answers one fixed, recorded device answer, and keeps what it was asked. */
function replayAccess(answer: Buffer | null) {
  const sent: Buffer[] = [];
  return {
    sent,
    access: {
      pubkeyRaw: h(V.pub),
      uid: h(V.uid),
      run<T>(fn: (dev: LatchFrameDevice) => Promise<T>): Promise<T> {
        return fn({
          request: async (_type: number, _id: number, payload?: Buffer) => {
            sent.push(Buffer.from(payload ?? Buffer.alloc(0)));
            return answer ? { payload: answer } : null;
          },
        });
      },
    },
  };
}

describe("verifyVerdictRecord (offline check of a stored verdict)", () => {
  it("accepts the golden records for their purpose and nonce, with the device-attested time", () => {
    expect(verifyVerdictRecord(R.passRecord, expectFor("session-start", V.nonce))).toEqual({
      ok: true,
      stepTimeS: 60_000_000 * 30,
      counter: 42n,
    });
    expect(verifyVerdictRecord(unlockRecord(), expectFor("unlock", R.unlockNonce))).toEqual({
      ok: true,
      stepTimeS: 60_000_001 * 30,
      counter: 44n,
    });
    // A record survives a JSON round trip unchanged (it is stored as JSON).
    const stored = JSON.parse(JSON.stringify(unlockRecord())) as unknown;
    expect(verifyVerdictRecord(stored, expectFor("unlock", R.unlockNonce)).ok).toBe(true);
  });

  it("rejects another purpose, nonce or device", () => {
    expect(verifyVerdictRecord(unlockRecord(), expectFor("session-start", R.unlockNonce))).toEqual({
      ok: false,
      reason: "verdict does not approve this purpose",
    });
    expect(verifyVerdictRecord(R.passRecord, expectFor("unlock", V.nonce)).ok).toBe(false);
    expect(verifyVerdictRecord(unlockRecord(), expectFor("unlock", V.nonce))).toEqual({
      ok: false,
      reason: "made for another request",
    });
    const otherKey = { ...expectFor("unlock", R.unlockNonce), pubkeyRaw: Buffer.alloc(32, 7) };
    expect(verifyVerdictRecord(unlockRecord(), otherKey)).toEqual({
      ok: false,
      reason: "signed by a different device",
    });
    const otherUid = { ...expectFor("unlock", R.unlockNonce), uid: Buffer.alloc(12) };
    expect(verifyVerdictRecord(unlockRecord(), otherUid).ok).toBe(false);
    // Claiming the expected key and nonce in the record does not help: the signature is checked.
    const forged = { ...unlockRecord(), pubkey: "00".repeat(32) };
    expect(
      verifyVerdictRecord(forged, {
        ...expectFor("unlock", R.unlockNonce),
        pubkeyRaw: h("00".repeat(32)),
      }).ok,
    ).toBe(false);
  });

  it("rejects an edited body, nonce, signature or purpose field", () => {
    const flip = (hex: string, at: number) => {
      const b = h(hex);
      b[at] ^= 1;
      return b.toString("hex");
    };
    const e = expectFor("unlock", R.unlockNonce);
    for (const edited of [
      { ...unlockRecord(), body: flip(R.unlockBody, 4) }, // another step
      { ...unlockRecord(), body: flip(R.unlockBody, 1) }, // another purpose byte
      { ...unlockRecord(), sig: flip(R.unlockSig, 0) },
      { ...unlockRecord(), purpose: 1 },
    ]) {
      expect(verifyVerdictRecord(edited, e).ok).toBe(false);
    }
    const editedNonce = { ...unlockRecord(), nonce: flip(R.unlockNonce, 31) };
    expect(verifyVerdictRecord(editedNonce, { ...e, nonce: h(editedNonce.nonce) })).toEqual({
      ok: false,
      reason: "device signature does not verify",
    });
  });

  it("rejects a signed refusal, malformed records and unknown purposes", () => {
    const refusal = { ...R.passRecord, body: V.failBody, sig: V.failSig };
    expect(verifyVerdictRecord(refusal, expectFor("session-start", V.nonce))).toEqual({
      ok: false,
      reason: "verdict does not approve this purpose",
    });
    for (const bad of [
      null,
      undefined,
      "x",
      {},
      { ...R.passRecord, v: 2 },
      { ...R.passRecord, sig: V.passSig.slice(2) },
      { ...R.passRecord, body: V.passBody.toUpperCase() },
      { ...R.passRecord, uid: undefined },
    ]) {
      expect(verifyVerdictRecord(bad, expectFor("session-start", V.nonce)).ok).toBe(false);
    }
    expect(
      verifyVerdictRecord(R.passRecord, {
        ...expectFor("session-start", V.nonce),
        purpose: "constructor" as "unlock",
      }),
    ).toEqual({ ok: false, reason: "unknown purpose" });
  });
});

describe("deviceTotpVerdict (the device's verdict over the caller's nonce)", () => {
  const nowS = 60_000_000 * 30 + 10;

  it("sends the caller's nonce and returns the record verifyVerdictRecord accepts", async () => {
    const { access, sent } = replayAccess(
      Buffer.concat([Buffer.from([0]), h(V.passBody), h(V.passSig)]),
    );
    const r = await deviceTotpVerdict(access, {
      code: "123456",
      purpose: "session-start",
      nonce: h(V.nonce),
      nowS,
    });
    expect(r).toEqual({
      ok: true,
      record: R.passRecord,
      step: 60_000_000,
      stepTimeS: 60_000_000 * 30,
      counter: 42n,
    });
    expect(sent).toHaveLength(1);
    expect(sent[0].subarray(0, 32).toString("hex")).toBe(V.nonce);
    expect(sent[0][44]).toBe(1); // the purpose asked for
    if (r.ok) {
      expect(verifyVerdictRecord(r.record, expectFor("session-start", V.nonce)).ok).toBe(true);
    }
  });

  it("returns a signed refusal as a result, with its record, never an exception", async () => {
    const { access } = replayAccess(Buffer.concat([Buffer.from([0]), h(V.failBody), h(V.failSig)]));
    const r = await deviceTotpVerdict(access, {
      code: "123456",
      purpose: "session-start",
      nonce: h(V.nonce),
      nowS,
    });
    expect(r).toEqual({
      ok: false,
      code: "rejected",
      waitMs: 4000,
      record: { ...R.passRecord, body: V.failBody, sig: V.failSig },
    });
    if (!r.ok && r.record) {
      expect(verifyVerdictRecord(r.record, expectFor("session-start", V.nonce)).ok).toBe(false);
    }
  });

  it("refuses an answer over another nonce or purpose, a stale step, or no answer, without a record", async () => {
    const pass = Buffer.concat([Buffer.from([0]), h(V.passBody), h(V.passSig)]);
    const ask = (
      access: ReturnType<typeof replayAccess>["access"],
      p: Partial<{ purpose: string; nonce: Buffer; nowS: number }>,
    ) =>
      deviceTotpVerdict(access, {
        code: "123456",
        purpose: p.purpose ?? "session-start",
        nonce: p.nonce ?? h(V.nonce),
        nowS: p.nowS ?? nowS,
      });
    expect(await ask(replayAccess(pass).access, { nonce: h(R.unlockNonce) })).toEqual({
      ok: false,
      code: "bad-signature",
    });
    expect(await ask(replayAccess(pass).access, { purpose: "unlock" })).toEqual({
      ok: false,
      code: "bad-verdict",
    });
    expect(await ask(replayAccess(pass).access, { nowS: nowS + 3600 })).toEqual({
      ok: false,
      code: "stale-step",
    });
    expect(await ask(replayAccess(null).access, {})).toEqual({ ok: false, code: "no-response" });
    expect(await ask(replayAccess(Buffer.from([9])).access, {})).toEqual({
      ok: false,
      code: "locked",
    });
  });

  it("refuses malformed input without asking the device, and throws only when the device is unreachable", async () => {
    const { access, sent } = replayAccess(null);
    for (const [p, code] of [
      [{ code: "12345", purpose: "unlock", nonce: h(V.nonce) }, "malformed-code"],
      [{ code: "123456", purpose: "nope", nonce: h(V.nonce) }, "unknown-purpose"],
      [{ code: "123456", purpose: "admin-policy", nonce: h(V.nonce) }, "unknown-purpose"],
      [{ code: "123456", purpose: "unlock", nonce: Buffer.alloc(31) }, "malformed-nonce"],
      [
        { code: "123456", purpose: "unlock", nonce: "00".repeat(32) as unknown as Buffer },
        "malformed-nonce",
      ],
    ] as const) {
      expect(await deviceTotpVerdict(access, p)).toEqual({ ok: false, code });
    }
    expect(sent).toHaveLength(0);
    const unreachable = {
      pubkeyRaw: h(V.pub),
      uid: h(V.uid),
      run<T>(): Promise<T> {
        return Promise.reject(new Error("device gone"));
      },
    };
    await expect(
      deviceTotpVerdict(unreachable, { code: "123456", purpose: "unlock", nonce: h(V.nonce) }),
    ).rejects.toThrow("device gone");
  });
});
