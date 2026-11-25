import { inspect } from "node:util";
import { type HidTransport } from "./hid-transport.js";
/**
 * A Pro unit enumerates as ECPRO-, so render the serial the device itself reports in its USB
 * descriptor (Linux sysfs metadata only, no device I/O).
 * Null when unreadable (other platforms, an injected transport) or when it does not carry this
 * unit's UID; callers then fall back to the base rendering. Cosmetic and unauthenticated: never
 * gate on it.
 */
export declare function usbDescriptorSerial(devPath: string | null, uid: Buffer): string | null;
export declare const ANCHOR_TAG_V3: Buffer<ArrayBuffer>;
export declare const ANCHOR_OPEN_BOUND_TAG: Buffer<ArrayBuffer>;
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
export declare function findAllEnclaweders(): string[];
export declare function findEnclaweder(): string | null;
/** raw Ed25519 public key (32 bytes) -> SPKI PEM (so Node crypto + enclawed can use it). */
export declare function rawEd25519ToPem(raw32: Buffer): string;
/** Verify a proof-of-possession challenge response against the device's raw public key. */
export declare function verifyChallenge(pubkeyRaw: Buffer, nonce32: Buffer, uid12: Buffer, sig64: Buffer): boolean;
/** Verify a device-signed audit anchor (record v1) against the device's raw public key.
 *  Kept for anchors stored before the firmware moved to record v2. */
export declare function verifyAnchor(pubkeyRaw: Buffer, counter: bigint, head32: Buffer, uid12: Buffer, sig64: Buffer): boolean;
/** Verify a device-signed record v2 (authenticated anchoring) against the device's raw key. */
export declare function verifyAnchorV2(pubkeyRaw: Buffer, counter: bigint, head32: Buffer, uid12: Buffer, sess: bigint, opens: bigint, sig64: Buffer): boolean;
/** Verify a device-signed record v3 (a bound session, command set 0.5) against the device's raw key. */
export declare function verifyAnchorV3(pubkeyRaw: Buffer, counter: bigint, head32: Buffer, uid12: Buffer, sess: bigint, opens: bigint, bind32: Buffer, sig64: Buffer): boolean;
/**
 * Verify an anchor record of either version. A record without `version` (written by code that
 * predates record v2) is a v1 record. The two signature tags differ, so neither version's
 * signature can be passed off as the other's.
 */
export declare function verifyAnchorRecord(pubkeyRaw: Buffer, a: Pick<AnchorResponse, "counter" | "head" | "uid" | "sig"> & Partial<Pick<AnchorResponse, "version" | "sess" | "opens" | "bind">>): boolean;
/** Pinned manufacturer root public key (Ed25519, raw 32B). PUBLIC -- safe to embed. This is the trust
 *  anchor: a genuine enclaweder carries a birth certificate signed by the matching root PRIVATE key
 *  (kept offline). Its root_id (first 4B of SHA-256) is 5cc8040c. Override via the guard only for testing or a different manufacturer root. */
export declare const ENCLAWEDER_ROOT_PUBKEY: Buffer<ArrayBuffer>;
/** Enclaweder Pro manufacturer root. Pro is a SEPARATE TRUST DOMAIN, not a flag on the base line:
 *  a Pro unit is signed by its own root, so the authenticated model field -- never the USB serial
 *  prefix -- is the thing to gate on. */
export declare const ENCLAWEDER_ROOT_PUBKEY_PRO: Buffer<ArrayBuffer>;
export type EnclawederSku = "base" | "pro";
/** The pinned trust domains. `model` is the ONLY model each root is permitted to have issued, so a
 *  cert claiming model=2 while signed by the base root is rejected even though its signature is
 *  valid -- that combination is exactly the "base unit presented as Pro" forgery the separate-domain
 *  design exists to stop. */
export declare const ENCLAWEDER_DOMAINS: Array<{
    name: EnclawederSku;
    model: number;
    pub: Buffer;
}>;
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
/**
 * Verify a device birth certificate (119B) and bind it to a device:
 * it must (a) chain to the pinned manufacturer root, and (b) certify THIS exact device's uid + key.
 * Returns the parsed cert, or null if anything fails. Requiring this at bind time turns "a device is
 * present" into "a MANUFACTURER-CERTIFIED device is present": a zeroized/re-minted or counterfeit unit
 * passes challenge-response (it holds its own key) but has no root-signed cert for that key.
 */
export declare function verifyCert(cert: Buffer, deviceUid: Buffer, devicePubRaw: Buffer, rootPubRaw?: Buffer | null): DeviceCert | null;
/**
 * Parse a signed anchor record, either version, told apart by length AND the version byte
 * (Enclaweder wire protocol):
 *   v2  status(1) ver=2(1) counter(8 LE) head(32) uid(12) sess(8 LE) opens(8 LE) sig(64)  134 B
 *   v1  status(1) counter(8 LE) head(32) uid(12) sig(64)                                117 B
 */
export declare function parseAnchor(p: Buffer): AnchorResponse;
/** Device status codes the anchor commands return. */
export declare const ANCHOR_STATUS: {
    readonly OK: 0;
    readonly BAD_ARG: 1;
    readonly BAD_STATE: 2;
    readonly NOT_ENROLLED: 3;
    readonly AUTH: 5;
    readonly BUSY: 7;
    readonly UNSUPPORTED: 8;
};
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
export type AnchorErrorCode = "busy" | "auth" | "unsupported" | "rejected" | "no-response" | "bad-signature" | "bad-record" | "closed";
export type AnchorOp = "ANCHOR_OPEN" | "ANCHOR_SET" | "ANCHOR_CLOSE" | "ANCHOR_KEEPALIVE" | "AUTH_CHALLENGE";
export declare class AnchorAuthError extends Error {
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
    constructor(op: AnchorOp, code: AnchorErrorCode, status?: number | null, waitMs?: number | null);
}
/** `07 | wait_ms(4 LE)` -> wait_ms; null for a bare status (firmware 0.1) or another status. */
export declare function busyWaitMs(p: Buffer): number | null;
/** The slice of the device an anchor session needs: the serialized, id-matched request(). */
export type AnchorFrameDevice = {
    request(type: number, id: number, payload?: Buffer, timeoutMs?: number): Promise<{
        payload: Buffer;
    } | null>;
    /** Write one request without waiting for its answer; used only to close at process exit. */
    sendNoWait?(type: number, payload: Buffer): void;
};
/** How long to wait for the device to answer ANCHOR_OPEN (allow up to 10 s). */
export declare const ANCHOR_OPEN_TIMEOUT_MS = 10000;
/** Command set 0.2: a session ends by itself this long after its open or last accepted
 *  SET / KEEPALIVE (set by the device; KEEPALIVE reports the lease actually granted). */
export declare const ANCHOR_LEASE_MS = 120000;
/** How often a holder renews: well inside the lease, so a missed beat or two does not lose it. */
export declare const ANCHOR_KEEPALIVE_INTERVAL_MS = 30000;
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
export declare class AnchorSession {
    #private;
    readonly sid: bigint;
    readonly uid: Buffer;
    /** The device's anchor counter when the session opened. */
    readonly counterAtOpen: bigint;
    /**
     * Command set 0.5: the activation binding the device wrote into this session (a bound open), or
     * null for an unbound session. Every record of a bound session is v3 and carries it.
     */
    readonly binding: Buffer | null;
    private constructor();
    /** The device this session was opened on. */
    get device(): AnchorFrameDevice;
    get isOpen(): boolean;
    /**
     * ANCHOR_OPEN, verified against the CERTIFIED device key (`devicePubRaw`, already checked
     * against the birth certificate). Throws AnchorAuthError; code "busy" means something else
     * on this host holds the anchor session and must be raised as an alarm, not retried. Its
     * `waitMs` (command set 0.2) is when that holder's lease ends if it stops renewing; null on
     * firmware 0.1, where only a replug frees the channel.
     */
    static open(dev: AnchorFrameDevice, devicePubRaw: Buffer, timeoutMs?: number): Promise<AnchorSession>;
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
    static openBound(dev: AnchorFrameDevice, devicePubRaw: Buffer, activationNonce: Buffer, opts?: {
        timeoutMs?: number;
        send?: (request: Buffer) => Promise<Buffer | null>;
    }): Promise<AnchorSession>;
    /**
     * Operator takeover (command set 0.2): ANCHOR_OPEN carrying an M-of-N operator authorisation,
     * which ends a live session (its holder's next request is ERR_AUTH) and opens this one in its
     * place. `uid` is the device uid from GET_IDENTITY. Each signer signs
     * "ECW-OPER-AUTH-01" | nonce | 0x19 | uid | host_pub | host_nonce over a fresh AUTH_CHALLENGE
     * nonce, so an authorisation opens only the session for the key pair it was issued to.
     * ERR_AUTH (code "auth") = the quorum did not verify, or no operator key is installed.
     */
    static takeover(dev: AnchorFrameDevice, devicePubRaw: Buffer, uid: Buffer, signers: OperatorSigner[], timeoutMs?: number): Promise<AnchorSession>;
    /**
     * ANCHOR_SET under this session. Returns the record, verified and checked to be ours: v2 for an
     * unbound session, v3 carrying exactly this session's binding for a bound one.
     */
    set(head32: Buffer): Promise<AnchorResponse>;
    /**
     * ANCHOR_KEEPALIVE (command set 0.2): renew the lease without anchoring. Returns the lease
     * granted, in ms. Shares the request counter with SET and CLOSE; request() is FIFO per
     * device and the counter is taken synchronously, so they reach the device in counter order.
     */
    keepalive(): Promise<number>;
    /**
     * Keep the session alive while the process is: a KEEPALIVE every `intervalMs`. The timer is
     * unref()'d, so it never holds the process open; a crashed process stops renewing and the
     * device frees the channel one lease later. On the first failure the timer stops and
     * `onLost` is called once (the session expired, was taken over, or the device is gone) --
     * except "unsupported": firmware 0.1 has no lease to renew, so it stops silently.
     * Idempotent while running; cleared when the session is closed.
     */
    startKeepalive(intervalMs?: number, onLost?: (err: AnchorAuthError | Error) => void): void;
    stopKeepalive(): void;
    get keepaliveRunning(): boolean;
    /** Authenticated ANCHOR_CLOSE. The key is wiped whatever the device answers. */
    close(): Promise<void>;
    /**
     * Best-effort synchronous close for process exit, where nothing can be awaited: writes the
     * authenticated ANCHOR_CLOSE and does not wait for the answer. A device that misses it keeps
     * the session until it is replugged, which is the protocol's documented recovery.
     */
    closeSync(): void;
    toJSON(): {
        sid: string;
        uid: string;
        counterAtOpen: string;
        open: boolean;
    };
    [inspect.custom](): string;
}
/** The largest payload the device accepts or sends in one frame. */
export declare const MAX_PAYLOAD = 2048;
interface Frame {
    type: number;
    id: number;
    payload: Buffer;
}
export declare const ACC_STATE: {
    readonly BOOT: 0;
    readonly SELFTEST: 1;
    readonly PROVISION: 2;
    readonly READY: 3;
    readonly ATTESTED: 4;
    readonly ZEROIZED: 5;
    readonly FAULT: 6;
};
export declare class Enclaweder {
    private hid;
    private buf;
    private mid;
    /** The key GET_IDENTITY reported, used to skip stray CHALLENGE answers (not a trust anchor). */
    private knownPub;
    private lane;
    /** The OS device path this driver opened (null for an injected transport). */
    private readonly devPath;
    /**
     * `path` is whatever listEnclawederPaths() returned for this platform:
     * a /dev/hidraw* node on Linux, an opaque node-hid path elsewhere. A
     * transport may be injected directly for tests.
     */
    constructor(path: string, transport?: HidTransport);
    close(): void;
    /** Discard every report already pending on the node, and the receive buffer. */
    private drain;
    private writeFrame;
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
    private tryParse;
    /**
     * Message id: RANDOM, never the previous one (finding D1). Every reader of a hidraw node sees
     * every IN report, so a predictable id let another process on the host inject requests whose
     * answers matched ours (a stray CHALLENGE answer was then reported as a bad signature and
     * latched a genuine device DIRTY). The wire id is a u16; 0 is reserved for events.
     */
    private nextId;
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
    request(type: number, _idIgnored: number, payload?: Buffer, timeoutMs?: number, accept?: (f: Frame) => boolean): Promise<Frame | null>;
    private requestNow;
    getIdentity(): Promise<Identity>;
    getStatus(): Promise<DeviceStatus>;
    /** Proof-of-possession: the device signs tag||nonce||uid with its private key. */
    challenge(nonce32: Buffer): Promise<ChallengeResponse>;
    /**
     * Open the one authenticated anchor session (ANCHOR_OPEN). `devicePubRaw` must be the key
     * certified by the birth certificate. Throws AnchorAuthError with code "busy" when another
     * session holds the channel: raise that as an alarm, never retry over it.
     */
    anchorOpen(devicePubRaw: Buffer, timeoutMs?: number): Promise<AnchorSession>;
    /**
     * ANCHOR_OPEN_BOUND (command set 0.5): the anchor session bound to this launch's activation; see
     * AnchorSession.openBound. On a direct device the request travels as an OUT report, which no
     * other process on the host reads.
     */
    anchorOpenBound(devicePubRaw: Buffer, activationNonce: Buffer, timeoutMs?: number): Promise<AnchorSession>;
    /**
     * ANCHOR_READ (command set 0.5): the device's current anchor, signed over `nonce32` (the
     * caller's own). Returns the raw answer for activation.ts verifyAnchorRead; a one-byte
     * ERR_UNSUPPORTED (8) means firmware before command set 0.5.
     */
    anchorRead(nonce32: Buffer): Promise<Buffer>;
    /**
     * Record a new audit-log head and advance the device's counter, under `session`.
     *
     * The counter is NOT a parameter -- it belongs to the device. A host that could
     * choose it could replay an old one and undo the only protection this provides.
     * The session is required: since record v2 the device refuses a bare head (ERR_AUTH),
     * because anything able to open the HID node could otherwise anchor a fabricated log.
     */
    anchorSet(head32: Buffer, session: AnchorSession): Promise<AnchorResponse>;
    /** ANCHOR_KEEPALIVE under `session` (command set 0.2). Returns the lease granted, in ms. */
    anchorKeepalive(session: AnchorSession): Promise<number>;
    /**
     * Operator-quorum takeover of the anchor channel (command set 0.2); see AnchorSession.takeover.
     * The recovery for a BUSY alarm that cannot wait out the holder's lease.
     */
    anchorTakeover(devicePubRaw: Buffer, uid: Buffer, signers: OperatorSigner[], timeoutMs?: number): Promise<AnchorSession>;
    /** Authenticated ANCHOR_CLOSE of `session`. */
    anchorClose(session: AnchorSession): Promise<void>;
    /** Write one request and do not wait for its answer (anchor close at process exit only). */
    sendNoWait(type: number, payload: Buffer): void;
    /**
     * Read the current anchor without advancing it.
     *
     * Verification must not mutate the state it is checking, which is why this is a
     * separate opcode. Returns null when the device has never anchored -- deliberately
     * distinct from a counter of zero.
     */
    anchorGet(): Promise<AnchorResponse | null>;
    /** Fetch the on-device birth certificate (opaque 119B blob). null if the device has none. */
    getCert(): Promise<Buffer | null>;
}
export {};
