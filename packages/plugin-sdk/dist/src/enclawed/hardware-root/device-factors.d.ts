import type { LatchFrameDevice, SecondFactor } from "./device-latch.js";
import { type DeviceTotpFailure, type VerdictBody } from "./totp-verify.js";
export declare const CS04: {
    readonly STREAM_ENTROPY: 9;
    readonly FIDO_CHALLENGE: 39;
    readonly TOTP_VERIFY: 45;
    readonly FACTOR_TAKEOVER: 47;
    readonly UNLOCK_GRANT: 48;
    readonly UNLOCK_USE: 49;
    readonly UNLOCK_GET: 50;
    readonly UNLOCK_REVOKE: 51;
    readonly IDLOG_GET: 52;
    readonly SEAL_OPEN: 53;
    readonly SEALED: 54;
};
export type FactorFailure = "unsupported" | "malformed" | "no-session" | "not-enrolled" | "locked" | "backoff" | "rejected" | "clock-disagrees" | "no-grant" | "mismatch" | "zeroized" | "bad-signature" | "bad-record" | "seal-refused" | "use-refused" | "sealed-required" | "no-response" | "device-error";
/**
 * Forwards one SEAL_OPEN (0x35) or SEALED (0x36) request to the device and returns the device's
 * raw response payload. The broker implements it for its clients; it only moves bytes.
 */
export type SealRelay = (type: 0x35 | 0x36, payload: Buffer) => Promise<Buffer>;
/** How a factor-carrying request reaches the device: directly, or sealed through a relay. */
export type FactorTransport = {
    kind: "direct";
    dev: LatchFrameDevice;
} | {
    kind: "sealed";
    relay: SealRelay;
};
/** One open seal: both keys exist only in this object and are wiped after its single use. */
export type OpenSeal = {
    id: bigint;
    uid: Buffer;
    kEnc: Buffer;
    kMac: Buffer;
};
/** Opens a seal: a fresh X25519 exchange with the device, verified against its certified key. */
export declare function openSeal(relay: SealRelay, devicePubRaw: Buffer, uid: Buffer): Promise<OpenSeal>;
/** The sealed frame for `op` carrying `inner` (that operation's plaintext request). Wipes the seal's keys. */
export declare function sealFrame(s: OpenSeal, op: number, inner: Buffer): Buffer;
export declare class FactorError extends Error {
    /** The device operation that failed (developer detail; not part of the message). */
    readonly op: string;
    readonly code: FactorFailure;
    readonly waitMs: number | null;
    constructor(op: string, code: FactorFailure, waitMs?: number | null);
}
/** An authenticator-code verdict sealed to the device through a relay, checked as deviceTotpVerify does. */
export declare function sealedTotpVerdict(relay: SealRelay, devicePubRaw: Buffer, uid: Buffer, p: {
    code: string;
    purpose: string;
    nonce?: Buffer;
    nowS?: number;
}): Promise<{
    ok: true;
    body: VerdictBody;
    rawBody: Buffer;
    sig: Buffer;
    nonce: Buffer;
} | {
    ok: false;
    code: DeviceTotpFailure | FactorFailure;
    waitMs?: number;
}>;
export type TakeoverChannel = "latch" | "anchor";
/** A session obtained by a takeover: its id, and keepalive / close under its key. */
export declare class TakenSession {
    #private;
    readonly channel: TakeoverChannel;
    readonly sid: bigint;
    /** The audit counter at the open (anchor channel); 0n for the latch channel. */
    readonly counter: bigint;
    readonly uid: Buffer;
    constructor(channel: TakeoverChannel, sid: bigint, counter: bigint, uid: Buffer, key: Buffer, dev: LatchFrameDevice | null);
    /** The next authenticated request body `sid | ctr | HMAC(K, tag | uid | sid | ctr)`. */
    authed(kind: "keepalive" | "close"): Buffer;
    keepalive(): Promise<void>;
    close(): Promise<void>;
}
/** The FIDO2 challenge for a takeover (purpose 2), and the registered credential id. */
export declare function takeoverFidoChallenge(dev: LatchFrameDevice): Promise<{
    clientDataHash: Buffer;
    counter: number;
    credentialId: Buffer;
}>;
/**
 * Takeover: end the live session on `channel` and open this host's in its place, authorised
 * by both of the person's factors (the device's two-factor rules: one-time recovery code, failure
 * counter, backoff, lockout). Never on a set latch, never while the two-factor path is locked, and
 * never a latch clear. Throws FactorError with the device's refusal; a refused attempt that the
 * device evaluated is counted on the device. `recoveryCode` is wiped.
 */
export declare function takeoverByFactors(t: FactorTransport, devicePubRaw: Buffer, uid: Buffer, p: {
    channel: TakeoverChannel;
    recoveryCode: Buffer;
    factor: SecondFactor;
}): Promise<TakenSession>;
/** One grant covers at most this many uses (the device's full unsigned 16-bit count). */
export declare const UNLOCK_USES_MAX = 65535;
export declare const UNLOCK_LEASE_MIN_S = 30;
/** And lasts at most 36 h. */
export declare const UNLOCK_LEASE_MAX_S = 129600;
export declare const TAG_UNLOCK_GRANT: Buffer<ArrayBuffer>;
export declare const TAG_UNLOCK_USE: Buffer<ArrayBuffer>;
export declare const TAG_UNLOCK_STATE: Buffer<ArrayBuffer>;
declare const UNLOCK_STATE: readonly ["none", "active", "exhausted", "expired", "revoked", "reset"];
declare const UNLOCK_WHY: readonly ["", "host", "latch", "zeroize", "replaced"];
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
export declare function parseUnlockBody(b: Buffer): UnlockBody;
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
/**
 * Unlock grant: the person's current authenticator code (6 digits) buys a grant of `uses` uses
 * (1..65 535) inside `leaseS` seconds (30..129 600, 36 h), for `scope` (32 bytes: what is being
 * unlocked). Each use's host time is checked by the device, not here.
 * Send it `{ kind: "sealed", relay }` when another process owns the device, so the code never
 * crosses that process in the clear.
 */
export declare function grantUnlock(t: FactorTransport, devicePubRaw: Buffer, uid: Buffer, p: {
    code: string;
    uses: number;
    leaseS: number;
    scope: Buffer;
    hostTimeS?: number;
}): Promise<{
    ok: true;
    grant: UnlockBody;
    record: UnlockRecord;
} | {
    ok: false;
    code: FactorFailure;
    waitMs?: number;
}>;
/**
 * Unlock use: spend ONE use of grant `gid` on the device; returns the receipt the device signed
 * over this call's fresh nonce. No receipt means no use: never act on an unlock without one.
 */
export declare function spendUnlock(dev: LatchFrameDevice, devicePubRaw: Buffer, uid: Buffer, p: {
    gid: bigint;
    scope: Buffer;
    hostTimeS?: number;
    nonce?: Buffer;
}): Promise<{
    ok: true;
    receipt: UnlockBody;
    record: UnlockRecord;
} | {
    ok: false;
    code: FactorFailure;
    state?: UnlockBody;
}>;
/** The grant's state, signed over a fresh nonce. */
export declare function readUnlock(dev: LatchFrameDevice, devicePubRaw: Buffer, uid: Buffer): Promise<UnlockBody>;
/** Ends grant `gid` (0n = whatever is live). Returns the signed state after. */
export declare function revokeUnlock(dev: LatchFrameDevice, devicePubRaw: Buffer, uid: Buffer, gid?: bigint): Promise<UnlockBody>;
/**
 * Verifies a receipt offline: signed by `devicePubRaw` under the use tag over `nonce` (the
 * verifier's own), for `uid` and `scope`, with a host time within `skewS` of `nowS`. Returns the
 * body, or null. A verifier must also refuse a (boot, gid, useIndex) it has already seen.
 */
export declare function verifyUnlockReceipt(rec: UnlockRecord, expect: {
    pubkeyRaw: Buffer;
    uid: Buffer;
    nonce: Buffer;
    scope: Buffer;
    nowS?: number;
    skewS?: number;
}): UnlockBody | null;
export declare const TAG_IDENTITY_LOG: Buffer<ArrayBuffer>;
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
/** The device's identity events (newest first) and its boot counter, signed over a fresh nonce. */
export declare function readIdentityLog(dev: LatchFrameDevice, devicePubRaw: Buffer, uid: Buffer): Promise<{
    boot: bigint;
    total: bigint;
    events: IdentityEvent[];
}>;
/** Checks one identity-log answer against the nonce that was sent and the certified key. */
export declare function parseIdentityLog(p: Buffer, nonce: Buffer, devicePubRaw: Buffer, uid: Buffer): {
    boot: bigint;
    total: bigint;
    events: IdentityEvent[];
};
/** SHA3-256(pubkey)[0..8]: how a MINT event names the key it minted. */
export declare function identityFingerprint(pubkeyRaw: Buffer): Buffer;
/** Most bytes one extra-entropy read asks for. */
export declare const DEVICE_ENTROPY_MAX = 256;
/** `n` (1..256) bytes of optional extra entropy from the hardware root: mix them in, never use them alone. */
export declare function readDeviceEntropy(dev: LatchFrameDevice, n: number, timeoutMs?: number): Promise<Buffer>;
/** Constant-time compare for callers checking a scope or nonce they hold. */
export declare function sameBytes(a: Buffer, b: Buffer): boolean;
export {};
