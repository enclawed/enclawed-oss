import {
  createHash,
  createHmac,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  hkdfSync,
  randomBytes,
  verify as edVerify,
} from "node:crypto";
// Host side of the DEVICE-HELD halt latch (Enclaweder command set 0.3, findings N17/N18).
//
// Enclawed assumes the host is already compromised. So the halt state of a hardware-rooted
// host is held by the Enclaweder, and this file is only a client of it:
//
//   readDeviceLatch   LATCH_GET over a fresh nonce, verified against the CERTIFIED device key:
//                     the answer cannot be replayed or forged, whatever HOME or state path the
//                     reading process has.
//   LatchSession      the guard's "host session" (dirty on start): opening it arms the latch on
//                     the device, and only an authenticated clean close disarms it.
//                     Unplug, power loss, crash, kill or a lapsed lease all leave the device
//                     DIRTY.
//   clear*            ONLY the device can clear: two device-verified factors together (TOTP or
//                     FIDO2, AND a one-time recovery code), or the operator quorum (custodial,
//                     for lost factors). Nothing here can clear the latch by itself.
//
// Nothing secret is logged or kept: recovery codes and TOTP codes are passed through as bytes
// and wiped by the caller; operator signatures are made by the caller's signers.
import { CLOCK_DISAGREES_TEXT } from "./clock-disagrees-text.js";
import {
  DeviceTransientError,
  rawEd25519ToPem,
  type DeviceTransientCode,
  type OperatorSigner,
} from "./enclaweder-hid.js";

export const LT = {
  AUTH_CHALLENGE: 0x12,
  LATCH_GET: 0x1c,
  LATCH_HALT: 0x1d,
  LATCH_OPEN: 0x1e,
  LATCH_KEEPALIVE: 0x1f,
  LATCH_CLOSE: 0x20,
  LATCH_CLEAR: 0x21,
  LATCH_CLEAR_2FA: 0x22,
  REISSUE_RECOVERY: 0x23,
  LATCH_LOG: 0x24,
  OPERATOR_HANDOVER: 0x25,
  CUSTODY_GET: 0x26,
  FIDO_CHALLENGE: 0x27,
  SET_HOST_TIME: 0x28,
  FAILLOG_GET: 0x29,
  LATCH_CHECKPOINT: 0x2c,
} as const;

const ST = {
  OK: 0,
  BAD_ARG: 1,
  BAD_STATE: 2,
  NOT_ENROLLED: 3,
  AUTH: 5,
  BUSY: 7,
  UNSUPPORTED: 8,
  LOCKED: 9,
  TIME: 10, // command set 0.6: the TOTP factor's host time disagreed with the device's tick
};
const TAG = (s: string) => Buffer.from(s, "latin1");
const TAG_GET = TAG("ECW-LATCH-GET-01");
const TAG_OPEN = TAG("ECW-LATCH-OPN-01");
const TAG_KDF = TAG("ECW-LATCH-KDF-01");
const TAG_KAL = TAG("ECW-LATCH-KAL-01");
const TAG_CLS = TAG("ECW-LATCH-CLS-01");
const TAG_HLT = TAG("ECW-LATCH-HLT-01");
const TAG_CKP = TAG("ECW-LATCH-CKP-01");
const TAG_JCK = TAG("ECW-JOURNAL-CK-01");
const TAG_LOG = TAG("ECW-LATCH-LOG-01");
const TAG_FLG = TAG("ECW-FAILLOG-GT01");
const TAG_CUS = TAG("ECW-CUSTODY-GET1");
const OPER_AUTH = TAG("ECW-OPER-AUTH-01");
const X25519_SPKI = Buffer.from("302a300506032b656e032100", "hex");

/** Lease the device grants a latch session; keep refreshing well inside it. */
export const LATCH_LEASE_MS = 120_000;
export const LATCH_KEEPALIVE_INTERVAL_MS = 30_000;
/**
 * Keepalives in a row that may go unanswered before the host calls the session lost. Two misses
 * leave the third renewal 90 s after the last good one, inside the 120 s lease, so the device
 * never lapses on account of a loaded host; a third miss, or any definite refusal, is a loss.
 * The device keeps its own lease either way: this only stops the host halting on a hiccup.
 * Internal on purpose (no setting).
 */
const KEEPALIVE_MISSES_TOLERATED = 2;
/** Host sub-reason codes sent in LATCH_HALT (opaque to the device; for the operator's eyes). */
export const HOST_HALT_CODE = {
  GUARD_CHECK_FAILED: 0x01,
  HOST_MIRROR: 0x10, // the host cache said DIRTY while the device said clean
  DISCONNECT_SEEN: 0x11,
  OPERATOR_REQUEST: 0x20,
} as const;

export const LATCH_REASON: Record<number, string> = {
  0: "none",
  1: "host halt (latch session)",
  2: "host halt (anchor session)",
  3: "host halt (no session)",
  4: "host session lapsed without a clean close",
  5: "USB re-enumeration while the host session was open",
  6: "power loss / unplug while the host session was open",
  7: "tamper",
  8: "environmental failure",
  9: "attestation quorum failure",
  10: "entropy health failure",
  11: "operator zeroize",
  12: "self-test failure",
};

/** The frame-level slice of the device this needs (Enclaweder satisfies it). */
export type LatchFrameDevice = {
  request(
    type: number,
    id: number,
    payload?: Buffer,
    timeoutMs?: number,
  ): Promise<{ payload: Buffer } | null>;
  sendNoWait?(type: number, payload: Buffer): void;
};

export type LatchErrorCode =
  | "unsupported" // firmware before 0.3: no device latch
  | "no-response"
  | "bad-signature"
  | "bad-record"
  | "locked" // ERR_LOCKED: the latch is set (gated op) or the 2FA path is locked out
  | "busy"
  | "auth"
  | "not-enrolled"
  | "bad-state"
  | "clock-disagrees" // ERR_TIME: two-factor clear with a TOTP factor, host time off the device's tick
  | "rejected";

/** What a person reads for each refusal; the command and status stay on the error's fields. */
const LATCH_ERROR_TEXT: Record<LatchErrorCode, string> = {
  unsupported:
    "the device's firmware is too old for the halt latch: update the Enclaweder firmware",
  "no-response": "the device did not answer",
  "bad-signature": "the device's answer did not verify under its certified key",
  "bad-record": "the device's answer was malformed",
  locked:
    "the device is locked: its halt state is set, or recovery is locked after repeated failures",
  busy: "the device is busy",
  auth: "the device refused: authentication failed",
  "not-enrolled": "not set up on the device",
  "bad-state": "the device refused in its current state",
  "clock-disagrees": CLOCK_DISAGREES_TEXT,
  rejected: "the device rejected the request",
};

export class DeviceLatchError extends Error {
  /** The device command that failed (developer detail; not part of the message). */
  readonly op: string;
  readonly code: LatchErrorCode;
  readonly status: number | null;
  readonly waitMs: number | null;
  constructor(
    op: string,
    code: LatchErrorCode,
    status: number | null = null,
    waitMs: number | null = null,
  ) {
    super(
      `${LATCH_ERROR_TEXT[code]}${waitMs ? `; try again in ${Math.ceil(waitMs / 1000)} s` : ""}`,
    );
    this.name = "DeviceLatchError";
    this.op = op;
    this.code = code;
    this.status = status;
    this.waitMs = waitMs;
  }
}

function codeOf(status: number): LatchErrorCode {
  switch (status) {
    case ST.UNSUPPORTED:
      return "unsupported";
    case ST.LOCKED:
      return "locked";
    case ST.BUSY:
      return "busy";
    case ST.AUTH:
      return "auth";
    case ST.TIME:
      return "clock-disagrees";
    case ST.NOT_ENROLLED:
      return "not-enrolled";
    case ST.BAD_STATE:
      return "bad-state";
    default:
      return "rejected";
  }
}
function fail(op: string, p: Buffer): never {
  const wait =
    (p[0] === ST.BUSY || p[0] === ST.AUTH || p[0] === ST.TIME) && p.length >= 5
      ? p.readUInt32LE(1)
      : null;
  throw new DeviceLatchError(op, codeOf(p[0]), p[0], wait);
}
function le64(v: bigint): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(v);
  return b;
}
function le32(v: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(v >>> 0);
  return b;
}
function verifyBy(devicePubRaw: Buffer, msg: Buffer, sig: Buffer): boolean {
  try {
    return edVerify(null, msg, createPublicKey(rawEd25519ToPem(devicePubRaw)), sig);
  } catch {
    return false;
  }
}
async function call(
  dev: LatchFrameDevice,
  op: string,
  type: number,
  payload: Buffer,
  timeoutMs = 5000,
): Promise<Buffer> {
  const f = await dev.request(type, 1, payload, timeoutMs);
  if (!f) {
    throw new DeviceLatchError(op, "no-response");
  }
  return f.payload;
}

/**
 * Whether `err` means "no answer" rather than a wrong answer: the device did not answer in time
 * (no-response), or its node went away (gone; USB re-enumeration, usbipd re-attach). Anything
 * else the device said, or a signature that did not verify, is a definite answer: null.
 */
export function transientDeviceError(err: unknown): DeviceTransientCode | null {
  if (err instanceof DeviceTransientError) {
    return err.code;
  }
  if (err instanceof DeviceLatchError && err.code === "no-response") {
    return "no-answer";
  }
  // A transport that surfaced the errno itself (the node went away under the descriptor).
  const errno = (err as NodeJS.ErrnoException | null)?.code;
  if (errno === "ENODEV" || errno === "EIO" || errno === "ENOENT") {
    return "gone";
  }
  return null;
}

/** The device's latch, as the device signed it. */
export interface DeviceLatchState {
  state: "CLEAR" | "SET";
  reason: number;
  reasonText: string;
  hostCode: number;
  flags: number;
  operatorAuthority: boolean;
  factorsValid: boolean;
  twoFactorLocked: boolean;
  armed: boolean;
  sessionLive: boolean;
  custodyHandedOver: boolean;
  codesLeft: number;
  failedAttempts: number;
  lastEvent: number;
  seq: bigint;
  setSeq: bigint;
  sid: bigint;
  /** ms since the device set it, if set during this power-on; null when unknown. */
  sinceMs: number | null;
  codeEpoch: number;
  custody: number;
  codeWaitMs: number;
  /** The enrolled authenticator for two-factor recovery. */
  factorKind: "authenticator-app" | "security-key" | "none";
  uid: Buffer;
}

/** Parse + verify a LATCH_GET answer against the nonce we sent and the certified device key. */
export function parseDeviceLatch(
  p: Buffer,
  nonce: Buffer,
  devicePubRaw: Buffer,
  uid: Buffer | null,
): DeviceLatchState {
  if (p[0] !== ST.OK) {
    fail("LATCH_GET", p);
  }
  if (p.length !== 1 + 64 + 64) {
    throw new DeviceLatchError("LATCH_GET", "bad-record", p[0]);
  }
  const b = p.subarray(1, 65);
  if (!verifyBy(devicePubRaw, Buffer.concat([TAG_GET, nonce, b]), p.subarray(65, 129))) {
    throw new DeviceLatchError("LATCH_GET", "bad-signature");
  }
  const devUid = Buffer.from(b.subarray(52, 64));
  if (uid && !devUid.equals(uid)) {
    throw new DeviceLatchError("LATCH_GET", "bad-record");
  }
  if (b[0] !== 1) {
    throw new DeviceLatchError("LATCH_GET", "bad-record");
  }
  const flags = b[4];
  const since = b.readUInt32LE(32);
  return {
    state: b[1] ? "SET" : "CLEAR",
    reason: b[2],
    reasonText: LATCH_REASON[b[2]] ?? `reason ${b[2]}`,
    hostCode: b[3],
    flags,
    operatorAuthority: Boolean(flags & 0x01),
    factorsValid: Boolean(flags & 0x02),
    twoFactorLocked: Boolean(flags & 0x04),
    armed: Boolean(flags & 0x08),
    sessionLive: Boolean(flags & 0x10),
    custodyHandedOver: Boolean(flags & 0x40),
    codesLeft: b[5],
    failedAttempts: b[6],
    lastEvent: b[7],
    seq: b.readBigUInt64LE(8),
    setSeq: b.readBigUInt64LE(16),
    sid: b.readBigUInt64LE(24),
    sinceMs: b[1] && flags & 0x20 ? since : null,
    codeEpoch: b.readUInt32LE(36),
    custody: b.readUInt32LE(40),
    codeWaitMs: b.readUInt32LE(44),
    factorKind: b[48] === 2 ? "authenticator-app" : b[48] === 1 ? "security-key" : "none",
    uid: devUid,
  };
}

/** LATCH_GET with a fresh nonce. Throws DeviceLatchError("unsupported") on firmware < 0.3. */
export async function readDeviceLatch(
  dev: LatchFrameDevice,
  devicePubRaw: Buffer,
  uid: Buffer | null,
  timeoutMs = 5000,
): Promise<DeviceLatchState> {
  const nonce = randomBytes(32);
  return parseDeviceLatch(
    await call(dev, "LATCH_GET", LT.LATCH_GET, nonce, timeoutMs),
    nonce,
    devicePubRaw,
    uid,
  );
}

/**
 * LATCH_GET over a caller's nonce, answer unverified (the broker relays it to clients, who
 * verify it themselves against the certified key; finding H1). Throws only when nothing came.
 */
export async function latchGetRaw(
  dev: LatchFrameDevice,
  nonce32: Buffer,
  timeoutMs = 2000,
): Promise<Buffer> {
  if (nonce32.length !== 32) {
    throw new DeviceLatchError("LATCH_GET", "rejected");
  }
  return call(dev, "LATCH_GET", LT.LATCH_GET, Buffer.from(nonce32), timeoutMs);
}

/** Set the device latch with no session (set-only; always allowed). Idempotent. */
export async function haltDeviceAnonymous(dev: LatchFrameDevice, hostCode: number): Promise<void> {
  const p = await call(dev, "LATCH_HALT", LT.LATCH_HALT, Buffer.from([0, hostCode & 0xff]));
  if (p[0] !== ST.OK) {
    fail("LATCH_HALT", p);
  }
}

/**
 * The guard's host session ("dirty on start"). One per device; a second open is ERR_BUSY.
 * K is derived from an X25519 exchange signed by the certified device key and lives only in a
 * private field.
 */
export class LatchSession {
  readonly sid: bigint;
  readonly uid: Buffer;
  readonly #dev: LatchFrameDevice;
  readonly #key: Buffer;
  #ctr = 0n;
  #closed = false;
  #timer: ReturnType<typeof setInterval> | null = null;

  private constructor(dev: LatchFrameDevice, key: Buffer, sid: bigint, uid: Buffer) {
    this.#dev = dev;
    this.#key = key;
    this.sid = sid;
    this.uid = uid;
  }

  get isOpen(): boolean {
    return !this.#closed;
  }

  static async open(
    dev: LatchFrameDevice,
    devicePubRaw: Buffer,
    timeoutMs = 10_000,
  ): Promise<LatchSession> {
    const eph = generateKeyPairSync("x25519");
    const hostPub = Buffer.from(eph.publicKey.export({ format: "der", type: "spki" }).subarray(12));
    const hostNonce = randomBytes(16);
    const p = await call(
      dev,
      "LATCH_OPEN",
      LT.LATCH_OPEN,
      Buffer.concat([hostPub, hostNonce]),
      timeoutMs,
    );
    if (p[0] !== ST.OK) {
      fail("LATCH_OPEN", p);
    }
    if (p.length !== 133) {
      throw new DeviceLatchError("LATCH_OPEN", "bad-record");
    }
    const sid = p.readBigUInt64LE(1);
    const devPub = Buffer.from(p.subarray(9, 41));
    const devNonce = Buffer.from(p.subarray(41, 57));
    const uid = Buffer.from(p.subarray(57, 69));
    const transcript = Buffer.concat([
      TAG_OPEN,
      uid,
      le64(sid),
      hostPub,
      devPub,
      hostNonce,
      devNonce,
    ]);
    if (!verifyBy(devicePubRaw, transcript, p.subarray(69, 133))) {
      throw new DeviceLatchError("LATCH_OPEN", "bad-signature");
    }
    let shared: Buffer;
    try {
      shared = diffieHellman({
        privateKey: eph.privateKey,
        publicKey: createPublicKey({
          key: Buffer.concat([X25519_SPKI, devPub]),
          format: "der",
          type: "spki",
        }),
      });
    } catch {
      throw new DeviceLatchError("LATCH_OPEN", "bad-record");
    }
    const key = Buffer.from(
      hkdfSync(
        "sha3-256",
        shared,
        Buffer.concat([hostNonce, devNonce]),
        Buffer.concat([TAG_KDF, uid, le64(sid), hostPub, devPub]),
        32,
      ),
    );
    shared.fill(0);
    return new LatchSession(dev, key, sid, uid);
  }

  #authed(tag: Buffer, extra: Buffer = Buffer.alloc(0)): Buffer {
    this.#ctr += 1n;
    const mac = createHmac("sha3-256", this.#key)
      .update(Buffer.concat([tag, this.uid, le64(this.sid), le64(this.#ctr), extra]))
      .digest();
    return Buffer.concat([le64(this.sid), le64(this.#ctr), extra, mac]);
  }

  /** Renew the lease. Returns the lease granted (ms). */
  async keepalive(): Promise<number> {
    if (this.#closed) {
      throw new DeviceLatchError("LATCH_KEEPALIVE", "bad-state");
    }
    const p = await call(this.#dev, "LATCH_KEEPALIVE", LT.LATCH_KEEPALIVE, this.#authed(TAG_KAL));
    if (p[0] !== ST.OK) {
      fail("LATCH_KEEPALIVE", p);
    }
    return p.length >= 5 ? p.readUInt32LE(1) : LATCH_LEASE_MS;
  }

  /** Set the device latch under this session (reason HOST_HALT, `hostCode` recorded). */
  async halt(hostCode: number): Promise<void> {
    const body = this.#authed(TAG_HLT, Buffer.from([hostCode & 0xff]));
    // wire: form(1)=1 code(1) sid(8) ctr(8) mac(32); the MAC covers sid|ctr|code
    const req = Buffer.concat([
      Buffer.from([1, hostCode & 0xff]),
      body.subarray(0, 16),
      body.subarray(17),
    ]);
    const p = await call(this.#dev, "LATCH_HALT", LT.LATCH_HALT, req);
    this.#stop();
    this.#closed = true;
    if (p[0] !== ST.OK) {
      fail("LATCH_HALT", p);
    }
  }

  /** A journal checkpoint the device signs for this session only (finding H2). */
  async checkpoint(head32: Buffer): Promise<{ uid: Buffer; sid: bigint; ck: bigint; sig: Buffer }> {
    if (head32.length !== 32) {
      throw new Error("journal checkpoint: head must be 32 bytes");
    }
    const body = this.#authed(TAG_CKP, head32);
    const p = await call(this.#dev, "LATCH_CHECKPOINT", LT.LATCH_CHECKPOINT, body);
    if (p[0] !== ST.OK || p.length !== 81) {
      fail("LATCH_CHECKPOINT", p);
    }
    return {
      uid: this.uid,
      sid: p.readBigUInt64LE(1),
      ck: p.readBigUInt64LE(9),
      sig: Buffer.from(p.subarray(17, 81)),
    };
  }

  /** The clean close: the only thing that disarms the device's dirty-on-start flag. */
  async close(): Promise<void> {
    if (this.#closed) {
      return;
    }
    this.#stop();
    const p = await call(this.#dev, "LATCH_CLOSE", LT.LATCH_CLOSE, this.#authed(TAG_CLS));
    this.#closed = true;
    this.#key.fill(0);
    if (p[0] !== ST.OK) {
      fail("LATCH_CLOSE", p);
    }
  }

  /** Best effort at process exit, when nothing can be awaited. */
  closeSync(): void {
    if (this.#closed) {
      return;
    }
    this.#stop();
    this.#closed = true;
    try {
      this.#dev.sendNoWait?.(LT.LATCH_CLOSE, this.#authed(TAG_CLS));
    } catch {
      /* the device stays dirty: exactly the fail-closed outcome */
    }
    this.#key.fill(0);
  }

  startKeepalive(intervalMs: number, onLost: (err: Error) => void): void {
    this.#stop();
    let misses = 0;
    this.#timer = setInterval(() => {
      this.keepalive().then(
        () => {
          misses = 0;
        },
        (err: Error) => {
          // No answer (a loaded host, a node being reopened) is retried at the next tick, inside
          // the lease; a definite refusal, or too many misses in a row, is a lost session.
          if (transientDeviceError(err) && ++misses <= KEEPALIVE_MISSES_TOLERATED) {
            return;
          }
          this.#stop();
          onLost(err);
        },
      );
    }, intervalMs);
    this.#timer.unref?.();
  }
  #stop(): void {
    if (this.#timer) {
      clearInterval(this.#timer);
      this.#timer = null;
    }
  }
}

/** Verify a journal checkpoint signature (finding H2). */
export function verifyJournalCheckpoint(
  devicePubRaw: Buffer,
  uid: Buffer,
  sid: bigint,
  ck: bigint,
  head32: Buffer,
  sig: Buffer,
): boolean {
  return verifyBy(devicePubRaw, Buffer.concat([TAG_JCK, uid, le64(sid), le64(ck), head32]), sig);
}

/** The operator-quorum message for one AUTH_CHALLENGE nonce: what each operator signs. */
export function operatorAuthMessage(
  nonce16: Buffer,
  cmd: number,
  uid: Buffer,
  args: Buffer,
): Buffer {
  return Buffer.concat([OPER_AUTH, nonce16, Buffer.from([cmd]), uid, args]);
}

async function authChallenge(dev: LatchFrameDevice): Promise<Buffer> {
  const p = await call(dev, "AUTH_CHALLENGE", LT.AUTH_CHALLENGE, Buffer.alloc(0));
  if (p[0] !== ST.OK || p.length < 17) {
    fail("AUTH_CHALLENGE", p);
  }
  return Buffer.from(p.subarray(1, 17));
}

/**
 * Custodial clear by the operator quorum (lost factors). The signers see the exact message (the
 * AUTH_CHALLENGE nonce, LATCH_CLEAR, this uid, the current latch seq) and should be off-host:
 * hardware tokens, an air-gapped station, or a key on removable media.
 */
export async function clearByOperatorQuorum(
  dev: LatchFrameDevice,
  devicePubRaw: Buffer,
  uid: Buffer,
  signers: OperatorSigner[],
): Promise<bigint> {
  if (signers.length < 1 || signers.length > 8) {
    throw new Error("operator recovery: needs 1..8 operator signatures");
  }
  const cur = await readDeviceLatch(dev, devicePubRaw, uid);
  const nonce = await authChallenge(dev);
  const msg = operatorAuthMessage(nonce, LT.LATCH_CLEAR, uid, le64(cur.seq));
  const sigs = await Promise.all(signers.map(async (s) => Buffer.from(await s(msg))));
  if (sigs.some((s) => s.length !== 64)) {
    throw new Error("operator recovery: an operator signature must be 64 bytes");
  }
  const p = await call(dev, "LATCH_CLEAR", LT.LATCH_CLEAR, Buffer.concat([nonce, ...sigs]));
  if (p[0] !== ST.OK) {
    fail("LATCH_CLEAR", p);
  }
  return p.length >= 9 ? p.readBigUInt64LE(1) : 0n;
}

export type SecondFactor =
  | { kind: "totp"; code: number; hostTimeS: number }
  | { kind: "fido2"; authenticatorData: Buffer; signature: Buffer };

/** Two-factor clear. `recoveryCode` is the 16 raw bytes; the caller wipes it afterwards. */
export async function clearByTwoFactors(
  dev: LatchFrameDevice,
  recoveryCode: Buffer,
  factorA: SecondFactor,
): Promise<{ codeIndex: number; codesLeft: number; seq: bigint }> {
  if (recoveryCode.length !== 16) {
    throw new Error("a recovery code is 16 bytes");
  }
  let req: Buffer;
  if (factorA.kind === "totp") {
    const t = Buffer.alloc(8);
    t.writeBigUInt64LE(BigInt(Math.floor(factorA.hostTimeS)));
    req = Buffer.concat([recoveryCode, Buffer.from([2]), le32(factorA.code), t]);
  } else {
    const ad = factorA.authenticatorData;
    if (ad.length < 37 || ad.length > 96 || factorA.signature.length !== 64) {
      throw new Error("FIDO2 assertion malformed");
    }
    req = Buffer.concat([recoveryCode, Buffer.from([1, ad.length]), ad, factorA.signature]);
  }
  try {
    // Allow up to 15 s for the device to answer.
    const p = await call(dev, "LATCH_CLEAR_2FA", LT.LATCH_CLEAR_2FA, req, 15_000);
    if (p[0] !== ST.OK) {
      fail("LATCH_CLEAR_2FA", p);
    }
    return { codeIndex: p[1], codesLeft: p[2], seq: p.readBigUInt64LE(3) };
  } finally {
    req.fill(0);
  }
}

/** FIDO2 factor: the device's one-shot clientDataHash and the registered credential id. */
export async function fidoChallenge(
  dev: LatchFrameDevice,
): Promise<{ clientDataHash: Buffer; counter: number; credentialId: Buffer }> {
  const p = await call(dev, "FIDO_CHALLENGE", LT.FIDO_CHALLENGE, Buffer.alloc(0));
  if (p[0] !== ST.OK || p.length < 38) {
    fail("FIDO_CHALLENGE", p);
  }
  const n = p[37];
  return {
    clientDataHash: Buffer.from(p.subarray(1, 33)),
    counter: p.readUInt32LE(33),
    credentialId: Buffer.from(p.subarray(38, 38 + n)),
  };
}
export const FIDO_RP_ID = "enclaweder.local";
export const FIDO_RP_ID_HASH = createHash("sha256").update(FIDO_RP_ID).digest();

/** Untrusted host clock for the device's failure-log labels. Best effort. */
export async function setHostTime(
  dev: LatchFrameDevice,
  unixS = Math.floor(Date.now() / 1000),
): Promise<void> {
  const t = Buffer.alloc(8);
  t.writeBigUInt64LE(BigInt(unixS));
  await dev.request(LT.SET_HOST_TIME, 1, t, 2000).catch(() => null);
}

export const FAIL_OP: Record<number, string> = {
  1: "two-factor latch clear",
  2: "operator signature",
  3: "anchor-session MAC",
  4: "latch-session MAC",
  5: "TOTP enrollment",
};
export const FAIL_REASON: Record<number, string> = {
  1: "did not verify",
  2: "malformed",
  3: "no/stale challenge",
  4: "locked out",
  5: "TOTP host time disagreed with the device's clock",
};

export interface DeviceFailure {
  seq: bigint;
  total: bigint;
  sid: number;
  /** Host-supplied clock (UNTRUSTED), unix seconds; 0 = none supplied. */
  hostTimeUntrusted: number;
  tickMs: number;
  op: number;
  opText: string;
  reason: number;
  reasonText: string;
  arg: number;
  count: number;
}

/** The device's signed failure log (newest first) and its never-resetting total. */
export async function readFailLog(
  dev: LatchFrameDevice,
  devicePubRaw: Buffer,
  uid: Buffer,
): Promise<{ total: bigint; pending: number; entries: DeviceFailure[] }> {
  const nonce = randomBytes(32);
  const p = await call(dev, "FAILLOG_GET", LT.FAILLOG_GET, nonce);
  if (p[0] !== ST.OK || p.length < 12) {
    fail("FAILLOG_GET", p);
  }
  const n = p[11];
  const bl = 11 + n * 40;
  if (p.length !== 1 + bl + 64) {
    throw new DeviceLatchError("FAILLOG_GET", "bad-record");
  }
  const body = p.subarray(1, 1 + bl);
  if (
    !verifyBy(devicePubRaw, Buffer.concat([TAG_FLG, nonce, uid, body]), p.subarray(1 + bl, 65 + bl))
  ) {
    throw new DeviceLatchError("FAILLOG_GET", "bad-signature");
  }
  const entries: DeviceFailure[] = [];
  for (let i = 0; i < n; i++) {
    const e = body.subarray(11 + i * 40, 51 + i * 40);
    entries.push({
      seq: e.readBigUInt64LE(0),
      total: e.readBigUInt64LE(8),
      sid: e.readUInt32LE(16),
      hostTimeUntrusted: e.readUInt32LE(20),
      tickMs: e.readUInt32LE(24),
      op: e[28],
      opText: FAIL_OP[e[28]] ?? `op ${e[28]}`,
      reason: e[29],
      reasonText: FAIL_REASON[e[29]] ?? `reason ${e[29]}`,
      arg: e[30],
      count: e.readUInt16LE(32),
    });
  }
  return { total: body.readBigUInt64LE(0), pending: body.readUInt16LE(8), entries };
}

/** Who holds operator authority, as the device signs it. */
export async function readCustody(
  dev: LatchFrameDevice,
  devicePubRaw: Buffer,
  uid: Buffer,
): Promise<{ counter: number; m: number; keys: Buffer[] }> {
  const nonce = randomBytes(32);
  const p = await call(dev, "CUSTODY_GET", LT.CUSTODY_GET, nonce);
  if (p[0] !== ST.OK || p.length < 7) {
    fail("CUSTODY_GET", p);
  }
  const N = p[6];
  const bl = 6 + N * 32;
  const body = p.subarray(1, 1 + bl);
  if (
    p.length !== 1 + bl + 64 ||
    !verifyBy(devicePubRaw, Buffer.concat([TAG_CUS, nonce, uid, body]), p.subarray(1 + bl))
  ) {
    throw new DeviceLatchError("CUSTODY_GET", "bad-signature");
  }
  const keys: Buffer[] = [];
  for (let i = 0; i < N; i++) {
    keys.push(Buffer.from(body.subarray(6 + i * 32, 38 + i * 32)));
  }
  return { counter: body.readUInt32LE(0), m: body[4], keys };
}

export interface LatchEvent {
  seq: bigint;
  sid: bigint;
  setSeq: bigint;
  ts: bigint;
  fpr: bigint;
  state: number;
  reason: number;
  event: number;
  evArg: number;
}
/** The device's signed latch history (newest first). */
export async function readLatchLog(
  dev: LatchFrameDevice,
  devicePubRaw: Buffer,
  uid: Buffer,
): Promise<LatchEvent[]> {
  const nonce = randomBytes(32);
  const p = await call(dev, "LATCH_LOG", LT.LATCH_LOG, nonce);
  if (p[0] !== ST.OK || p.length < 2) {
    fail("LATCH_LOG", p);
  }
  const n = p[1];
  const recs = p.subarray(2, 2 + n * 48);
  if (
    p.length !== 2 + n * 48 + 64 ||
    !verifyBy(
      devicePubRaw,
      Buffer.concat([TAG_LOG, nonce, uid, Buffer.from([n]), recs]),
      p.subarray(2 + n * 48),
    )
  ) {
    throw new DeviceLatchError("LATCH_LOG", "bad-signature");
  }
  const out: LatchEvent[] = [];
  for (let i = 0; i < n; i++) {
    const r = recs.subarray(i * 48, i * 48 + 48);
    out.push({
      seq: r.readBigUInt64LE(0),
      sid: r.readBigUInt64LE(8),
      setSeq: r.readBigUInt64LE(16),
      ts: r.readBigUInt64LE(24),
      fpr: r.readBigUInt64LE(32),
      state: r[40],
      reason: r[41],
      event: r[43],
      evArg: r[44],
    });
  }
  return out;
}
