// USB-HID driver for the enclaweder (raw /dev/hidraw, no native deps).
// Wire protocol: SOF(0xE2) VER TYPE ID(2,LE) LEN(2,LE) payload CRC16-CCITT-FALSE(2,LE), carried as
// 64-byte HID reports. This is the enclawed<->enclaweder seam.
import {
  randomInt,
  createHash,
  createHmac,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  hkdfSync,
  randomBytes,
  verify as edVerify,
} from "node:crypto";
import fs from "node:fs";
import { inspect } from "node:util";
import { type HidTransport, listEnclawederPaths, openHid } from "./hid-transport.js";

/**
 * A Pro unit enumerates as ECPRO-, so render the serial the device itself reports in its USB
 * descriptor (Linux sysfs metadata only, no device I/O).
 * Null when unreadable (other platforms, an injected transport) or when it does not carry this
 * unit's UID; callers then fall back to the base rendering. Cosmetic and unauthenticated: never
 * gate on it.
 */
export function usbDescriptorSerial(devPath: string | null, uid: Buffer): string | null {
  if (!devPath?.startsWith("/dev/hidraw")) {
    return null;
  }
  try {
    const dev = fs.realpathSync(`/sys/class/hidraw/${devPath.slice("/dev/".length)}/device`);
    const s = fs.readFileSync(`${dev}/../../serial`, "utf8").trim();
    const hex = uid.toString("hex").toUpperCase();
    return ["ENCLW-", "ECPRO-"].some((pre) => s === pre + hex) ? s : null;
  } catch {
    return null;
  }
}

const CHALLENGE_TAG = Buffer.from("ECW-CHALLENGE-01"); // fixed by the device
/* Distinct from CHALLENGE_TAG on purpose, and it must stay that way. CHALLENGE signs a
 * caller-chosen 32-byte nonce, and an audit-log head hash is exactly 32 bytes -- a shared
 * tag would let anything that can call challenge() forge an anchor for any head it liked. */
const ANCHOR_TAG = Buffer.from("ECW-ANCHOR-01\0\0\0", "latin1");
/* Record v2 and the anchor-session transcript, MAC and KDF tags. Each is distinct from every
 * other tag and from CHALLENGE_TAG, for the same reason as above. */
const ANCHOR_TAG_V2 = Buffer.from("ECW-ANCHOR-02\0\0\0", "latin1");
const ANCHOR_OPEN_TAG = Buffer.from("ECW-ANCHOR-OPN-1", "latin1");
const ANCHOR_KDF_TAG = Buffer.from("ECW-ANCHOR-KDF-1", "latin1");
const ANCHOR_SET_TAG = Buffer.from("ECW-ANCHOR-SET-1", "latin1");
const ANCHOR_CLOSE_TAG = Buffer.from("ECW-ANCHOR-CLS-1", "latin1");
const ANCHOR_KEEPALIVE_TAG = Buffer.from("ECW-ANCHOR-KAL-1", "latin1"); // command set 0.2
/* Command set 0.5: record v3 (a bound session's record, carrying the launch's activation binding)
 * and the bound-open transcript. Lower-case "enclaweder." tags: no "ECW-" tag can produce them. */
export const ANCHOR_TAG_V3 = Buffer.from("enclaweder.anchor-record.v3", "latin1");
export const ANCHOR_OPEN_BOUND_TAG = Buffer.from("enclaweder.anchor-open-bound.v1", "latin1");
/* Operator authorisation (AUTH_CHALLENGE nonce + M-of-N operator signatures), as for
 * IDENTITY_LOCK / ZEROIZE / RECOVER; the anchor takeover binds it to cmd 0x19 and the new
 * session's host_pub | host_nonce. */
const OPER_AUTH_TAG = Buffer.from("ECW-OPER-AUTH-01", "latin1");
const X25519_SPKI_PREFIX = Buffer.from("302a300506032b656e032100", "hex");

export interface Identity {
  uid: Buffer;
  serial: string;
  pubkeyRaw: Buffer;
  flags: number;
}
export interface DeviceStatus {
  state: number;
  gate: number;
  k: number;
  n: number;
  nodesOnline: number;
  ledger: number;
  locked: number;
}
export interface ChallengeResponse {
  uid: Buffer;
  sig: Buffer;
}

/**
 * A monotonic audit anchor, signed by the device.
 *
 * `counter` is the device's own and cannot be set by the host. That is the whole
 * point: an attacker can keep an older, genuinely signed record, but cannot stop
 * this counter moving past it, so a replayed anchor is detectable. Replaying valid
 * data is what defeats every purely host-side scheme.
 */
export interface AnchorResponse {
  /**
   * Record format: 1 = firmware before authenticated anchoring (117 B), 2 = an unbound session
   * (134 B), 3 = a session bound to a launch's device-verified activation (166 B, command set 0.5).
   */
  version: 1 | 2 | 3;
  counter: bigint;
  head: Buffer;
  uid: Buffer;
  /**
   * The anchor session (its `sid`) that set this head. 0n for v1 records, and for a head set
   * before authenticated anchoring that a v2 device carried over from its v1 record.
   */
  sess: bigint;
  /** How many ANCHOR_OPENs the device has ever accepted. 0n for v1 records. */
  opens: bigint;
  /** Record v3 only: the activation binding of the session that set the head (32 bytes). */
  bind?: Buffer;
  sig: Buffer;
}

/** Auto-detect a connected enclaweder by its USB VID:PID (1209:E100). Returns the
 *  /dev/hidraw* path or null. Used at enclawed bootstrap: if a device is found, it is mandatory. */
export function findAllEnclaweders(): string[] {
  // Enumeration lives with the transport: Linux scans /sys/class/hidraw,
  // macOS/Windows enumerate through node-hid by VID/PID. Same device,
  // same ordering contract (stable indices for fleet members).
  return listEnclawederPaths();
}

export function findEnclaweder(): string | null {
  return findAllEnclaweders()[0] ?? null;
}

/** raw Ed25519 public key (32 bytes) -> SPKI PEM (so Node crypto + enclawed can use it). */
export function rawEd25519ToPem(raw32: Buffer): string {
  const der = Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(raw32)]);
  return createPublicKey({ key: der, format: "der", type: "spki" }).export({
    format: "pem",
    type: "spki",
  });
}

/** Verify a proof-of-possession challenge response against the device's raw public key. */
export function verifyChallenge(
  pubkeyRaw: Buffer,
  nonce32: Buffer,
  uid12: Buffer,
  sig64: Buffer,
): boolean {
  const pub = createPublicKey(rawEd25519ToPem(pubkeyRaw));
  const msg = Buffer.concat([CHALLENGE_TAG, Buffer.from(nonce32), Buffer.from(uid12)]);
  try {
    return edVerify(null, msg, pub, sig64);
  } catch {
    return false;
  }
}

/** Verify a device-signed audit anchor (record v1) against the device's raw public key.
 *  Kept for anchors stored before the firmware moved to record v2. */
export function verifyAnchor(
  pubkeyRaw: Buffer,
  counter: bigint,
  head32: Buffer,
  uid12: Buffer,
  sig64: Buffer,
): boolean {
  const pub = createPublicKey(rawEd25519ToPem(pubkeyRaw));
  const ctr = Buffer.alloc(8);
  ctr.writeBigUInt64LE(counter);
  const msg = Buffer.concat([ANCHOR_TAG, ctr, Buffer.from(head32), Buffer.from(uid12)]);
  try {
    return edVerify(null, msg, pub, sig64);
  } catch {
    return false;
  }
}

/** Verify a device-signed record v2 (authenticated anchoring) against the device's raw key. */
export function verifyAnchorV2(
  pubkeyRaw: Buffer,
  counter: bigint,
  head32: Buffer,
  uid12: Buffer,
  sess: bigint,
  opens: bigint,
  sig64: Buffer,
): boolean {
  const msg = Buffer.concat([
    ANCHOR_TAG_V2,
    le64(counter),
    Buffer.from(head32),
    Buffer.from(uid12),
    le64(sess),
    le64(opens),
  ]);
  try {
    return edVerify(null, msg, createPublicKey(rawEd25519ToPem(pubkeyRaw)), sig64);
  } catch {
    return false;
  }
}

/** Verify a device-signed record v3 (a bound session, command set 0.5) against the device's raw key. */
export function verifyAnchorV3(
  pubkeyRaw: Buffer,
  counter: bigint,
  head32: Buffer,
  uid12: Buffer,
  sess: bigint,
  opens: bigint,
  bind32: Buffer,
  sig64: Buffer,
): boolean {
  const msg = Buffer.concat([
    ANCHOR_TAG_V3,
    le64(counter),
    Buffer.from(head32),
    Buffer.from(uid12),
    le64(sess),
    le64(opens),
    Buffer.from(bind32),
  ]);
  try {
    return edVerify(null, msg, createPublicKey(rawEd25519ToPem(pubkeyRaw)), sig64);
  } catch {
    return false;
  }
}

/**
 * Verify an anchor record of either version. A record without `version` (written by code that
 * predates record v2) is a v1 record. The two signature tags differ, so neither version's
 * signature can be passed off as the other's.
 */
export function verifyAnchorRecord(
  pubkeyRaw: Buffer,
  a: Pick<AnchorResponse, "counter" | "head" | "uid" | "sig"> &
    Partial<Pick<AnchorResponse, "version" | "sess" | "opens" | "bind">>,
): boolean {
  if (a.version === 3) {
    if (typeof a.sess !== "bigint" || typeof a.opens !== "bigint" || a.bind?.length !== 32) {
      return false;
    }
    return verifyAnchorV3(pubkeyRaw, a.counter, a.head, a.uid, a.sess, a.opens, a.bind, a.sig);
  }
  if (a.version === 2) {
    if (typeof a.sess !== "bigint" || typeof a.opens !== "bigint") {
      return false;
    }
    return verifyAnchorV2(pubkeyRaw, a.counter, a.head, a.uid, a.sess, a.opens, a.sig);
  }
  return verifyAnchor(pubkeyRaw, a.counter, a.head, a.uid, a.sig);
}

/** Pinned manufacturer root public key (Ed25519, raw 32B). PUBLIC -- safe to embed. This is the trust
 *  anchor: a genuine enclaweder carries a birth certificate signed by the matching root PRIVATE key
 *  (kept offline). Its root_id (first 4B of SHA-256) is 5cc8040c. Override via the guard only for testing or a different manufacturer root. */
export const ENCLAWEDER_ROOT_PUBKEY = Buffer.from(
  "8b7d01806542104d3ef9560c644297bd4f07279e646fe33da9a072f4fc5f6694",
  "hex",
);

/** Enclaweder Pro manufacturer root. Pro is a SEPARATE TRUST DOMAIN, not a flag on the base line:
 *  a Pro unit is signed by its own root, so the authenticated model field -- never the USB serial
 *  prefix -- is the thing to gate on. */
export const ENCLAWEDER_ROOT_PUBKEY_PRO = Buffer.from(
  "d41d18029a04b9e69afd2c689c86eaf54f9dccd2e1adade684f0dfbd421daf8d",
  "hex",
);

export type EnclawederSku = "base" | "pro";

/** The pinned trust domains. `model` is the ONLY model each root is permitted to have issued, so a
 *  cert claiming model=2 while signed by the base root is rejected even though its signature is
 *  valid -- that combination is exactly the "base unit presented as Pro" forgery the separate-domain
 *  design exists to stop. */
export const ENCLAWEDER_DOMAINS: Array<{
  name: EnclawederSku;
  model: number;
  pub: Buffer;
}> = [
  { name: "base", model: 1, pub: ENCLAWEDER_ROOT_PUBKEY },
  { name: "pro", model: 2, pub: ENCLAWEDER_ROOT_PUBKEY_PRO },
];

export interface DeviceCert {
  ver: number;
  uid: Buffer;
  devicePub: Buffer;
  model: number;
  date: number;
  rootId: Buffer;
  /** Which pinned domain signed this cert. Authenticated -- unlike the USB serial prefix. */
  sku?: EnclawederSku;
}

/** 4-byte key id = first 4 bytes of SHA-256(root pubkey). */
function certRootId(rootPubRaw: Buffer): Buffer {
  return createHash("sha256").update(rootPubRaw).digest().subarray(0, 4);
}

/**
 * Verify a device birth certificate (119B) and bind it to a device:
 * it must (a) chain to the pinned manufacturer root, and (b) certify THIS exact device's uid + key.
 * Returns the parsed cert, or null if anything fails. Requiring this at bind time turns "a device is
 * present" into "a MANUFACTURER-CERTIFIED device is present": a zeroized/re-minted or counterfeit unit
 * passes challenge-response (it holds its own key) but has no root-signed cert for that key.
 */
export function verifyCert(
  cert: Buffer,
  deviceUid: Buffer,
  devicePubRaw: Buffer,
  rootPubRaw: Buffer | null = null,
): DeviceCert | null {
  const CERT_SIGNED_LEN = 55;
  const CERT_LEN = 119;
  if (cert.length !== CERT_LEN || cert[0] !== 1) {
    return null;
  }
  const parsed: DeviceCert = {
    ver: cert[0],
    uid: Buffer.from(cert.subarray(1, 13)),
    devicePub: Buffer.from(cert.subarray(13, 45)),
    model: cert[45] | (cert[46] << 8),
    date: (cert[47] | (cert[48] << 8) | (cert[49] << 16) | (cert[50] << 24)) >>> 0,
    rootId: Buffer.from(cert.subarray(51, 55)),
  };
  // rootPubRaw null  -> accept any PINNED domain, choosing the anchor by the cert's own root_id.
  // rootPubRaw given -> demand that exact root (used by tests and to require one SKU).
  // Selecting by root_id weakens nothing: the anchor must still be pinned, the signature must
  // verify under it, and the model must be one that domain is allowed to issue.
  const domain = rootPubRaw
    ? (ENCLAWEDER_DOMAINS.find((dm) => dm.pub.equals(rootPubRaw)) ?? {
        name: (parsed.model === 2 ? "pro" : "base") as EnclawederSku,
        model: null as number | null,
        pub: rootPubRaw,
      })
    : ENCLAWEDER_DOMAINS.find((dm) => parsed.rootId.equals(certRootId(dm.pub)));
  if (!domain) {
    return null; // root_id matches no pinned manufacturer root
  }
  if (!parsed.rootId.equals(certRootId(domain.pub))) {
    return null; // signed by a different (or no) root
  }
  if (domain.model !== null && parsed.model !== domain.model) {
    return null; // model does not belong to the root that signed it
  }
  parsed.sku = domain.name;
  if (!parsed.uid.equals(deviceUid) || !parsed.devicePub.equals(devicePubRaw)) {
    return null; // certifies a different device
  }
  try {
    const pub = createPublicKey(rawEd25519ToPem(domain.pub));
    if (
      !edVerify(
        null,
        cert.subarray(0, CERT_SIGNED_LEN),
        pub,
        cert.subarray(CERT_SIGNED_LEN, CERT_LEN),
      )
    ) {
      return null; // signature forged/invalid
    }
  } catch {
    return null;
  }
  return parsed;
}

const T = {
  GET_STATUS: 0x02,
  GET_IDENTITY: 0x0d,
  GET_CERT: 0x0f,
  CHALLENGE: 0x11,
  AUTH_CHALLENGE: 0x12,
  ANCHOR_SET: 0x17,
  ANCHOR_GET: 0x18,
  ANCHOR_OPEN: 0x19,
  ANCHOR_CLOSE: 0x1a,
  ANCHOR_KEEPALIVE: 0x1b,
  ANCHOR_OPEN_BOUND: 0x37, // command set 0.5
  ANCHOR_READ: 0x38, // command set 0.5
} as const;
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function le64(v: bigint): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(v);
  return b;
}

/**
 * Parse a signed anchor record, either version, told apart by length AND the version byte
 * (Enclaweder wire protocol):
 *   v2  status(1) ver=2(1) counter(8 LE) head(32) uid(12) sess(8 LE) opens(8 LE) sig(64)  134 B
 *   v1  status(1) counter(8 LE) head(32) uid(12) sig(64)                                117 B
 */
export function parseAnchor(p: Buffer): AnchorResponse {
  if (p.length === 166 && p[1] === 3) {
    // v3  status(1) ver=3(1) counter(8) head(32) uid(12) sess(8) opens(8) bind(32) sig(64)  166 B
    return {
      version: 3,
      counter: p.readBigUInt64LE(2),
      head: Buffer.from(p.subarray(10, 42)),
      uid: Buffer.from(p.subarray(42, 54)),
      sess: p.readBigUInt64LE(54),
      opens: p.readBigUInt64LE(62),
      bind: Buffer.from(p.subarray(70, 102)),
      sig: Buffer.from(p.subarray(102, 166)),
    };
  }
  if (p.length === 134 && p[1] === 2) {
    return {
      version: 2,
      counter: p.readBigUInt64LE(2),
      head: Buffer.from(p.subarray(10, 42)),
      uid: Buffer.from(p.subarray(42, 54)),
      sess: p.readBigUInt64LE(54),
      opens: p.readBigUInt64LE(62),
      sig: Buffer.from(p.subarray(70, 134)),
    };
  }
  if (p.length === 117) {
    return {
      version: 1,
      counter: p.readBigUInt64LE(1),
      head: Buffer.from(p.subarray(9, 41)),
      uid: Buffer.from(p.subarray(41, 53)),
      sess: 0n,
      opens: 0n,
      sig: Buffer.from(p.subarray(53, 117)),
    };
  }
  throw new Error(`audit anchor: the device returned an unrecognized ${p.length}-byte record`);
}

/** Device status codes the anchor commands return. */
export const ANCHOR_STATUS = {
  OK: 0,
  BAD_ARG: 1,
  BAD_STATE: 2,
  NOT_ENROLLED: 3,
  AUTH: 5,
  BUSY: 7,
  UNSUPPORTED: 8,
} as const;

/**
 * Why an anchor-session operation failed. Closed so callers branch on it, never on the message.
 *   busy           ERR_BUSY. On ANCHOR_OPEN: another session already holds the channel -- an
 *                  alarm, not a retry condition; `waitMs` (fw >= 0.2) is that holder's lease
 *                  left. On SET/KEEPALIVE/CLOSE: the authentication rate limiter's cooldown.
 *   auth           ERR_AUTH: the device does not hold this session (re-enumerated, reset,
 *                  tamper response, lease expired, operator takeover) or the MAC did not
 *                  verify; for a takeover, the operator quorum did not verify.
 *   unsupported    the firmware predates the command (authenticated anchoring, or for
 *                  ANCHOR_KEEPALIVE / takeover, command set 0.2).
 *   rejected       any other device status.
 *   no-response    the device did not answer in time.
 *   bad-signature  the ANCHOR_OPEN transcript is not signed by the certified device key.
 *   bad-record     the device answered with a record that does not verify or is not ours.
 *   closed         the session was already closed on this side.
 */
export type AnchorErrorCode =
  | "busy"
  | "auth"
  | "unsupported"
  | "rejected"
  | "no-response"
  | "bad-signature"
  | "bad-record"
  | "closed";

export type AnchorOp =
  | "ANCHOR_OPEN"
  | "ANCHOR_SET"
  | "ANCHOR_CLOSE"
  | "ANCHOR_KEEPALIVE"
  | "AUTH_CHALLENGE";

/** What a person reads; the command and status stay on the error's fields. */
const ANCHOR_OP_TEXT: Record<AnchorOp, string> = {
  ANCHOR_OPEN: "opening the audit-anchor session",
  ANCHOR_SET: "anchoring the audit log",
  ANCHOR_CLOSE: "closing the audit-anchor session",
  ANCHOR_KEEPALIVE: "renewing the audit-anchor session",
  AUTH_CHALLENGE: "the operator challenge",
};
const ANCHOR_CODE_TEXT: Record<AnchorErrorCode, string> = {
  busy: "another process holds the device's audit-anchor session",
  auth: "the device no longer holds this session, or authentication failed",
  unsupported: "the device's firmware is too old: update the Enclaweder firmware",
  rejected: "the device rejected the request",
  "no-response": "the device did not answer",
  "bad-signature": "the device's answer did not verify under its certified key",
  "bad-record": "the device's answer did not verify or is not ours",
  closed: "the session is closed",
};

export class AnchorAuthError extends Error {
  readonly op: AnchorOp;
  readonly code: AnchorErrorCode;
  /** The device status byte, when the device answered with one. */
  readonly status: number | null;
  /**
   * ERR_BUSY only, command set 0.2 (`07 | wait_ms(4 LE)`): from ANCHOR_OPEN the holder's lease
   * left if it stops renewing (a lower bound: it may renew), from SET/KEEPALIVE/CLOSE the
   * rate-limiter cooldown left. null for firmware 0.1's bare status byte and every other error.
   */
  readonly waitMs: number | null;
  constructor(
    op: AnchorOp,
    code: AnchorErrorCode,
    status: number | null = null,
    waitMs: number | null = null,
  ) {
    super(
      `${ANCHOR_OP_TEXT[op]}: ${ANCHOR_CODE_TEXT[code]}` +
        (waitMs === null ? "" : ` (wait ${Math.ceil(waitMs / 1000)} s)`),
    );
    this.name = "AnchorAuthError";
    this.op = op;
    this.code = code;
    this.status = status;
    this.waitMs = waitMs;
  }
}

/** `07 | wait_ms(4 LE)` -> wait_ms; null for a bare status (firmware 0.1) or another status. */
export function busyWaitMs(p: Buffer): number | null {
  return p[0] === ANCHOR_STATUS.BUSY && p.length >= 5 ? p.readUInt32LE(1) : null;
}

/** An error for a non-OK device answer, carrying its status and (for ERR_BUSY) the wait. */
function statusError(op: AnchorOp, p: Buffer): AnchorAuthError {
  return new AnchorAuthError(op, statusCode(p[0]), p[0], busyWaitMs(p));
}

function statusCode(status: number): AnchorErrorCode {
  switch (status) {
    case ANCHOR_STATUS.BUSY:
      return "busy";
    case ANCHOR_STATUS.AUTH:
      return "auth";
    case ANCHOR_STATUS.UNSUPPORTED:
      return "unsupported";
    default:
      return "rejected";
  }
}

/** The slice of the device an anchor session needs: the serialized, id-matched request(). */
export type AnchorFrameDevice = {
  request(
    type: number,
    id: number,
    payload?: Buffer,
    timeoutMs?: number,
  ): Promise<{ payload: Buffer } | null>;
  /** Write one request without waiting for its answer; used only to close at process exit. */
  sendNoWait?(type: number, payload: Buffer): void;
};

/** How long to wait for the device to answer ANCHOR_OPEN (allow up to 10 s). */
export const ANCHOR_OPEN_TIMEOUT_MS = 10_000;

/** Command set 0.2: a session ends by itself this long after its open or last accepted
 *  SET / KEEPALIVE (set by the device; KEEPALIVE reports the lease actually granted). */
export const ANCHOR_LEASE_MS = 120_000;

/** How often a holder renews: well inside the lease, so a missed beat or two does not lose it. */
export const ANCHOR_KEEPALIVE_INTERVAL_MS = 30_000;

/** Signs a raw message with one operator key (Ed25519, 64 bytes). Keep operator keys off the
 *  agent host: this is the operator's device or console, reached however the deployment does. */
export type OperatorSigner = (msg: Buffer) => Buffer | Promise<Buffer>;

/**
 * One authenticated anchor session (Enclaweder wire protocol, "record v2").
 *
 * The device admits one session at a time and a second ANCHOR_OPEN fails rather than
 * superseding, so whoever opens first owns the anchor until a replug, an authenticated close,
 * or (command set 0.2) its lease running out -- 120 s after its last accepted SET/KEEPALIVE,
 * which startKeepalive() prevents while the process lives -- or an operator-quorum takeover
 * (AnchorSession.takeover). The session key K is derived on both sides from an X25519 exchange whose device half
 * is signed by the certified device key; it never crosses the wire, and it lives only in this
 * object's private field -- never written, logged, serialized or shown by inspect().
 */
export class AnchorSession {
  readonly sid: bigint;
  readonly uid: Buffer;
  /** The device's anchor counter when the session opened. */
  readonly counterAtOpen: bigint;
  /**
   * Command set 0.5: the activation binding the device wrote into this session (a bound open), or
   * null for an unbound session. Every record of a bound session is v3 and carries it.
   */
  readonly binding: Buffer | null;
  readonly #dev: AnchorFrameDevice;
  readonly #devicePubRaw: Buffer;
  readonly #key: Buffer;
  #ctr = 0n; // one request-counter space for SET, KEEPALIVE and CLOSE (device anti-replay)
  #closed = false;
  #timer: ReturnType<typeof setInterval> | null = null;

  private constructor(
    dev: AnchorFrameDevice,
    devicePubRaw: Buffer,
    key: Buffer,
    sid: bigint,
    uid: Buffer,
    counterAtOpen: bigint,
    binding: Buffer | null,
  ) {
    this.#dev = dev;
    this.#devicePubRaw = Buffer.from(devicePubRaw);
    this.#key = key;
    this.sid = sid;
    this.uid = uid;
    this.counterAtOpen = counterAtOpen;
    this.binding = binding;
  }

  /** The device this session was opened on. */
  get device(): AnchorFrameDevice {
    return this.#dev;
  }

  get isOpen(): boolean {
    return !this.#closed;
  }

  /**
   * ANCHOR_OPEN, verified against the CERTIFIED device key (`devicePubRaw`, already checked
   * against the birth certificate). Throws AnchorAuthError; code "busy" means something else
   * on this host holds the anchor session and must be raised as an alarm, not retried. Its
   * `waitMs` (command set 0.2) is when that holder's lease ends if it stops renewing; null on
   * firmware 0.1, where only a replug frees the channel.
   */
  static async open(
    dev: AnchorFrameDevice,
    devicePubRaw: Buffer,
    timeoutMs = ANCHOR_OPEN_TIMEOUT_MS,
  ): Promise<AnchorSession> {
    return AnchorSession.#openWith(dev, devicePubRaw, null, timeoutMs);
  }

  /**
   * ANCHOR_OPEN_BOUND (command set 0.5): open the session on presenting the request nonce of this
   * launch's device-verified activation (an UNLOCK_USE or a session-start TOTP_VERIFY this process
   * made). The device signs the open under "enclaweder.anchor-open-bound.v1" with the activation's
   * binding, verified here against the certified key; every record of the session is then v3 and
   * carries it. `send` carries the request when it must not travel in the clear (a relayed
   * client seals it, relayed-anchor.ts); by default it goes to `dev` as is. ERR_AUTH (code
   * "auth") = the device holds no fresh, unspent activation with this nonce; ERR_BUSY = a bound
   * or taken-over session holds the channel (a PLAIN session is replaced by the device);
   * "unsupported" = firmware before command set 0.5.
   */
  static async openBound(
    dev: AnchorFrameDevice,
    devicePubRaw: Buffer,
    activationNonce: Buffer,
    opts: {
      timeoutMs?: number;
      send?: (request: Buffer) => Promise<Buffer | null>;
    } = {},
  ): Promise<AnchorSession> {
    if (activationNonce.length !== 32) {
      throw new Error("audit anchor: an activation nonce is 32 bytes");
    }
    return AnchorSession.#openWith(
      dev,
      devicePubRaw,
      null,
      opts.timeoutMs ?? ANCHOR_OPEN_TIMEOUT_MS,
      {
        nonce: activationNonce,
        send: opts.send,
      },
    );
  }

  /**
   * Operator takeover (command set 0.2): ANCHOR_OPEN carrying an M-of-N operator authorisation,
   * which ends a live session (its holder's next request is ERR_AUTH) and opens this one in its
   * place. `uid` is the device uid from GET_IDENTITY. Each signer signs
   * "ECW-OPER-AUTH-01" | nonce | 0x19 | uid | host_pub | host_nonce over a fresh AUTH_CHALLENGE
   * nonce, so an authorisation opens only the session for the key pair it was issued to.
   * ERR_AUTH (code "auth") = the quorum did not verify, or no operator key is installed.
   */
  static async takeover(
    dev: AnchorFrameDevice,
    devicePubRaw: Buffer,
    uid: Buffer,
    signers: OperatorSigner[],
    timeoutMs = ANCHOR_OPEN_TIMEOUT_MS,
  ): Promise<AnchorSession> {
    if (signers.length < 1 || signers.length > 8) {
      throw new Error("audit-anchor takeover: needs 1..8 operator signatures");
    }
    if (uid.length !== 12) {
      throw new Error(`audit-anchor takeover: uid must be 12 bytes, got ${uid.length}`);
    }
    return AnchorSession.#openWith(dev, devicePubRaw, { uid, signers }, timeoutMs);
  }

  static async #openWith(
    dev: AnchorFrameDevice,
    devicePubRaw: Buffer,
    op: { uid: Buffer; signers: OperatorSigner[] } | null,
    timeoutMs: number,
    bound: { nonce: Buffer; send?: (request: Buffer) => Promise<Buffer | null> } | null = null,
  ): Promise<AnchorSession> {
    timeoutMs = Math.max(timeoutMs, 5000);
    const eph = generateKeyPairSync("x25519");
    const hostPub = Buffer.from(eph.publicKey.export({ format: "der", type: "spki" }).subarray(12));
    const hostNonce = randomBytes(16);
    let req = Buffer.concat([hostPub, hostNonce]);
    if (op) {
      const ch = await dev.request(T.AUTH_CHALLENGE, 1, Buffer.alloc(0), timeoutMs);
      if (!ch) {
        throw new AnchorAuthError("AUTH_CHALLENGE", "no-response");
      }
      if (ch.payload[0] !== ANCHOR_STATUS.OK || ch.payload.length < 17) {
        throw statusError("AUTH_CHALLENGE", ch.payload);
      }
      const nonce = Buffer.from(ch.payload.subarray(1, 17));
      const msg = Buffer.concat([
        OPER_AUTH_TAG,
        nonce,
        Buffer.from([T.ANCHOR_OPEN]),
        Buffer.from(op.uid),
        req,
      ]);
      const sigs = await Promise.all(op.signers.map(async (sign) => Buffer.from(await sign(msg))));
      if (sigs.some((g) => g.length !== 64)) {
        throw new Error("audit-anchor takeover: an operator signature must be 64 bytes");
      }
      req = Buffer.concat([req, nonce, ...sigs]);
    }
    let p: Buffer;
    if (bound) {
      const breq = Buffer.concat([req, bound.nonce]);
      const ans = bound.send
        ? await bound.send(breq)
        : ((await dev.request(T.ANCHOR_OPEN_BOUND, 1, breq, timeoutMs))?.payload ?? null);
      breq.fill(0);
      if (!ans || ans.length === 0) {
        throw new AnchorAuthError("ANCHOR_OPEN", "no-response");
      }
      p = ans;
    } else {
      const f = await dev.request(T.ANCHOR_OPEN, 1, req, timeoutMs);
      if (!f) {
        throw new AnchorAuthError("ANCHOR_OPEN", "no-response");
      }
      p = f.payload;
    }
    if (p[0] !== ANCHOR_STATUS.OK) {
      throw statusError("ANCHOR_OPEN", p);
    }
    if (p.length !== (bound ? 173 : 141)) {
      throw new AnchorAuthError("ANCHOR_OPEN", "bad-record", p[0]);
    }
    const sid = p.readBigUInt64LE(1);
    const counter = p.readBigUInt64LE(9);
    const devPub = Buffer.from(p.subarray(17, 49));
    const devNonce = Buffer.from(p.subarray(49, 65));
    const uid = Buffer.from(p.subarray(65, 77));
    // A bound open's answer carries the binding before the signature, which covers it.
    const binding = bound ? Buffer.from(p.subarray(77, 109)) : null;
    const sig = bound ? p.subarray(109, 173) : p.subarray(77, 141);
    const transcript = binding
      ? Buffer.concat([
          ANCHOR_OPEN_BOUND_TAG,
          uid,
          le64(sid),
          le64(counter),
          hostPub,
          devPub,
          hostNonce,
          devNonce,
          binding,
        ])
      : Buffer.concat([
          ANCHOR_OPEN_TAG,
          uid,
          le64(sid),
          le64(counter),
          hostPub,
          devPub,
          hostNonce,
          devNonce,
        ]);
    let genuine = false;
    try {
      genuine = edVerify(null, transcript, createPublicKey(rawEd25519ToPem(devicePubRaw)), sig);
    } catch {
      genuine = false;
    }
    if (!genuine) {
      throw new AnchorAuthError("ANCHOR_OPEN", "bad-signature");
    }
    let shared: Buffer;
    try {
      shared = diffieHellman({
        privateKey: eph.privateKey,
        publicKey: createPublicKey({
          key: Buffer.concat([X25519_SPKI_PREFIX, devPub]),
          format: "der",
          type: "spki",
        }),
      });
    } catch {
      throw new AnchorAuthError("ANCHOR_OPEN", "bad-record");
    }
    const info = Buffer.concat([ANCHOR_KDF_TAG, uid, le64(sid), hostPub, devPub]);
    const key = Buffer.from(
      hkdfSync("sha3-256", shared, Buffer.concat([hostNonce, devNonce]), info, 32),
    );
    shared.fill(0);
    return new AnchorSession(dev, devicePubRaw, key, sid, uid, counter, binding);
  }

  #mac(parts: Buffer[]): Buffer {
    return createHmac("sha3-256", this.#key).update(Buffer.concat(parts)).digest();
  }

  /**
   * ANCHOR_SET under this session. Returns the record, verified and checked to be ours: v2 for an
   * unbound session, v3 carrying exactly this session's binding for a bound one.
   */
  async set(head32: Buffer): Promise<AnchorResponse> {
    if (this.#closed) {
      throw new AnchorAuthError("ANCHOR_SET", "closed");
    }
    if (head32.length !== 32) {
      throw new Error(`audit anchor: head must be 32 bytes, got ${head32.length}`);
    }
    const ctr = ++this.#ctr; // strictly increasing per session (device anti-replay)
    const head = Buffer.from(head32);
    const mac = this.#mac([ANCHOR_SET_TAG, this.uid, le64(this.sid), le64(ctr), head]);
    const f = await this.#dev.request(
      T.ANCHOR_SET,
      1,
      Buffer.concat([head, le64(this.sid), le64(ctr), mac]),
    );
    if (!f) {
      throw new AnchorAuthError("ANCHOR_SET", "no-response");
    }
    if (f.payload[0] !== ANCHOR_STATUS.OK) {
      throw statusError("ANCHOR_SET", f.payload);
    }
    let r: AnchorResponse;
    try {
      r = parseAnchor(f.payload);
    } catch {
      throw new AnchorAuthError("ANCHOR_SET", "bad-record", f.payload[0]);
    }
    if (
      r.version !== (this.binding ? 3 : 2) ||
      (this.binding !== null && !(r.bind?.equals(this.binding) ?? false)) ||
      r.sess !== this.sid ||
      !r.head.equals(head) ||
      !r.uid.equals(this.uid) ||
      !verifyAnchorRecord(this.#devicePubRaw, r)
    ) {
      throw new AnchorAuthError("ANCHOR_SET", "bad-record", f.payload[0]);
    }
    return r;
  }

  /**
   * ANCHOR_KEEPALIVE (command set 0.2): renew the lease without anchoring. Returns the lease
   * granted, in ms. Shares the request counter with SET and CLOSE; request() is FIFO per
   * device and the counter is taken synchronously, so they reach the device in counter order.
   */
  async keepalive(): Promise<number> {
    if (this.#closed) {
      throw new AnchorAuthError("ANCHOR_KEEPALIVE", "closed");
    }
    const ctr = ++this.#ctr;
    const mac = this.#mac([ANCHOR_KEEPALIVE_TAG, this.uid, le64(this.sid), le64(ctr)]);
    const f = await this.#dev.request(
      T.ANCHOR_KEEPALIVE,
      1,
      Buffer.concat([le64(this.sid), le64(ctr), mac]),
    );
    if (!f) {
      throw new AnchorAuthError("ANCHOR_KEEPALIVE", "no-response");
    }
    if (f.payload[0] !== ANCHOR_STATUS.OK || f.payload.length < 5) {
      throw statusError("ANCHOR_KEEPALIVE", f.payload);
    }
    return f.payload.readUInt32LE(1);
  }

  /**
   * Keep the session alive while the process is: a KEEPALIVE every `intervalMs`. The timer is
   * unref()'d, so it never holds the process open; a crashed process stops renewing and the
   * device frees the channel one lease later. On the first failure the timer stops and
   * `onLost` is called once (the session expired, was taken over, or the device is gone) --
   * except "unsupported": firmware 0.1 has no lease to renew, so it stops silently.
   * Idempotent while running; cleared when the session is closed.
   */
  startKeepalive(
    intervalMs = ANCHOR_KEEPALIVE_INTERVAL_MS,
    onLost?: (err: AnchorAuthError | Error) => void,
  ): void {
    if (this.#timer || this.#closed) {
      return;
    }
    this.#timer = setInterval(() => {
      this.keepalive().catch((err: unknown) => {
        this.stopKeepalive();
        if (err instanceof AnchorAuthError && err.code === "unsupported") {
          return;
        }
        onLost?.(err instanceof Error ? err : new Error(String(err)));
      });
    }, intervalMs);
    this.#timer.unref?.();
  }

  stopKeepalive(): void {
    if (this.#timer) {
      clearInterval(this.#timer);
      this.#timer = null;
    }
  }

  get keepaliveRunning(): boolean {
    return this.#timer !== null;
  }

  #closePayload(): Buffer {
    const ctr = ++this.#ctr;
    const mac = this.#mac([ANCHOR_CLOSE_TAG, this.uid, le64(this.sid), le64(ctr)]);
    return Buffer.concat([le64(this.sid), le64(ctr), mac]);
  }

  #forget(): void {
    this.stopKeepalive();
    this.#closed = true;
    this.#key.fill(0);
  }

  /** Authenticated ANCHOR_CLOSE. The key is wiped whatever the device answers. */
  async close(): Promise<void> {
    if (this.#closed) {
      return;
    }
    const payload = this.#closePayload();
    this.#forget();
    const f = await this.#dev.request(T.ANCHOR_CLOSE, 1, payload);
    if (!f) {
      throw new AnchorAuthError("ANCHOR_CLOSE", "no-response");
    }
    if (f.payload[0] !== ANCHOR_STATUS.OK) {
      throw statusError("ANCHOR_CLOSE", f.payload);
    }
  }

  /**
   * Best-effort synchronous close for process exit, where nothing can be awaited: writes the
   * authenticated ANCHOR_CLOSE and does not wait for the answer. A device that misses it keeps
   * the session until it is replugged, which is the protocol's documented recovery.
   */
  closeSync(): void {
    if (this.#closed) {
      return;
    }
    const payload = this.#closePayload();
    this.#forget();
    try {
      this.#dev.sendNoWait?.(T.ANCHOR_CLOSE, payload);
    } catch {
      // exiting anyway; the replug recovery applies
    }
  }

  toJSON(): { sid: string; uid: string; counterAtOpen: string; open: boolean } {
    return {
      sid: this.sid.toString(),
      uid: this.uid.toString("hex"),
      counterAtOpen: this.counterAtOpen.toString(),
      open: !this.#closed,
    };
  }

  [inspect.custom](): string {
    return `AnchorSession { sid: ${this.sid}, open: ${!this.#closed} }`;
  }
}

function crc16(buf: Buffer): number {
  let crc = 0xffff;
  for (const b of buf) {
    crc ^= b << 8;
    for (let i = 0; i < 8; i++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc;
}
function encode(type: number, id: number, payload: Buffer = Buffer.alloc(0)): Buffer {
  const body = Buffer.from([
    0x01,
    type,
    id & 0xff,
    id >> 8,
    payload.length & 0xff,
    payload.length >> 8,
  ]);
  const b = Buffer.concat([body, payload]);
  const c = crc16(b);
  return Buffer.concat([Buffer.from([0xe2]), b, Buffer.from([c & 0xff, c >> 8])]);
}

/** Start of frame, and the only frame version there is. */
const SOF = 0xe2;
const PROTO_VER = 0x01;
/** The largest payload the device accepts or sends in one frame. */
export const MAX_PAYLOAD = 2048;
const MAX_RX_BUFFER = 4 * (9 + MAX_PAYLOAD);

interface Frame {
  type: number;
  id: number;
  payload: Buffer;
}

export const ACC_STATE = {
  BOOT: 0,
  SELFTEST: 1,
  PROVISION: 2,
  READY: 3,
  ATTESTED: 4,
  ZEROIZED: 5,
  FAULT: 6,
} as const;

/**
 * Errno codes a USB HID node reports when the device went away under the open descriptor: the
 * cable or hub re-enumerated it, or usbipd re-attached it to WSL. The device may be back on a
 * new node a moment later, so these are "gone for now", never by themselves a verdict.
 */
const DEVICE_GONE_ERRNO: ReadonlySet<string> = new Set(["ENODEV", "EIO", "ENOENT"]);

/** Why a request produced no answer: none arrived in time, or the node itself went away. */
export type DeviceTransientCode = "no-answer" | "gone";

/**
 * A request that got NO answer, as opposed to an answer that was wrong. The guard treats it as
 * transient (retry, reopen) within a fixed window; only a definite answer, or the window running
 * out, latches the hardware root DIRTY.
 */
export class DeviceTransientError extends Error {
  readonly code: DeviceTransientCode;
  constructor(code: DeviceTransientCode, message: string) {
    super(message);
    this.name = "DeviceTransientError";
    this.code = code;
  }
}

/** What a reopen after the node went away found. */
export type ReconnectOutcome =
  /** The same device (pinned key and uid) answered on a node: requests work again. */
  | { kind: "same"; path: string }
  /** A device answered, but not this one (another key or uid). */
  | { kind: "different"; path: string }
  /** No device answered on any Enclaweder node (yet). */
  | { kind: "absent" };

/** Options a test (or a platform without /dev) gives in place of the real scan and open. */
export interface EnclawederReopen {
  /** Every node that may now carry the device (default: listEnclawederPaths()). */
  scan?: () => string[];
  /** Open one node (default: openHid). */
  open?: (path: string) => HidTransport;
}

/** A transport for a node that went away: every use fails as ENODEV, until reconnect(). */
function goneTransport(): HidTransport {
  const gone = () => {
    const e = new Error("the Enclaweder's device node is gone") as NodeJS.ErrnoException;
    e.code = "ENODEV";
    throw e;
  };
  return { writeReport: gone, readReport: gone, close() {} };
}

export class Enclaweder {
  private hid: HidTransport;
  private buf: Buffer;
  private mid = 0; // last request id; see nextId()
  /** The key GET_IDENTITY reported, used to skip stray CHALLENGE answers (not a trust anchor). */
  private knownPub: Buffer | null = null;
  /** The uid GET_IDENTITY reported with it: together they pin the device for reconnect(). */
  private knownUid: Buffer | null = null;
  private lane: Promise<unknown> = Promise.resolve(); // serializes request(); see there
  /** The OS device path this driver opened (null for an injected transport). */
  private devPath: string | null;
  /** The node the device was last reached on: reconnect() tries it first. */
  private lastPath: string;
  private readonly reopen: Required<EnclawederReopen> | null;
  private reconnecting: Promise<ReconnectOutcome> | null = null;
  /**
   * `path` is whatever listEnclawederPaths() returned for this platform:
   * a /dev/hidraw* node on Linux, an opaque node-hid path elsewhere. A
   * transport may be injected directly for tests, with `reopen` standing in for the scan and
   * open reconnect() uses (an injected transport without it cannot be reopened).
   */
  constructor(path: string, transport?: HidTransport, reopen?: EnclawederReopen) {
    // No default path (finding H10): a device is opened only where detection or a pin named it.
    this.hid = transport ?? openHid(path);
    this.devPath = transport ? null : path;
    this.lastPath = path;
    this.reopen =
      transport && !reopen
        ? null
        : { scan: reopen?.scan ?? listEnclawederPaths, open: reopen?.open ?? openHid };
    this.buf = Buffer.alloc(0);
  }
  close(): void {
    this.hid.close();
  }

  /**
   * After the node went away (ENODEV / EIO / ENOENT): find the device again and reopen it.
   *
   * Every Enclaweder node the platform lists is tried, the last one first, and a node is kept
   * only when GET_IDENTITY on it reports the same key AND uid as this driver's last identity
   * answer. That answer is unsigned, so it is not the proof: the guard re-establishes
   * with a fresh signed latch read, which only the pinned device key can produce. Nothing here
   * clears or latches anything; it only says what it found. One reconnect at a time.
   */
  reconnect(): Promise<ReconnectOutcome> {
    this.reconnecting ??= this.reconnectNow().finally(() => {
      this.reconnecting = null;
    });
    return this.reconnecting;
  }

  private async reconnectNow(): Promise<ReconnectOutcome> {
    const pinPub = this.knownPub;
    const pinUid = this.knownUid;
    if (!this.reopen || !pinPub || !pinUid) {
      return { kind: "absent" }; // nothing to reopen with, or nothing pinned to compare against
    }
    try {
      this.hid.close();
    } catch {
      /* already gone */
    }
    this.hid = goneTransport();
    let scanned: string[] = [];
    try {
      scanned = this.reopen.scan();
    } catch {
      /* no node list right now: only the last path is tried */
    }
    const paths = [this.lastPath, ...scanned.filter((p) => p !== this.lastPath)];
    let different: string | null = null;
    for (const p of paths) {
      let t: HidTransport;
      try {
        t = this.reopen.open(p);
      } catch {
        continue; // not there (yet), refused, or held by another owner (one owner per node)
      }
      this.hid = t;
      this.buf = Buffer.alloc(0);
      let f: Frame | null = null;
      try {
        f = await this.request(T.GET_IDENTITY, 1);
      } catch {
        f = null;
      }
      const p0 = f?.payload;
      if (p0 && p0[0] === 0 && p0.length >= 46) {
        const uid = p0.subarray(1, 13);
        const pub = p0.subarray(13, 45);
        if (uid.equals(pinUid) && pub.equals(pinPub)) {
          this.lastPath = p;
          if (this.devPath !== null) {
            this.devPath = p;
          }
          return { kind: "same", path: p };
        }
        different ??= p;
      }
      try {
        t.close();
      } catch {
        /* closing a node we will not use */
      }
      this.hid = goneTransport();
    }
    return different ? { kind: "different", path: different } : { kind: "absent" };
  }
  /** Discard every report already pending on the node, and the receive buffer. */
  private drain(): void {
    const tmp = Buffer.alloc(64);
    for (let i = 0; i < 256 && this.hid.readReport(tmp) > 0; i++) {
      /* dropped: an answer nobody is waiting for */
    }
    this.buf = Buffer.alloc(0);
  }
  private writeFrame(frame: Buffer): void {
    for (let off = 0; off < frame.length; off += 64) {
      const chunk = frame.subarray(off, off + 64);
      const rep = Buffer.alloc(65); // report id 0 + 64-byte report
      chunk.copy(rep, 1);
      this.hid.writeReport(rep);
    }
  }
  /**
   * The next complete, well-formed frame in the receive buffer, or null (finding H8).
   *
   * A candidate starts at a SOF byte and must carry VER 1, a LEN no larger than the device's
   * largest payload and a matching CRC. Anything else is not a frame: the parser moves ONE byte
   * on and looks again, so a stray SOF in line noise, or in the tail of a late answer to an
   * earlier request, can no longer swallow the genuine answer behind it. A candidate whose
   * bytes have not all arrived yet is kept, but a complete valid frame AFTER it is still
   * returned (the candidate was noise, since frames never overlap).
   */
  private tryParse(): Frame | null {
    const b = this.buf;
    let keepFrom = -1; // earliest offset that may still begin a frame whose bytes are on the way
    for (let i = b.indexOf(SOF); i >= 0; i = b.indexOf(SOF, i + 1)) {
      if (b.length - i < 7) {
        if (keepFrom < 0) {
          keepFrom = i;
        }
        break;
      }
      if (b[i + 1] !== PROTO_VER) {
        continue;
      }
      const len = b[i + 5] | (b[i + 6] << 8);
      if (len > MAX_PAYLOAD) {
        continue;
      }
      if (b.length - i < 9 + len) {
        if (keepFrom < 0) {
          keepFrom = i;
        }
        continue;
      }
      const crcRx = b[i + 7 + len] | (b[i + 8 + len] << 8);
      if (crc16(b.subarray(i + 1, i + 7 + len)) !== crcRx) {
        continue; // not a frame: resync one byte on
      }
      const f: Frame = {
        type: b[i + 2],
        id: b[i + 3] | (b[i + 4] << 8),
        payload: Buffer.from(b.subarray(i + 7, i + 7 + len)),
      };
      this.buf = Buffer.from(b.subarray(i + 9 + len));
      return f;
    }
    this.buf = keepFrom < 0 ? Buffer.alloc(0) : Buffer.from(b.subarray(keepFrom));
    if (this.buf.length > MAX_RX_BUFFER) {
      this.buf = Buffer.from(this.buf.subarray(this.buf.length - MAX_RX_BUFFER));
    }
    return null;
  }
  /**
   * Message id: RANDOM, never the previous one (finding D1). Every reader of a hidraw node sees
   * every IN report, so a predictable id let another process on the host inject requests whose
   * answers matched ours (a stray CHALLENGE answer was then reported as a bad signature and
   * latched a genuine device DIRTY). The wire id is a u16; 0 is reserved for events.
   */
  private nextId(): number {
    let id: number;
    do {
      id = randomInt(1, 0x10000);
    } while (id === this.mid);
    this.mid = id;
    return id;
  }

  /**
   * Send one request and return ONLY its own response.
   *
   * This used to match on TYPE ALONE while every caller passed a hard-coded id, so two successive
   * challenge() calls were indistinguishable on the wire: if one timed out, its late response could
   * be handed to the NEXT request. For challenge that is not a benign glitch -- the caller verifies
   * the signature against the nonce IT sent, so a stale response is reported as a BAD SIGNATURE,
   * i.e. the tooling accuses genuine hardware of being counterfeit. Matters more with a fleet,
   * where several devices are driven concurrently.
   */
  async request(
    type: number,
    _idIgnored: number,
    payload: Buffer = Buffer.alloc(0),
    timeoutMs = 3000,
    accept?: (f: Frame) => boolean,
  ): Promise<Frame | null> {
    // One request on the wire at a time per device. The receive buffer below
    // is shared, and each request clears it, so two requests in flight at
    // once (a guard heartbeat and a signature, or two signatures) would drop
    // each other's responses, and a dropped challenge response latches a
    // genuine device DIRTY.
    const run = () => this.requestNow(type, payload, timeoutMs, accept);
    const next = this.lane.then(run, run);
    this.lane = next.catch(() => undefined);
    return next;
  }

  private async requestNow(
    type: number,
    payload: Buffer,
    timeoutMs: number,
    accept?: (f: Frame) => boolean,
  ): Promise<Frame | null> {
    try {
      return await this.requestIo(type, payload, timeoutMs, accept);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException)?.code;
      if (typeof code === "string" && DEVICE_GONE_ERRNO.has(code)) {
        // The node went away under us (USB re-enumeration, usbipd re-attach). Not a verdict:
        // the guard reopens it with reconnect() and proves the device again.
        this.hid = goneTransport();
        throw new DeviceTransientError("gone", `the Enclaweder's device node went away (${code})`);
      }
      throw err;
    }
  }

  private async requestIo(
    type: number,
    payload: Buffer,
    timeoutMs: number,
    accept?: (f: Frame) => boolean,
  ): Promise<Frame | null> {
    const id = this.nextId();
    // Drain what is already queued (late answers to earlier requests) before asking, so it
    // cannot be mistaken for this answer; anything late that arrives after is skipped by id
    // and by the parser's resync (finding H8).
    this.drain();
    this.writeFrame(encode(type, id, payload));
    const want = type | 0x80;
    const ours = (f: Frame) => f.type === want && f.id === id && (!accept || accept(f));
    // Monotonic deadline: a wall-clock step (NTP, or WSL's time sync, seen jumping 13 s on the
    // founder's host) must not time out a request the device is answering, which latches a
    // genuine device DIRTY.
    const end = performance.now() + timeoutMs;
    while (performance.now() < end) {
      const f = this.tryParse();
      if (f) {
        // A frame with our id that fails the caller's check (a stray answer to a request
        // someone else injected with the same id) is skipped, not returned (finding D1).
        if (ours(f)) {
          return f;
        } else {
          continue;
        } // skip unsolicited events and stale frames
      }
      const tmp = Buffer.alloc(64);
      const n = this.hid.readReport(tmp);
      if (n > 0) {
        this.buf = Buffer.concat([this.buf, tmp.subarray(0, n)]);
      } else {
        // Nothing pending (EAGAIN on hidraw, empty poll on node-hid).
        await sleep(2);
      }
    }
    // The deadline passed. If this process was stalled (a loaded host: a GPU model, WSL), the
    // device's answer may be sitting in the node right now, unread: read what is already there,
    // without waiting, before calling it "no answer". An answer that arrived counts.
    return this.lastLook(ours);
  }

  /** Every report already pending, parsed, without waiting: the answer `ours` accepts, or null. */
  private lastLook(ours: (f: Frame) => boolean): Frame | null {
    const tmp = Buffer.alloc(64);
    for (let i = 0; i < 256; i++) {
      for (let f = this.tryParse(); f; f = this.tryParse()) {
        if (ours(f)) {
          return f;
        }
      }
      const n = this.hid.readReport(tmp);
      if (n <= 0) {
        break;
      }
      this.buf = Buffer.concat([this.buf, tmp.subarray(0, n)]);
    }
    for (let f = this.tryParse(); f; f = this.tryParse()) {
      if (ours(f)) {
        return f;
      }
    }
    return null;
  }

  // ---- high-level ops used by the hardware-root guard ----
  async getIdentity(): Promise<Identity> {
    const f = await this.request(T.GET_IDENTITY, 1);
    if (!f) {
      throw new DeviceTransientError("no-answer", "the device did not answer the identity request");
    }
    const p = f.payload;
    // Validate before trusting a byte of it (finding H6): status OK and the full 46 bytes.
    if (p[0] !== 0 || p.length < 46) {
      throw new Error("the device rejected the identity request");
    }
    const uid = Buffer.from(p.subarray(1, 13));
    // reconnect() reopens only the device that last answered here (the guard compares that
    // answer to the key it bound, and a changed key is a verdict there, never a reconnect).
    this.knownPub = Buffer.from(p.subarray(13, 45));
    this.knownUid = Buffer.from(uid);
    return {
      uid,
      serial:
        usbDescriptorSerial(this.devPath, uid) ?? "ENCLW-" + uid.toString("hex").toUpperCase(),
      pubkeyRaw: Buffer.from(p.subarray(13, 45)),
      flags: p[45],
    };
  }
  async getStatus(): Promise<DeviceStatus> {
    const f = await this.request(T.GET_STATUS, 1);
    if (!f) {
      throw new DeviceTransientError("no-answer", "the device did not answer the status request");
    }
    const p = f.payload;
    if (p[0] !== 0 || p.length < 17 || p[1] > ACC_STATE.FAULT) {
      throw new Error("the device rejected the status request");
    }
    return {
      state: p[1],
      gate: p[2],
      k: p[3],
      n: p[4],
      nodesOnline: p[6],
      ledger: p[12] | (p[13] << 8) | (p[14] << 16) | (p[15] << 24),
      locked: p[16],
    };
  }
  /** Proof-of-possession: the device signs tag||nonce||uid with its private key. */
  async challenge(nonce32: Buffer): Promise<ChallengeResponse> {
    // Accept only an answer that is a well-formed OK or an explicit refusal: any other frame
    // carrying our id is not ours (finding D1).
    const pub = this.knownPub;
    const f = await this.request(T.CHALLENGE, 1, Buffer.from(nonce32), 3000, (fr) =>
      fr.payload[0] !== 0
        ? fr.payload.length === 1
        : fr.payload.length === 77 &&
          (!pub ||
            verifyChallenge(pub, nonce32, fr.payload.subarray(1, 13), fr.payload.subarray(13, 77))),
    );
    if (!f || f.payload[0] !== 0) {
      throw new Error(
        f?.payload[0] === 9
          ? "the device refused the key check: its halt state is set"
          : "the device rejected the key check",
      );
    }
    const p = f.payload;
    return {
      uid: Buffer.from(p.subarray(1, 13)),
      sig: Buffer.from(p.subarray(13, 77)),
    };
  }
  /**
   * Open the one authenticated anchor session (ANCHOR_OPEN). `devicePubRaw` must be the key
   * certified by the birth certificate. Throws AnchorAuthError with code "busy" when another
   * session holds the channel: raise that as an alarm, never retry over it.
   */
  async anchorOpen(
    devicePubRaw: Buffer,
    timeoutMs = ANCHOR_OPEN_TIMEOUT_MS,
  ): Promise<AnchorSession> {
    return AnchorSession.open(this, devicePubRaw, timeoutMs);
  }

  /**
   * ANCHOR_OPEN_BOUND (command set 0.5): the anchor session bound to this launch's activation; see
   * AnchorSession.openBound. On a direct device the request travels as an OUT report, which no
   * other process on the host reads.
   */
  async anchorOpenBound(
    devicePubRaw: Buffer,
    activationNonce: Buffer,
    timeoutMs = ANCHOR_OPEN_TIMEOUT_MS,
  ): Promise<AnchorSession> {
    return AnchorSession.openBound(this, devicePubRaw, activationNonce, { timeoutMs });
  }

  /**
   * ANCHOR_READ (command set 0.5): the device's current anchor, signed over `nonce32` (the
   * caller's own). Returns the raw answer for activation.ts verifyAnchorRead; a one-byte
   * ERR_UNSUPPORTED (8) means firmware before command set 0.5.
   */
  async anchorRead(nonce32: Buffer): Promise<Buffer> {
    if (nonce32.length !== 32) {
      throw new Error("audit anchor: a read nonce is 32 bytes");
    }
    const f = await this.request(T.ANCHOR_READ, 1, nonce32);
    if (!f) {
      throw new Error("the device did not answer the audit-anchor read");
    }
    return f.payload;
  }

  /**
   * Record a new audit-log head and advance the device's counter, under `session`.
   *
   * The counter is NOT a parameter -- it belongs to the device. A host that could
   * choose it could replay an old one and undo the only protection this provides.
   * The session is required: since record v2 the device refuses a bare head (ERR_AUTH),
   * because anything able to open the HID node could otherwise anchor a fabricated log.
   */
  async anchorSet(head32: Buffer, session: AnchorSession): Promise<AnchorResponse> {
    if (!(session instanceof AnchorSession) || session.device !== this) {
      throw new Error("audit anchor: requires an anchor session opened on this device");
    }
    return session.set(head32);
  }

  /** ANCHOR_KEEPALIVE under `session` (command set 0.2). Returns the lease granted, in ms. */
  async anchorKeepalive(session: AnchorSession): Promise<number> {
    if (!(session instanceof AnchorSession) || session.device !== this) {
      throw new Error("audit anchor: requires an anchor session opened on this device");
    }
    return session.keepalive();
  }

  /**
   * Operator-quorum takeover of the anchor channel (command set 0.2); see AnchorSession.takeover.
   * The recovery for a BUSY alarm that cannot wait out the holder's lease.
   */
  async anchorTakeover(
    devicePubRaw: Buffer,
    uid: Buffer,
    signers: OperatorSigner[],
    timeoutMs = ANCHOR_OPEN_TIMEOUT_MS,
  ): Promise<AnchorSession> {
    return AnchorSession.takeover(this, devicePubRaw, uid, signers, timeoutMs);
  }

  /** Authenticated ANCHOR_CLOSE of `session`. */
  async anchorClose(session: AnchorSession): Promise<void> {
    if (!(session instanceof AnchorSession) || session.device !== this) {
      throw new Error("audit anchor: requires an anchor session opened on this device");
    }
    await session.close();
  }

  /** Write one request and do not wait for its answer (anchor close at process exit only). */
  sendNoWait(type: number, payload: Buffer): void {
    this.writeFrame(encode(type, this.nextId(), payload));
  }

  /**
   * Read the current anchor without advancing it.
   *
   * Verification must not mutate the state it is checking, which is why this is a
   * separate opcode. Returns null when the device has never anchored -- deliberately
   * distinct from a counter of zero.
   */
  async anchorGet(): Promise<AnchorResponse | null> {
    const f = await this.request(T.ANCHOR_GET, 1);
    if (!f) {
      throw new Error("the device did not answer the audit-anchor read");
    }
    if (f.payload[0] === 3) {
      return null; // ERR_NOT_ENROLLED: never anchored
    }
    if (f.payload[0] !== 0) {
      throw new Error("the device rejected the audit-anchor read");
    }
    return parseAnchor(f.payload);
  }

  /** Fetch the on-device birth certificate (opaque 119B blob). null if the device has none. */
  async getCert(): Promise<Buffer | null> {
    const f = await this.request(T.GET_CERT, 1);
    if (!f || f.payload.length < 3 || f.payload[0] !== 0) {
      return null;
    }
    const p = f.payload;
    const n = p[1] | (p[2] << 8);
    if (n <= 0 || p.length < 3 + n) {
      return null;
    }
    return Buffer.from(p.subarray(3, 3 + n));
  }
}
