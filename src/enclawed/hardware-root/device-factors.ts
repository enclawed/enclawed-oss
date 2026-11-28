// Host interface to the Enclaweder's factor-authorised operations (command set 0.4):
//
//   takeoverByFactors   the person takes the live host or audit session over with both of their
//                       device-verified factors (authenticator + recovery code), ending a squatter's
//                       session; the device's signed open is checked against its CERTIFIED key.
//   grantUnlock         a device-verified authenticator code buys an unlock grant of N uses inside a
//   spendUnlock         lease; each use is counted by the device and returns a receipt it signed over
//   readUnlock          this host's fresh nonce. verifyUnlockReceipt checks one offline.
//   revokeUnlock
//   readIdentityLog     the device's signed identity-event history (key creation, failures to load
//                       the identity, zeroizations), with its boot counter.
//   openSeal / seal*    the CLIENT encrypts and authenticates an authenticator or recovery code to the
//                       device itself, so a process relaying the bytes (the broker) can neither read
//                       nor alter it.
//   readDeviceEntropy   optional extra entropy from the hardware root, to be mixed in, never used alone.
//
// Nothing secret is logged or kept: codes are wiped after use; seal keys live for one request.
import {
  createHash,
  createHmac,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
  verify as edVerify,
} from "node:crypto";
import { noteActivation } from "./activation.js";
import { CLOCK_DISAGREES_TEXT } from "./clock-disagrees-text.js";
import type { LatchFrameDevice, SecondFactor } from "./device-latch.js";
import { rawEd25519ToPem } from "./enclaweder-hid.js";
import {
  checkVerdictAnswer,
  TOTP_PURPOSE,
  type DeviceTotpFailure,
  type VerdictBody,
} from "./totp-verify.js";

export const CS04 = {
  STREAM_ENTROPY: 0x09,
  FIDO_CHALLENGE: 0x27,
  TOTP_VERIFY: 0x2d,
  FACTOR_TAKEOVER: 0x2f,
  UNLOCK_GRANT: 0x30,
  UNLOCK_USE: 0x31,
  UNLOCK_GET: 0x32,
  UNLOCK_REVOKE: 0x33,
  IDLOG_GET: 0x34,
  SEAL_OPEN: 0x35,
  SEALED: 0x36,
} as const;
const ST = {
  OK: 0,
  BAD_ARG: 1,
  BAD_STATE: 2,
  NOT_ENROLLED: 3,
  AUTH: 5,
  ZEROIZED: 6,
  BUSY: 7,
  UNSUPPORTED: 8,
  LOCKED: 9,
  TIME: 10, // command set 0.6: a TOTP factor refused because the host time disagreed with the device
} as const;
const T = (s: string) => Buffer.from(s, "latin1");
const X25519_SPKI = Buffer.from("302a300506032b656e032100", "hex");

export type FactorFailure =
  | "unsupported" // firmware before command set 0.4
  | "malformed"
  | "no-session" // takeover: nothing to take over on that channel
  | "not-enrolled"
  | "locked" // latch set, or the two-factor / TOTP path locked out (operators only)
  | "backoff"
  | "rejected" // the device evaluated the factors and refused them
  | "clock-disagrees" // TOTP: this host's time disagrees with the device's tick (counted, as rejected)
  | "no-grant" // unlock: none live (exhausted, expired, revoked, ended by a reset)
  | "mismatch" // unlock: wrong grant id, scope or host time (nothing spent)
  | "zeroized"
  | "bad-signature"
  | "bad-record"
  | "seal-refused" // the sealed request's tag did not verify, or its seal is gone (spent, expired)
  // A relayed (sealed) unlock use answered with a lone ERR_AUTH: the device refused the use (another
  // grant id, scope or host time: another job, project, launch kind, ticket or credential; no use
  // spent) or the seal itself. The two answers are the same byte, so neither is claimed alone.
  | "use-refused"
  | "sealed-required" // root required: a request that must cross the owner sealed was refused sealed
  | "no-response"
  | "device-error";

function failureOf(status: number): FactorFailure {
  switch (status) {
    case ST.UNSUPPORTED:
      return "unsupported";
    case ST.BAD_ARG:
      return "malformed";
    case ST.NOT_ENROLLED:
      return "not-enrolled";
    case ST.LOCKED:
      return "locked";
    case ST.BUSY:
      return "backoff";
    case ST.AUTH:
      return "rejected";
    case ST.TIME:
      return "clock-disagrees";
    case ST.ZEROIZED:
      return "zeroized";
    default:
      return "device-error";
  }
}
const waitOf = (p: Buffer) =>
  (p[0] === ST.BUSY || p[0] === ST.AUTH || p[0] === ST.TIME) && p.length >= 5
    ? p.readUInt32LE(1)
    : undefined;
const le16 = (v: number) => {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(v);
  return b;
};
const le32 = (v: number) => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(v >>> 0);
  return b;
};
const le64 = (v: bigint | number) => {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(BigInt(v));
  return b;
};
function verifyBy(pub: Buffer, msg: Buffer, sig: Buffer): boolean {
  try {
    return edVerify(null, msg, createPublicKey(rawEd25519ToPem(pub)), sig);
  } catch {
    return false;
  }
}
async function call(
  dev: LatchFrameDevice,
  type: number,
  payload: Buffer,
  timeoutMs = 5000,
): Promise<Buffer> {
  const f = await dev.request(type, 1, payload, timeoutMs);
  return f?.payload ?? Buffer.alloc(0);
}
/** Seconds since the epoch, this host's clock. */
const nowS = () => Math.floor(Date.now() / 1000);

// ---- the sealed factor channel ----------------------------------------------------------------

/**
 * Forwards one SEAL_OPEN (0x35) or SEALED (0x36) request to the device and returns the device's
 * raw response payload. The broker implements it for its clients; it only moves bytes.
 */
export type SealRelay = (type: 0x35 | 0x36, payload: Buffer) => Promise<Buffer>;

/** How a factor-carrying request reaches the device: directly, or sealed through a relay. */
export type FactorTransport =
  | { kind: "direct"; dev: LatchFrameDevice }
  | { kind: "sealed"; relay: SealRelay };

/** One open seal: both keys exist only in this object and are wiped after its single use. */
export type OpenSeal = { id: bigint; uid: Buffer; kEnc: Buffer; kMac: Buffer };

/** Opens a seal: a fresh X25519 exchange with the device, verified against its certified key. */
export async function openSeal(
  relay: SealRelay,
  devicePubRaw: Buffer,
  uid: Buffer,
): Promise<OpenSeal> {
  const eph = generateKeyPairSync("x25519");
  const pub = Buffer.from(eph.publicKey.export({ format: "der", type: "spki" }).subarray(12));
  const cn = randomBytes(16);
  const p = await relay(CS04.SEAL_OPEN, Buffer.concat([pub, cn]));
  if (p.length === 0) {
    throw new FactorError("SEAL_OPEN", "no-response");
  }
  if (p[0] !== ST.OK) {
    throw new FactorError("SEAL_OPEN", failureOf(p[0]));
  }
  if (p.length !== 133) {
    throw new FactorError("SEAL_OPEN", "bad-record");
  }
  const id = p.readBigUInt64LE(1);
  const dp = Buffer.from(p.subarray(9, 41));
  const dn = p.subarray(41, 57);
  if (
    !p.subarray(57, 69).equals(uid) ||
    !verifyBy(
      devicePubRaw,
      Buffer.concat([T("ECW-SEAL-OPEN-01"), uid, le64(id), pub, dp, cn, dn]),
      p.subarray(69, 133),
    )
  ) {
    throw new FactorError("SEAL_OPEN", "bad-signature");
  }
  let shared: Buffer;
  try {
    shared = diffieHellman({
      privateKey: eph.privateKey,
      publicKey: createPublicKey({
        key: Buffer.concat([X25519_SPKI, dp]),
        format: "der",
        type: "spki",
      }),
    });
  } catch {
    throw new FactorError("SEAL_OPEN", "bad-record");
  }
  const salt = Buffer.concat([cn, dn]);
  const tail = Buffer.concat([uid, le64(id), pub, dp]);
  const kEnc = Buffer.from(
    hkdfSync("sha3-256", shared, salt, Buffer.concat([T("ECW-SEAL-KENC-01"), tail]), 32),
  );
  const kMac = Buffer.from(
    hkdfSync("sha3-256", shared, salt, Buffer.concat([T("ECW-SEAL-KMAC-01"), tail]), 32),
  );
  shared.fill(0);
  return { id, uid: Buffer.from(uid), kEnc, kMac };
}

/** The sealed frame for `op` carrying `inner` (that operation's plaintext request). Wipes the seal's keys. */
export function sealFrame(s: OpenSeal, op: number, inner: Buffer): Buffer {
  if (inner.length > 320) {
    throw new Error("a sealed request carries at most 320 bytes");
  }
  const ct = Buffer.from(inner);
  for (let off = 0, i = 0; off < ct.length; off += 32, i++) {
    const ks = createHmac("sha3-256", s.kEnc)
      .update(Buffer.concat([T("ECW-SEAL-KSTR-01"), Buffer.from([i])]))
      .digest();
    for (let j = 0; j < 32 && off + j < ct.length; j++) {
      ct[off + j] ^= ks[j];
    }
  }
  const tag = createHmac("sha3-256", s.kMac)
    .update(
      Buffer.concat([
        T("ECW-SEAL-MACT-01"),
        s.uid,
        le64(s.id),
        Buffer.from([op]),
        le16(ct.length),
        ct,
      ]),
    )
    .digest();
  s.kEnc.fill(0);
  s.kMac.fill(0);
  return Buffer.concat([le64(s.id), Buffer.from([op]), le16(ct.length), ct, tag]);
}

/** Send one factor-carrying request (`inner` is wiped afterwards) and return the device's answer. */
async function factorRequest(
  t: FactorTransport,
  devicePubRaw: Buffer,
  uid: Buffer,
  op: number,
  inner: Buffer,
  timeoutMs = 15_000,
): Promise<Buffer> {
  try {
    if (t.kind === "direct") {
      return await call(t.dev, op, inner, timeoutMs);
    }
    const s = await openSeal(t.relay, devicePubRaw, uid);
    const p = await t.relay(CS04.SEALED, sealFrame(s, op, inner));
    // The seal is spent whatever the answer; a tag refusal is the single-byte ERR_AUTH.
    if (p.length === 1 && p[0] === ST.AUTH) {
      throw new FactorError("SEALED", "seal-refused");
    }
    return p;
  } finally {
    inner.fill(0);
  }
}

/** What a person reads for each refusal; the device operation stays on the error's `op` field. */
const FACTOR_ERROR_TEXT: Record<FactorFailure, string> = {
  unsupported: "the device's firmware is too old for this: update the Enclaweder firmware",
  malformed: "the request was malformed",
  "no-session": "there is no session to take over: open one normally",
  "not-enrolled": "the authenticator or recovery codes are not set up on the device",
  locked:
    "the device is locked: its halt state is set, or recovery is locked after repeated failures",
  backoff: "too many recent attempts",
  rejected: "the device refused the code",
  "clock-disagrees": CLOCK_DISAGREES_TEXT,
  "no-grant": "there is no live unlock grant",
  mismatch: "the unlock does not match the live grant",
  zeroized: "the device was zeroized and must be recovered first",
  "bad-signature": "the device's answer did not verify under its certified key",
  "bad-record": "the device's answer was malformed",
  "seal-refused": "the device refused the sealed request (altered, replayed or expired)",
  "use-refused":
    "the device refused this unlock use: it does not match the live unlock (another job, project, " +
    "launch kind, ticket or credential), or its sealed request did not verify; no use was spent",
  "sealed-required":
    "the device (or the hardware root's owner relaying for it) refused this request sealed, and with " +
    "the hardware root required it is never relayed in the clear: update the Enclaweder firmware to " +
    "command set 0.5 (firmware 0.3.3)",
  "no-response": "the device did not answer",
  "device-error": "the device could not complete the request",
};

export class FactorError extends Error {
  /** The device operation that failed (developer detail; not part of the message). */
  readonly op: string;
  readonly code: FactorFailure;
  readonly waitMs: number | null;
  constructor(op: string, code: FactorFailure, waitMs: number | null = null) {
    super(
      `${FACTOR_ERROR_TEXT[code]}${waitMs ? `; try again in ${Math.ceil(waitMs / 1000)} s` : ""}`,
    );
    this.name = "FactorError";
    this.op = op;
    this.code = code;
    this.waitMs = waitMs;
  }
}

/** An authenticator-code verdict sealed to the device through a relay, checked as deviceTotpVerify does. */
export async function sealedTotpVerdict(
  relay: SealRelay,
  devicePubRaw: Buffer,
  uid: Buffer,
  p: { code: string; purpose: string; nonce?: Buffer; nowS?: number },
): Promise<
  | { ok: true; body: VerdictBody; rawBody: Buffer; sig: Buffer; nonce: Buffer }
  | { ok: false; code: DeviceTotpFailure | FactorFailure; waitMs?: number }
> {
  if (typeof p.code !== "string" || !/^\d{6}$/.test(p.code)) {
    return { ok: false, code: "malformed-code" };
  }
  const purpose = Object.hasOwn(TOTP_PURPOSE, p.purpose)
    ? TOTP_PURPOSE[p.purpose as keyof typeof TOTP_PURPOSE]
    : undefined;
  if (purpose === undefined) {
    return { ok: false, code: "unknown-purpose" };
  }
  const nonce = p.nonce ?? randomBytes(32);
  const t = p.nowS ?? nowS();
  let ans: Buffer;
  try {
    ans = await factorRequest(
      { kind: "sealed", relay },
      devicePubRaw,
      uid,
      CS04.TOTP_VERIFY,
      Buffer.concat([nonce, le32(Number(p.code)), le64(t), Buffer.from([purpose])]),
    );
  } catch (err) {
    if (err instanceof FactorError) {
      return { ok: false, code: err.code };
    }
    throw err;
  }
  const r = checkVerdictAnswer(ans, { nonce, pubkeyRaw: devicePubRaw, uid, purpose, nowS: t });
  if (r.ok) {
    return { ok: true, body: r.body, rawBody: r.rawBody, sig: r.sig, nonce };
  }
  return { ok: false, code: r.code, ...(r.waitMs === undefined ? {} : { waitMs: r.waitMs }) };
}

// ---- FACTOR_TAKEOVER --------------------------------------------------------------------------

export type TakeoverChannel = "latch" | "anchor";

/** A session obtained by a takeover: its id, and keepalive / close under its key. */
export class TakenSession {
  readonly channel: TakeoverChannel;
  readonly sid: bigint;
  /** The audit counter at the open (anchor channel); 0n for the latch channel. */
  readonly counter: bigint;
  readonly uid: Buffer;
  readonly #dev: LatchFrameDevice | null;
  readonly #key: Buffer;
  #ctr = 0n;
  constructor(
    channel: TakeoverChannel,
    sid: bigint,
    counter: bigint,
    uid: Buffer,
    key: Buffer,
    dev: LatchFrameDevice | null,
  ) {
    this.channel = channel;
    this.sid = sid;
    this.counter = counter;
    this.uid = uid;
    this.#key = key;
    this.#dev = dev;
  }
  /** The next authenticated request body `sid | ctr | HMAC(K, tag | uid | sid | ctr)`. */
  authed(kind: "keepalive" | "close"): Buffer {
    const tag =
      this.channel === "latch"
        ? kind === "keepalive"
          ? "ECW-LATCH-KAL-01"
          : "ECW-LATCH-CLS-01"
        : kind === "keepalive"
          ? "ECW-ANCHOR-KAL-1"
          : "ECW-ANCHOR-CLS-1";
    this.#ctr += 1n;
    const mac = createHmac("sha3-256", this.#key)
      .update(Buffer.concat([T(tag), this.uid, le64(this.sid), le64(this.#ctr)]))
      .digest();
    return Buffer.concat([le64(this.sid), le64(this.#ctr), mac]);
  }
  async keepalive(): Promise<void> {
    await this.#send(this.channel === "latch" ? 0x1f : 0x1b, "keepalive");
  }
  async close(): Promise<void> {
    await this.#send(this.channel === "latch" ? 0x20 : 0x1a, "close");
    this.#key.fill(0);
  }
  async #send(type: number, kind: "keepalive" | "close"): Promise<void> {
    if (!this.#dev) {
      throw new Error("this session was taken over through a relay: its owner sends keepalives");
    }
    const p = await call(this.#dev, type, this.authed(kind));
    if (p[0] !== ST.OK) {
      throw new FactorError(
        kind === "close" ? "CLOSE" : "KEEPALIVE",
        failureOf(p[0] ?? 0xff),
        waitOf(p) ?? null,
      );
    }
  }
}

/** The FIDO2 challenge for a takeover (purpose 2), and the registered credential id. */
export async function takeoverFidoChallenge(
  dev: LatchFrameDevice,
): Promise<{ clientDataHash: Buffer; counter: number; credentialId: Buffer }> {
  const p = await call(dev, CS04.FIDO_CHALLENGE, Buffer.from([2]));
  if (p[0] !== ST.OK || p.length < 38) {
    throw new FactorError("FIDO_CHALLENGE", p.length ? failureOf(p[0]) : "no-response");
  }
  return {
    clientDataHash: Buffer.from(p.subarray(1, 33)),
    counter: p.readUInt32LE(33),
    credentialId: Buffer.from(p.subarray(38, 38 + p[37])),
  };
}

function factorTail(recoveryCode: Buffer, f: SecondFactor): Buffer {
  if (recoveryCode.length !== 16) {
    throw new Error("a recovery code is 16 bytes");
  }
  if (f.kind === "totp") {
    return Buffer.concat([
      recoveryCode,
      Buffer.from([2]),
      le32(f.code),
      le64(Math.floor(f.hostTimeS)),
    ]);
  }
  const ad = f.authenticatorData;
  if (ad.length < 37 || ad.length > 96 || f.signature.length !== 64) {
    throw new Error("FIDO2 assertion malformed");
  }
  return Buffer.concat([recoveryCode, Buffer.from([1, ad.length]), ad, f.signature]);
}

/**
 * Takeover: end the live session on `channel` and open this host's in its place, authorised
 * by both of the person's factors (the device's two-factor rules: one-time recovery code, failure
 * counter, backoff, lockout). Never on a set latch, never while the two-factor path is locked, and
 * never a latch clear. Throws FactorError with the device's refusal; a refused attempt that the
 * device evaluated is counted on the device. `recoveryCode` is wiped.
 */
export async function takeoverByFactors(
  t: FactorTransport,
  devicePubRaw: Buffer,
  uid: Buffer,
  p: { channel: TakeoverChannel; recoveryCode: Buffer; factor: SecondFactor },
): Promise<TakenSession> {
  const eph = generateKeyPairSync("x25519");
  const hostPub = Buffer.from(eph.publicKey.export({ format: "der", type: "spki" }).subarray(12));
  const hostNonce = randomBytes(16);
  const ch = p.channel === "latch" ? 1 : 2;
  const inner = Buffer.concat([
    Buffer.from([ch]),
    hostPub,
    hostNonce,
    factorTail(p.recoveryCode, p.factor),
  ]);
  p.recoveryCode.fill(0);
  const r = await factorRequest(t, devicePubRaw, uid, CS04.FACTOR_TAKEOVER, inner);
  if (r.length === 0) {
    throw new FactorError("FACTOR_TAKEOVER", "no-response");
  }
  if (r[0] !== ST.OK) {
    throw new FactorError(
      "FACTOR_TAKEOVER",
      r[0] === ST.BAD_STATE ? "no-session" : failureOf(r[0]),
      waitOf(r) ?? null,
    );
  }
  const isLatch = p.channel === "latch";
  if (r.length !== (isLatch ? 133 : 141)) {
    throw new FactorError("FACTOR_TAKEOVER", "bad-record");
  }
  const sid = r.readBigUInt64LE(1);
  const counter = isLatch ? 0n : r.readBigUInt64LE(9);
  const o = isLatch ? 9 : 17;
  const dp = Buffer.from(r.subarray(o, o + 32));
  const dn = Buffer.from(r.subarray(o + 32, o + 48));
  const ruid = r.subarray(o + 48, o + 60);
  const transcript = isLatch
    ? Buffer.concat([T("ECW-LATCH-OPN-01"), ruid, le64(sid), hostPub, dp, hostNonce, dn])
    : Buffer.concat([
        T("ECW-ANCHOR-OPN-1"),
        ruid,
        le64(sid),
        le64(counter),
        hostPub,
        dp,
        hostNonce,
        dn,
      ]);
  if (!ruid.equals(uid) || !verifyBy(devicePubRaw, transcript, r.subarray(o + 60, o + 124))) {
    throw new FactorError("FACTOR_TAKEOVER", "bad-signature");
  }
  const shared = diffieHellman({
    privateKey: eph.privateKey,
    publicKey: createPublicKey({
      key: Buffer.concat([X25519_SPKI, dp]),
      format: "der",
      type: "spki",
    }),
  });
  const key = Buffer.from(
    hkdfSync(
      "sha3-256",
      shared,
      Buffer.concat([hostNonce, dn]),
      Buffer.concat([
        T(isLatch ? "ECW-LATCH-KDF-01" : "ECW-ANCHOR-KDF-1"),
        uid,
        le64(sid),
        hostPub,
        dp,
      ]),
      32,
    ),
  );
  shared.fill(0);
  return new TakenSession(
    p.channel,
    sid,
    counter,
    Buffer.from(uid),
    key,
    t.kind === "direct" ? t.dev : null,
  );
}

// ---- the device-counted unlock grant ----------------------------------------------------------

/** One grant covers at most this many uses (the device's full unsigned 16-bit count). */
export const UNLOCK_USES_MAX = 65_535;
export const UNLOCK_LEASE_MIN_S = 30;
/** And lasts at most 36 h. */
export const UNLOCK_LEASE_MAX_S = 129_600;
export const TAG_UNLOCK_GRANT = T("enclaweder.unlock-grant.v1");
export const TAG_UNLOCK_USE = T("enclaweder.unlock-use.v1");
export const TAG_UNLOCK_STATE = T("enclaweder.unlock-state.v1");
const UNLOCK_STATE = ["none", "active", "exhausted", "expired", "revoked", "reset"] as const;
const UNLOCK_WHY = ["", "host", "latch", "zeroize", "replaced"] as const;

/** One signed unlock body. */
export interface UnlockBody {
  state: (typeof UNLOCK_STATE)[number] | `state ${number}`;
  why: (typeof UNLOCK_WHY)[number] | `why ${number}`;
  kind: "grant" | "use" | "state" | "revoke" | `kind ${number}`;
  uses: number;
  used: number;
  gid: bigint;
  boot: bigint;
  leaseMs: number;
  leaseLeftMs: number;
  grantHostTimeS: bigint;
  hostTimeS: bigint;
  step: number;
  useIndex: number;
  uid: Buffer;
  scope: Buffer;
}
export function parseUnlockBody(b: Buffer): UnlockBody {
  if (b.length !== 100 || b[0] !== 1) {
    throw new FactorError("UNLOCK", "bad-record");
  }
  return {
    state: UNLOCK_STATE[b[1]] ?? `state ${b[1]}`,
    why: UNLOCK_WHY[b[2]] ?? `why ${b[2]}`,
    kind: (["", "grant", "use", "state", "revoke"] as const)[b[3]] || `kind ${b[3]}`,
    uses: b.readUInt16LE(4),
    used: b.readUInt16LE(6),
    gid: b.readBigUInt64LE(8),
    boot: b.readBigUInt64LE(16),
    leaseMs: b.readUInt32LE(24),
    leaseLeftMs: b.readUInt32LE(28),
    grantHostTimeS: b.readBigUInt64LE(32),
    hostTimeS: b.readBigUInt64LE(40),
    step: b.readUInt32LE(48),
    useIndex: b.readUInt16LE(52),
    uid: Buffer.from(b.subarray(56, 68)),
    scope: Buffer.from(b.subarray(68, 100)),
  };
}
/** A device-signed unlock record, everything an offline verifier needs (hex). */
export type UnlockRecord = {
  v: 1;
  tag: "grant" | "use" | "state";
  uid: string;
  pubkey: string;
  nonce: string;
  body: string;
  sig: string;
};

function unlockAnswer(
  p: Buffer,
  tag: Buffer,
  nonce: Buffer,
  pub: Buffer,
  uid: Buffer,
): { body: UnlockBody; record: UnlockRecord } {
  if (p.length !== 165) {
    throw new FactorError("UNLOCK", "bad-record");
  }
  const raw = p.subarray(1, 101);
  const sig = p.subarray(101, 165);
  if (!verifyBy(pub, Buffer.concat([tag, nonce, raw]), sig)) {
    throw new FactorError("UNLOCK", "bad-signature");
  }
  const body = parseUnlockBody(Buffer.from(raw));
  if (!body.uid.equals(uid)) {
    throw new FactorError("UNLOCK", "bad-record");
  }
  const t = tag.equals(TAG_UNLOCK_GRANT) ? "grant" : tag.equals(TAG_UNLOCK_USE) ? "use" : "state";
  return {
    body,
    record: {
      v: 1,
      tag: t,
      uid: uid.toString("hex"),
      pubkey: pub.toString("hex"),
      nonce: nonce.toString("hex"),
      body: raw.toString("hex"),
      sig: sig.toString("hex"),
    },
  };
}

/**
 * Unlock grant: the person's current authenticator code (6 digits) buys a grant of `uses` uses
 * (1..65 535) inside `leaseS` seconds (30..129 600, 36 h), for `scope` (32 bytes: what is being
 * unlocked). Each use's host time is checked by the device, not here.
 * Send it `{ kind: "sealed", relay }` when another process owns the device, so the code never
 * crosses that process in the clear.
 */
export async function grantUnlock(
  t: FactorTransport,
  devicePubRaw: Buffer,
  uid: Buffer,
  p: { code: string; uses: number; leaseS: number; scope: Buffer; hostTimeS?: number },
): Promise<
  | { ok: true; grant: UnlockBody; record: UnlockRecord }
  | { ok: false; code: FactorFailure; waitMs?: number }
> {
  if (
    !/^\d{6}$/.test(p.code) ||
    p.scope.length !== 32 ||
    !Number.isInteger(p.uses) ||
    p.uses < 1 ||
    p.uses > UNLOCK_USES_MAX ||
    !Number.isInteger(p.leaseS) ||
    p.leaseS < UNLOCK_LEASE_MIN_S ||
    p.leaseS > UNLOCK_LEASE_MAX_S
  ) {
    return { ok: false, code: "malformed" };
  }
  const nonce = randomBytes(32);
  const inner = Buffer.concat([
    nonce,
    le32(Number(p.code)),
    le64(p.hostTimeS ?? nowS()),
    le16(p.uses),
    le32(p.leaseS),
    p.scope,
  ]);
  let r: Buffer;
  try {
    r = await factorRequest(t, devicePubRaw, uid, CS04.UNLOCK_GRANT, inner);
  } catch (err) {
    if (err instanceof FactorError) {
      return { ok: false, code: err.code };
    }
    throw err;
  }
  if (r.length === 0) {
    return { ok: false, code: "no-response" };
  }
  if (r[0] !== ST.OK) {
    const w = r.length === 5 ? r.readUInt32LE(1) : r.length === 97 ? r.readUInt32LE(17) : undefined;
    return { ok: false, code: failureOf(r[0]), ...(w === undefined ? {} : { waitMs: w }) };
  }
  try {
    const a = unlockAnswer(r, TAG_UNLOCK_GRANT, nonce, devicePubRaw, uid);
    if (a.body.kind !== "grant" || a.body.state !== "active" || !a.body.scope.equals(p.scope)) {
      return { ok: false, code: "bad-record" };
    }
    return { ok: true, grant: a.body, record: a.record };
  } catch (err) {
    return { ok: false, code: (err as FactorError).code ?? "bad-record" };
  }
}

/**
 * Unlock use: spend ONE use of grant `gid` on the device; returns the receipt the device signed
 * over this call's fresh nonce. No receipt means no use: never act on an unlock without one.
 */
export async function spendUnlock(
  dev: LatchFrameDevice,
  devicePubRaw: Buffer,
  uid: Buffer,
  p: { gid: bigint; scope: Buffer; hostTimeS?: number; nonce?: Buffer },
): Promise<
  | { ok: true; receipt: UnlockBody; record: UnlockRecord }
  | { ok: false; code: FactorFailure; state?: UnlockBody }
> {
  const nonce = p.nonce ?? randomBytes(32);
  if (nonce.length !== 32 || p.scope.length !== 32) {
    return { ok: false, code: "malformed" };
  }
  const r = await call(
    dev,
    CS04.UNLOCK_USE,
    Buffer.concat([nonce, le64(p.gid), le64(p.hostTimeS ?? nowS()), p.scope]),
  );
  if (r.length === 0) {
    return { ok: false, code: "no-response" };
  }
  try {
    if (r[0] === ST.OK) {
      const a = unlockAnswer(r, TAG_UNLOCK_USE, nonce, devicePubRaw, uid);
      if (a.body.kind !== "use" || a.body.gid !== p.gid || !a.body.scope.equals(p.scope)) {
        return { ok: false, code: "bad-record" };
      }
      // Command set 0.5: this counted use activates the launch; its nonce (never in any answer)
      // is what a bound anchor open or a key derivation presents (activation.ts).
      noteActivation(devicePubRaw.toString("hex"), nonce, {
        kind: "unlock-use",
        gid: a.body.gid,
        useIndex: a.body.useIndex,
        boot: a.body.boot,
      });
      return { ok: true, receipt: a.body, record: a.record };
    }
    if (r[0] === ST.BAD_STATE && r.length === 165) {
      return {
        ok: false,
        code: "no-grant",
        state: unlockAnswer(r, TAG_UNLOCK_STATE, nonce, devicePubRaw, uid).body,
      };
    }
  } catch (err) {
    return { ok: false, code: (err as FactorError).code ?? "bad-record" };
  }
  return { ok: false, code: r[0] === ST.AUTH ? "mismatch" : failureOf(r[0]) };
}

/** The grant's state, signed over a fresh nonce. */
export async function readUnlock(
  dev: LatchFrameDevice,
  devicePubRaw: Buffer,
  uid: Buffer,
): Promise<UnlockBody> {
  const nonce = randomBytes(32);
  const r = await call(dev, CS04.UNLOCK_GET, nonce);
  if (r[0] !== ST.OK) {
    throw new FactorError("UNLOCK_GET", r.length ? failureOf(r[0]) : "no-response");
  }
  return unlockAnswer(r, TAG_UNLOCK_STATE, nonce, devicePubRaw, uid).body;
}

/** Ends grant `gid` (0n = whatever is live). Returns the signed state after. */
export async function revokeUnlock(
  dev: LatchFrameDevice,
  devicePubRaw: Buffer,
  uid: Buffer,
  gid = 0n,
): Promise<UnlockBody> {
  const nonce = randomBytes(32);
  const r = await call(dev, CS04.UNLOCK_REVOKE, Buffer.concat([nonce, le64(gid)]));
  if (r[0] !== ST.OK) {
    throw new FactorError("UNLOCK_REVOKE", r.length ? failureOf(r[0]) : "no-response");
  }
  return unlockAnswer(r, TAG_UNLOCK_STATE, nonce, devicePubRaw, uid).body;
}

/**
 * Verifies a receipt offline: signed by `devicePubRaw` under the use tag over `nonce` (the
 * verifier's own), for `uid` and `scope`, with a host time within `skewS` of `nowS`. Returns the
 * body, or null. A verifier must also refuse a (boot, gid, useIndex) it has already seen.
 */
export function verifyUnlockReceipt(
  rec: UnlockRecord,
  expect: {
    pubkeyRaw: Buffer;
    uid: Buffer;
    nonce: Buffer;
    scope: Buffer;
    nowS?: number;
    skewS?: number;
  },
): UnlockBody | null {
  try {
    if (rec.v !== 1 || rec.tag !== "use" || rec.nonce !== expect.nonce.toString("hex")) {
      return null;
    }
    const raw = Buffer.from(rec.body, "hex");
    if (
      !verifyBy(
        expect.pubkeyRaw,
        Buffer.concat([TAG_UNLOCK_USE, expect.nonce, raw]),
        Buffer.from(rec.sig, "hex"),
      )
    ) {
      return null;
    }
    const b = parseUnlockBody(raw);
    const now = expect.nowS ?? nowS();
    if (
      b.kind !== "use" ||
      !b.uid.equals(expect.uid) ||
      !b.scope.equals(expect.scope) ||
      Math.abs(Number(b.hostTimeS) - now) > (expect.skewS ?? 120)
    ) {
      return null;
    }
    return b;
  } catch {
    return null;
  }
}

// ---- the identity-event log -------------------------------------------------------------------

export const TAG_IDENTITY_LOG = T("enclaweder.identity-log.v1");
export interface IdentityEvent {
  seq: bigint;
  boot: bigint;
  kind: "mint" | "load-failure" | "zeroize" | `kind ${number}`;
  reason: number;
  reasonText: string;
  ctx: number;
  flags: number;
  arg: number;
  /** MINT: SHA3-256(new pubkey)[0..8]. */
  fingerprint: Buffer;
  tickMs: number;
  /** The device could not save its boot counter that boot (the number may repeat once). */
  bootUnsaved: boolean;
}
const LOAD_REASON: Record<number, string> = { 1: "magic missing", 2: "CRC mismatch", 3: "other" };
const Z_REASON: Record<number, string> = {
  1: "tamper",
  2: "environmental failure",
  3: "host zeroize",
  4: "quorum failure",
  5: "entropy failure",
  6: "self-test failure",
};

/** The device's identity events (newest first) and its boot counter, signed over a fresh nonce. */
export async function readIdentityLog(
  dev: LatchFrameDevice,
  devicePubRaw: Buffer,
  uid: Buffer,
): Promise<{ boot: bigint; total: bigint; events: IdentityEvent[] }> {
  const nonce = randomBytes(32);
  return parseIdentityLog(await call(dev, CS04.IDLOG_GET, nonce), nonce, devicePubRaw, uid);
}

/** Checks one identity-log answer against the nonce that was sent and the certified key. */
export function parseIdentityLog(
  p: Buffer,
  nonce: Buffer,
  devicePubRaw: Buffer,
  uid: Buffer,
): { boot: bigint; total: bigint; events: IdentityEvent[] } {
  if (p.length === 0) {
    throw new FactorError("IDLOG_GET", "no-response");
  }
  if (p[0] !== ST.OK || p.length < 18) {
    throw new FactorError("IDLOG_GET", failureOf(p[0]));
  }
  const n = p[17];
  const bl = 17 + n * 40;
  if (p.length !== 1 + bl + 64) {
    throw new FactorError("IDLOG_GET", "bad-record");
  }
  const body = p.subarray(1, 1 + bl);
  if (
    !verifyBy(devicePubRaw, Buffer.concat([TAG_IDENTITY_LOG, nonce, uid, body]), p.subarray(1 + bl))
  ) {
    throw new FactorError("IDLOG_GET", "bad-signature");
  }
  const events: IdentityEvent[] = [];
  for (let i = 0; i < n; i++) {
    const e = body.subarray(17 + i * 40, 57 + i * 40);
    const k = e[16];
    events.push({
      seq: e.readBigUInt64LE(0),
      boot: e.readBigUInt64LE(8),
      kind: k === 1 ? "mint" : k === 2 ? "load-failure" : k === 3 ? "zeroize" : `kind ${k}`,
      reason: e[17],
      reasonText:
        k === 2
          ? (LOAD_REASON[e[17]] ?? `reason ${e[17]}`)
          : k === 3
            ? (Z_REASON[e[17]] ?? `reason ${e[17]}`)
            : "",
      ctx: e[18],
      flags: e[19] & 0x7f,
      arg: e.readUInt32LE(20),
      fingerprint: Buffer.from(e.subarray(24, 32)),
      tickMs: e.readUInt32LE(32),
      bootUnsaved: (e[19] & 0x80) !== 0,
    });
  }
  return { boot: body.readBigUInt64LE(0), total: body.readBigUInt64LE(8), events };
}

/** SHA3-256(pubkey)[0..8]: how a MINT event names the key it minted. */
export function identityFingerprint(pubkeyRaw: Buffer): Buffer {
  return createHash("sha3-256").update(pubkeyRaw).digest().subarray(0, 8);
}

// ---- device entropy ---------------------------------------------------------------------------

/** Most bytes one extra-entropy read asks for. */
export const DEVICE_ENTROPY_MAX = 256;

/** `n` (1..256) bytes of optional extra entropy from the hardware root: mix them in, never use them alone. */
export async function readDeviceEntropy(
  dev: LatchFrameDevice,
  n: number,
  timeoutMs = 1000,
): Promise<Buffer> {
  if (!Number.isInteger(n) || n < 1 || n > DEVICE_ENTROPY_MAX) {
    throw new RangeError(`device entropy: 1..${DEVICE_ENTROPY_MAX} bytes`);
  }
  const p = await call(dev, CS04.STREAM_ENTROPY, le16(n), timeoutMs);
  if (p.length === 0) {
    throw new FactorError("STREAM_ENTROPY", "no-response");
  }
  if (p[0] !== ST.OK || p.length < 3 || p.readUInt16LE(1) !== n || p.length !== 3 + n) {
    throw new FactorError("STREAM_ENTROPY", p[0] !== ST.OK ? failureOf(p[0]) : "bad-record");
  }
  return Buffer.from(p.subarray(3));
}

/** Constant-time compare for callers checking a scope or nonce they hold. */
export function sameBytes(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}
