// Host side of the Enclaweder's device-verified TOTP (command set 0.3: TOTP_VERIFY 0x2D,
// SIGN_ATTESTED 0x2E; Enclaweder wire protocol, "Device-verified TOTP").
//
// Policy: a TOTP code (for example from Microsoft Authenticator) is a second factor ONLY when an
// Enclaweder verified it. The secret was minted on the device and never leaves it, so this host
// relays the typed digits and checks the device's SIGNED verdict; it never holds the secret and
// never checks a code itself.
//
//   deviceTotpVerify      TOTP_VERIFY over a fresh nonce; the verdict counts only if it verifies
//                         under the CERTIFIED device key, over that nonce, for the expected purpose.
//   deviceSignAttested    SIGN_ATTESTED: in the same request as a fresh code, the device signs a
//                         32-byte digest under its own tag (the human-presence proxy for approving
//                         a document, e.g. an admin policy). verifyAttestedRecord checks one.
//
// The step a device accepts is consumed for every TOTP use on that device (latch clear included),
// failures count toward the same failure limit and backoff as a latch clear, and both commands
// are refused while the device latch is set.
import { createHash, createPublicKey, randomBytes, verify as edVerify } from "node:crypto";
import { noteActivation, SESSION_START_PURPOSE } from "./activation.js";
import type { LatchFrameDevice } from "./device-latch.js";
import { rawEd25519ToPem } from "./enclaweder-hid.js";

export const TOTP_OP = { LATCH_GET: 0x1c, TOTP_VERIFY: 0x2d, SIGN_ATTESTED: 0x2e } as const;
export const TAG_TOTP_VERDICT = Buffer.from("enclaweder.totp-verdict.v1", "latin1");
export const TAG_ATTESTED_SIGN = Buffer.from("enclaweder.attested-sign.v1", "latin1");
const TAG_LATCH_GET = Buffer.from("ECW-LATCH-GET-01", "latin1");
const ST = {
  OK: 0,
  BAD_ARG: 1,
  BAD_STATE: 2,
  NOT_ENROLLED: 3,
  AUTH: 5,
  BUSY: 7,
  UNSUPPORTED: 8,
  LOCKED: 9,
  // Command set 0.6 (firmware 0.3.4): the code was refused because the host time disagreed with the
  // device's own tick. Same signed fail verdict as ERR_AUTH, counted the same on the device.
  TIME: 10,
} as const;
const FA_TOTP = 2;

export { CLOCK_DISAGREES_TEXT } from "./clock-disagrees-text.js";

/**
 * Purpose bytes the device binds into what it signs. 0x01..0x7F are verdict
 * purposes (TOTP_VERIFY), 0x80..0xFF attested-sign purposes (SIGN_ATTESTED); the device refuses
 * a purpose outside its command's range, so a verdict can never stand in for an attested signature.
 */
export const TOTP_PURPOSE = Object.freeze({
  "session-start": 0x01,
  "policy-change": 0x02,
  recovery: 0x03,
  "disable-protection": 0x04,
  "history-restore": 0x05,
  admin: 0x06,
  "auth-change": 0x07,
  "auth-test": 0x08,
  unlock: 0x09,
} as const);
export type TotpPurpose = keyof typeof TOTP_PURPOSE;

/** The byte for a purpose name, own properties only ("constructor" is not a purpose). */
function purposeByte(table: Readonly<Record<string, number>>, name: string): number | undefined {
  return Object.hasOwn(table, name) ? table[name] : undefined;
}
export const ATTESTED_PURPOSE = Object.freeze({ "admin-policy": 0x81 } as const);
export type AttestedPurpose = keyof typeof ATTESTED_PURPOSE;

/** How far the device's accepted step may sit from this host's clock (seconds). */
export const STEP_SKEW_S = 300;

export type DeviceTotpFailure =
  | "malformed-code"
  | "malformed-nonce"
  | "unknown-purpose"
  | "unsupported" // firmware without TOTP_VERIFY
  | "not-enrolled"
  | "locked" // device latch set, or the shared failure limit reached
  | "backoff"
  | "rejected" // the device evaluated the code: wrong or reused
  | "clock-disagrees" // the device evaluated the attempt: this host's time disagrees with its tick
  | "bad-signature"
  | "bad-verdict"
  | "stale-step"
  | "no-response"
  | "device-error";

/** The slice of a bound, certified device this needs. */
export type DeviceTotpAccess = {
  /** The device's identity key, as certified (birth certificate chained to a pinned root). */
  pubkeyRaw: Buffer;
  uid: Buffer;
  run<T>(fn: (dev: LatchFrameDevice) => Promise<T>): Promise<T>;
  /**
   * A device's LATCH_GET answer over a nonce of the caller's, when the device is reached through
   * another process (the broker's attestation round): `payload` is the device's raw answer and
   * `signedOver` what it signed it over, which the implementation has checked binds `nonce32`
   * (attestDigest of a batch containing it). Absent: LATCH_GET goes to the device through run().
   */
  latch?(nonce32: Buffer): Promise<{ signedOver: Buffer; payload: Buffer }>;
};

export interface VerdictBody {
  ver: number;
  purpose: number;
  pass: boolean;
  rfails: number;
  step: number;
  counter: bigint;
  waitMs: number;
  uid: Buffer;
}

export function parseVerdictBody(body: Buffer): VerdictBody {
  if (body.length !== 32) {
    throw new Error("verdict body must be 32 bytes");
  }
  return {
    ver: body[0],
    purpose: body[1],
    pass: body[2] === 1,
    rfails: body[3],
    step: body.readUInt32LE(4),
    counter: body.readBigUInt64LE(8),
    waitMs: body.readUInt32LE(16),
    uid: Buffer.from(body.subarray(20, 32)),
  };
}

function edOk(pubRaw: Buffer, msg: Buffer, sig: Buffer): boolean {
  try {
    return sig.length === 64 && edVerify(null, msg, createPublicKey(rawEd25519ToPem(pubRaw)), sig);
  } catch {
    return false;
  }
}

/** The exact message TOTP_VERIFY (and every failed SIGN_ATTESTED) signs. */
export function verdictMessage(nonce: Buffer, body: Buffer): Buffer {
  return Buffer.concat([TAG_TOTP_VERDICT, nonce, body]);
}
/** The exact message a passing SIGN_ATTESTED signs. */
export function attestedMessage(
  nonce: Buffer,
  body: Buffer,
  digest: Buffer,
  summary: Buffer,
): Buffer {
  return Buffer.concat([TAG_ATTESTED_SIGN, nonce, body, digest, summary]);
}

export function verifyVerdictSignature(
  pubRaw: Buffer,
  nonce: Buffer,
  body: Buffer,
  sig: Buffer,
): boolean {
  return (
    nonce.length === 32 && body.length === 32 && edOk(pubRaw, verdictMessage(nonce, body), sig)
  );
}
export function verifyAttestedSignature(
  pubRaw: Buffer,
  nonce: Buffer,
  body: Buffer,
  digest: Buffer,
  summary: Buffer,
  sig: Buffer,
): boolean {
  return (
    nonce.length === 32 &&
    body.length === 32 &&
    digest.length === 32 &&
    summary.length === 32 &&
    edOk(pubRaw, attestedMessage(nonce, body, digest, summary), sig)
  );
}

/** SHA3-256 of the human-readable summary the person was shown. */
export function summaryHash(text: string): Buffer {
  return createHash("sha3-256").update(Buffer.from(text, "utf8")).digest();
}

function statusFailure(status: number): DeviceTotpFailure {
  switch (status) {
    case ST.UNSUPPORTED:
      return "unsupported";
    case ST.NOT_ENROLLED:
      return "not-enrolled";
    case ST.LOCKED:
      return "locked";
    case ST.BUSY:
      return "backoff";
    case ST.BAD_ARG:
      return "unknown-purpose";
    default:
      return "device-error";
  }
}

function request(
  code: string,
  nowS: number,
  purpose: number,
  nonce: Buffer,
  extra: Buffer[] = [],
): Buffer {
  const t = Buffer.alloc(8);
  t.writeBigUInt64LE(BigInt(nowS));
  const c = Buffer.alloc(4);
  c.writeUInt32LE(Number(code));
  return Buffer.concat([nonce, c, t, Buffer.from([purpose]), ...extra]);
}

type Evaluated =
  | { ok: true; body: VerdictBody; rawBody: Buffer; sig: Buffer }
  | {
      ok: false;
      code: DeviceTotpFailure;
      waitMs?: number;
      /** On "rejected" / "clock-disagrees" only: the device's signed refusal, checked like a pass. */
      signed?: { rawBody: Buffer; sig: Buffer };
    };

/**
 * Checks one evaluated answer: signature over OUR nonce under the certified key, the expected
 * purpose and uid, and (on a pass) a step near this host's clock. Exported for the tests.
 */
export function checkVerdictAnswer(
  p: Buffer,
  opts: {
    nonce: Buffer;
    pubkeyRaw: Buffer;
    uid: Buffer;
    purpose: number;
    nowS: number;
    attested?: { digest: Buffer; summary: Buffer };
  },
): Evaluated {
  if (p.length === 0) {
    return { ok: false, code: "no-response" };
  }
  // Any status other than these three is a refusal (an unknown one included: "device-error").
  if (p[0] !== ST.OK && p[0] !== ST.AUTH && p[0] !== ST.TIME) {
    return {
      ok: false,
      code: statusFailure(p[0]),
      ...(p.length === 5 ? { waitMs: p.readUInt32LE(1) } : {}),
    };
  }
  if (p.length !== 97) {
    return { ok: false, code: "bad-verdict" };
  }
  const rawBody = Buffer.from(p.subarray(1, 33));
  const sig = Buffer.from(p.subarray(33, 97));
  const passSigned =
    p[0] === ST.OK && opts.attested
      ? verifyAttestedSignature(
          opts.pubkeyRaw,
          opts.nonce,
          rawBody,
          opts.attested.digest,
          opts.attested.summary,
          sig,
        )
      : verifyVerdictSignature(opts.pubkeyRaw, opts.nonce, rawBody, sig);
  if (!passSigned) {
    return { ok: false, code: "bad-signature" };
  }
  const body = parseVerdictBody(rawBody);
  if (body.ver !== 1 || body.purpose !== opts.purpose || !body.uid.equals(opts.uid)) {
    return { ok: false, code: "bad-verdict" };
  }
  if (p[0] !== ST.OK || !body.pass) {
    // A signed failure: the device evaluated the attempt and refused it (counted on the device).
    // The status byte is not signed: it only chooses the message, the verdict is the signed fail.
    return {
      ok: false,
      code: p[0] === ST.TIME ? "clock-disagrees" : "rejected",
      waitMs: body.waitMs,
      signed: { rawBody, sig },
    };
  }
  if (Math.abs(body.step * 30 - opts.nowS) > STEP_SKEW_S) {
    return { ok: false, code: "stale-step" };
  }
  return { ok: true, body, rawBody, sig };
}

/** True when the device reports (signed, over a fresh nonce) a valid TOTP factor and a clear latch. */
export async function deviceTotpEnrolled(access: DeviceTotpAccess): Promise<boolean> {
  const nonce = randomBytes(32);
  let signedOver: Buffer = nonce;
  let p: Buffer | undefined;
  if (access.latch) {
    const r = await access.latch(nonce);
    signedOver = r.signedOver;
    p = r.payload;
  } else {
    p = (await access.run((dev) => dev.request(TOTP_OP.LATCH_GET, 1, nonce, 2000)))?.payload;
  }
  if (!p || p.length !== 129 || p[0] !== ST.OK || signedOver.length !== 32) {
    return false;
  }
  const body = p.subarray(1, 65);
  if (
    !edOk(access.pubkeyRaw, Buffer.concat([TAG_LATCH_GET, signedOver, body]), p.subarray(65, 129))
  ) {
    return false;
  }
  if (!body.subarray(52, 64).equals(access.uid)) {
    return false;
  }
  // state clear, factors valid (flags 0x02), factor A = TOTP (byte 48)
  return body[1] === 0 && (body[4] & 0x02) !== 0 && body[48] === FA_TOTP;
}

/** TOTP_VERIFY over `nonce`, checked; the shared core of deviceTotpVerify and deviceTotpVerdict. */
async function verdictExchange(
  access: DeviceTotpAccess,
  p: { code: string; purpose: string; nonce: Buffer; nowS?: number },
): Promise<
  | (Evaluated & { ok: true; purposeByte: number })
  | (Evaluated & { ok: false; purposeByte?: number })
> {
  if (typeof p.code !== "string" || !/^\d{6}$/.test(p.code)) {
    return { ok: false, code: "malformed-code" };
  }
  const purpose = purposeByte(TOTP_PURPOSE, p.purpose);
  if (purpose === undefined) {
    return { ok: false, code: "unknown-purpose" };
  }
  const nowS = p.nowS ?? Math.floor(Date.now() / 1000);
  const f = await access.run((dev) =>
    dev.request(TOTP_OP.TOTP_VERIFY, 1, request(p.code, nowS, purpose, p.nonce), 5000),
  );
  const r = checkVerdictAnswer(f?.payload ?? Buffer.alloc(0), {
    nonce: p.nonce,
    pubkeyRaw: access.pubkeyRaw,
    uid: access.uid,
    purpose,
    nowS,
  });
  if (r.ok && purpose === SESSION_START_PURPOSE) {
    // Command set 0.5: a verified session-start code activates the launch (activation.ts).
    noteActivation(access.pubkeyRaw.toString("hex"), p.nonce, {
      kind: "totp",
      step: r.body.step,
      counter: r.body.counter,
    });
  }
  return { ...r, purposeByte: purpose };
}

/** TOTP_VERIFY: the device's verdict on a typed 6-digit code, verified here. */
export async function deviceTotpVerify(
  access: DeviceTotpAccess,
  p: { code: string; purpose: string; nowS?: number },
): Promise<
  | { ok: true; step: number; counter: bigint }
  | { ok: false; code: DeviceTotpFailure; waitMs?: number }
> {
  const r = await verdictExchange(access, { ...p, nonce: randomBytes(32) });
  if (r.ok) {
    return { ok: true, step: r.body.step, counter: r.body.counter };
  }
  return { ok: false, code: r.code, ...(r.waitMs === undefined ? {} : { waitMs: r.waitMs }) };
}

/**
 * A device-signed TOTP verdict, everything an offline verifier needs, hex-encoded. `body` is the
 * 32-byte verdict body (parseVerdictBody) and `sig` the device's signature over
 * verdictMessage(nonce, body), under the device key `pubkey`.
 */
export type VerdictRecord = {
  v: 1;
  purpose: number;
  uid: string;
  pubkey: string;
  nonce: string;
  body: string;
  sig: string;
};

export type DeviceTotpVerdict =
  | { ok: true; record: VerdictRecord; step: number; stepTimeS: number; counter: bigint }
  | {
      ok: false;
      code: DeviceTotpFailure;
      waitMs?: number;
      /** Present when the device evaluated the code and signed its refusal ("rejected", "clock-disagrees"). */
      record?: VerdictRecord;
    };

/**
 * TOTP_VERIFY over a nonce the CALLER chose (32 bytes), so the signed verdict can bind the
 * caller's own data (for example the hash of a grant it is about to store). Returns the checked,
 * device-signed record. A "no" from the device, or an answer that does not verify, is a result,
 * never an exception; only a failure to reach the device throws.
 */
export async function deviceTotpVerdict(
  access: DeviceTotpAccess,
  p: { code: string; purpose: string; nonce: Uint8Array; nowS?: number },
): Promise<DeviceTotpVerdict> {
  if (!(p.nonce instanceof Uint8Array) || p.nonce.length !== 32) {
    return { ok: false, code: "malformed-nonce" };
  }
  const nonce = Buffer.from(p.nonce); // our own copy: what was sent is what is checked
  const r = await verdictExchange(access, { ...p, nonce });
  const record = (rawBody: Buffer, sig: Buffer, purpose: number): VerdictRecord => ({
    v: 1,
    purpose,
    uid: access.uid.toString("hex"),
    pubkey: access.pubkeyRaw.toString("hex"),
    nonce: nonce.toString("hex"),
    body: rawBody.toString("hex"),
    sig: sig.toString("hex"),
  });
  if (r.ok) {
    return {
      ok: true,
      record: record(r.rawBody, r.sig, r.purposeByte),
      step: r.body.step,
      stepTimeS: r.body.step * 30,
      counter: r.body.counter,
    };
  }
  return {
    ok: false,
    code: r.code,
    ...(r.waitMs === undefined ? {} : { waitMs: r.waitMs }),
    ...(r.signed && r.purposeByte !== undefined
      ? { record: record(r.signed.rawBody, r.signed.sig, r.purposeByte) }
      : {}),
  };
}

const hexField = (v: unknown, n: number): Buffer | null =>
  typeof v === "string" && v.length === n * 2 && /^[0-9a-f]+$/.test(v)
    ? Buffer.from(v, "hex")
    : null;

/**
 * Offline check of a stored verdict record: signed by the expected device key, over the expected
 * nonce, a PASS for the expected purpose. The caller decides which device key counts (and must
 * have established that it is certified). Freshness is the caller's: `stepTimeS` is the time of
 * the code the device accepted (step * 30), by the authenticator's clock.
 */
export function verifyVerdictRecord(
  rec: unknown,
  expect: { purpose: TotpPurpose; nonce: Uint8Array; pubkeyRaw: Buffer; uid: Buffer },
): { ok: true; stepTimeS: number; counter: bigint } | { ok: false; reason: string } {
  const r = rec as Partial<VerdictRecord> | null;
  if (!r || typeof r !== "object" || r.v !== 1) {
    return { ok: false, reason: "not a verdict record" };
  }
  const nonce = hexField(r.nonce, 32);
  const body = hexField(r.body, 32);
  const sig = hexField(r.sig, 64);
  const pub = hexField(r.pubkey, 32);
  const uid = hexField(r.uid, 12);
  if (!nonce || !body || !sig || !pub || !uid) {
    return { ok: false, reason: "malformed verdict record" };
  }
  const purpose = purposeByte(TOTP_PURPOSE, expect.purpose);
  if (purpose === undefined) {
    return { ok: false, reason: "unknown purpose" };
  }
  if (!pub.equals(expect.pubkeyRaw) || !uid.equals(expect.uid)) {
    return { ok: false, reason: "signed by a different device" };
  }
  if (!(expect.nonce instanceof Uint8Array) || !nonce.equals(Buffer.from(expect.nonce))) {
    return { ok: false, reason: "made for another request" };
  }
  if (!verifyVerdictSignature(pub, nonce, body, sig)) {
    return { ok: false, reason: "device signature does not verify" };
  }
  const b = parseVerdictBody(body);
  if (
    b.ver !== 1 ||
    !b.pass ||
    b.purpose !== purpose ||
    r.purpose !== purpose ||
    !b.uid.equals(uid)
  ) {
    return { ok: false, reason: "verdict does not approve this purpose" };
  }
  return { ok: true, stepTimeS: b.step * 30, counter: b.counter };
}

/** What a passing SIGN_ATTESTED produced: everything a verifier needs, hex-encoded. */
export type AttestedRecord = {
  v: 1;
  purpose: number;
  uid: string;
  pubkey: string;
  nonce: string;
  body: string;
  digest: string;
  summary: string;
  sig: string;
};

/** SIGN_ATTESTED: the device signs `digest` in the same request as a fresh, device-verified code. */
export async function deviceSignAttested(
  access: DeviceTotpAccess,
  p: { code: string; purpose: AttestedPurpose; digest: Buffer; summaryText: string; nowS?: number },
): Promise<
  { ok: true; record: AttestedRecord } | { ok: false; code: DeviceTotpFailure; waitMs?: number }
> {
  if (!/^\d{6}$/.test(p.code)) {
    return { ok: false, code: "malformed-code" };
  }
  const purpose = purposeByte(ATTESTED_PURPOSE, p.purpose);
  if (purpose === undefined || p.digest.length !== 32) {
    return { ok: false, code: "unknown-purpose" };
  }
  const nowS = p.nowS ?? Math.floor(Date.now() / 1000);
  const nonce = randomBytes(32);
  const summary = summaryHash(p.summaryText);
  const f = await access.run((dev) =>
    dev.request(
      TOTP_OP.SIGN_ATTESTED,
      1,
      request(p.code, nowS, purpose, nonce, [p.digest, summary]),
      5000,
    ),
  );
  const r = checkVerdictAnswer(f?.payload ?? Buffer.alloc(0), {
    nonce,
    pubkeyRaw: access.pubkeyRaw,
    uid: access.uid,
    purpose,
    nowS,
    attested: { digest: p.digest, summary },
  });
  if (!r.ok) {
    return r;
  }
  return {
    ok: true,
    record: {
      v: 1,
      purpose,
      uid: access.uid.toString("hex"),
      pubkey: access.pubkeyRaw.toString("hex"),
      nonce: nonce.toString("hex"),
      body: r.rawBody.toString("hex"),
      digest: p.digest.toString("hex"),
      summary: summary.toString("hex"),
      sig: r.sig.toString("hex"),
    },
  };
}

/**
 * Offline check of a stored attested record. The caller decides WHICH device keys may approve
 * (and must have established that they are certified); this checks the signature, the binding to
 * the expected purpose, digest and summary, and returns the device-attested time (step * 30).
 */
export function verifyAttestedRecord(
  rec: unknown,
  expect: {
    purpose: AttestedPurpose;
    digest: Buffer;
    summaryText: string;
    pubkeyRaw: Buffer;
    uid: Buffer;
  },
): { ok: true; stepTimeS: number; counter: bigint } | { ok: false; reason: string } {
  const r = rec as Partial<AttestedRecord> | null;
  const hex = hexField;
  if (!r || r.v !== 1) {
    return { ok: false, reason: "not an attested record" };
  }
  const nonce = hex(r.nonce, 32);
  const body = hex(r.body, 32);
  const digest = hex(r.digest, 32);
  const summary = hex(r.summary, 32);
  const sig = hex(r.sig, 64);
  const pub = hex(r.pubkey, 32);
  const uid = hex(r.uid, 12);
  if (!nonce || !body || !digest || !summary || !sig || !pub || !uid) {
    return { ok: false, reason: "malformed attested record" };
  }
  const purpose = purposeByte(ATTESTED_PURPOSE, expect.purpose);
  if (purpose === undefined) {
    return { ok: false, reason: "unknown purpose" };
  }
  if (!pub.equals(expect.pubkeyRaw) || !uid.equals(expect.uid)) {
    return { ok: false, reason: "signed by a different device" };
  }
  if (!digest.equals(expect.digest)) {
    return { ok: false, reason: "digest does not match the document" };
  }
  if (!summary.equals(summaryHash(expect.summaryText))) {
    return { ok: false, reason: "summary does not match the document" };
  }
  if (!verifyAttestedSignature(pub, nonce, body, digest, summary, sig)) {
    return { ok: false, reason: "device signature does not verify" };
  }
  const b = parseVerdictBody(body);
  if (
    b.ver !== 1 ||
    !b.pass ||
    b.purpose !== purpose ||
    r.purpose !== purpose ||
    !b.uid.equals(uid)
  ) {
    return { ok: false, reason: "verdict does not approve this purpose" };
  }
  return { ok: true, stepTimeS: b.step * 30, counter: b.counter };
}

/**
 * The device-verified second factor for auth/device-factor.ts. `access` is resolved at every
 * call, so a device that went DIRTY or away in between is never used.
 */
export function createDeviceTotpSecondFactor(access: () => DeviceTotpAccess | null): {
  enrolled(): Promise<boolean>;
  verify(p: { code: string; purpose: string }): Promise<{ ok: true } | { ok: false; code: string }>;
} | null {
  if (!access()) {
    return null;
  }
  return {
    enrolled: async () => {
      const a = access();
      if (!a) {
        return false;
      }
      try {
        return await deviceTotpEnrolled(a);
      } catch {
        return false;
      }
    },
    verify: async (p) => {
      const a = access();
      if (!a) {
        return { ok: false, code: "no-device" };
      }
      try {
        const r = await deviceTotpVerify(a, p);
        return r.ok ? { ok: true } : { ok: false, code: r.code };
      } catch {
        return { ok: false, code: "device-error" };
      }
    },
  };
}
