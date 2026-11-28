import { type OperatorSigner } from "./enclaweder-hid.js";
export declare const LT: {
    readonly AUTH_CHALLENGE: 18;
    readonly LATCH_GET: 28;
    readonly LATCH_HALT: 29;
    readonly LATCH_OPEN: 30;
    readonly LATCH_KEEPALIVE: 31;
    readonly LATCH_CLOSE: 32;
    readonly LATCH_CLEAR: 33;
    readonly LATCH_CLEAR_2FA: 34;
    readonly REISSUE_RECOVERY: 35;
    readonly LATCH_LOG: 36;
    readonly OPERATOR_HANDOVER: 37;
    readonly CUSTODY_GET: 38;
    readonly FIDO_CHALLENGE: 39;
    readonly SET_HOST_TIME: 40;
    readonly FAILLOG_GET: 41;
    readonly LATCH_CHECKPOINT: 44;
};
/** Lease the device grants a latch session; keep refreshing well inside it. */
export declare const LATCH_LEASE_MS = 120000;
export declare const LATCH_KEEPALIVE_INTERVAL_MS = 30000;
/** Host sub-reason codes sent in LATCH_HALT (opaque to the device; for the operator's eyes). */
export declare const HOST_HALT_CODE: {
    readonly GUARD_CHECK_FAILED: 1;
    readonly HOST_MIRROR: 16;
    readonly DISCONNECT_SEEN: 17;
    readonly OPERATOR_REQUEST: 32;
};
export declare const LATCH_REASON: Record<number, string>;
/** The frame-level slice of the device this needs (Enclaweder satisfies it). */
export type LatchFrameDevice = {
    request(type: number, id: number, payload?: Buffer, timeoutMs?: number): Promise<{
        payload: Buffer;
    } | null>;
    sendNoWait?(type: number, payload: Buffer): void;
};
export type LatchErrorCode = "unsupported" | "no-response" | "bad-signature" | "bad-record" | "locked" | "busy" | "auth" | "not-enrolled" | "bad-state" | "clock-disagrees" | "rejected";
export declare class DeviceLatchError extends Error {
    /** The device command that failed (developer detail; not part of the message). */
    readonly op: string;
    readonly code: LatchErrorCode;
    readonly status: number | null;
    readonly waitMs: number | null;
    constructor(op: string, code: LatchErrorCode, status?: number | null, waitMs?: number | null);
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
export declare function parseDeviceLatch(p: Buffer, nonce: Buffer, devicePubRaw: Buffer, uid: Buffer | null): DeviceLatchState;
/** LATCH_GET with a fresh nonce. Throws DeviceLatchError("unsupported") on firmware < 0.3. */
export declare function readDeviceLatch(dev: LatchFrameDevice, devicePubRaw: Buffer, uid: Buffer | null, timeoutMs?: number): Promise<DeviceLatchState>;
/**
 * LATCH_GET over a caller's nonce, answer unverified (the broker relays it to clients, who
 * verify it themselves against the certified key; finding H1). Throws only when nothing came.
 */
export declare function latchGetRaw(dev: LatchFrameDevice, nonce32: Buffer, timeoutMs?: number): Promise<Buffer>;
/** Set the device latch with no session (set-only; always allowed). Idempotent. */
export declare function haltDeviceAnonymous(dev: LatchFrameDevice, hostCode: number): Promise<void>;
/**
 * The guard's host session ("dirty on start"). One per device; a second open is ERR_BUSY.
 * K is derived from an X25519 exchange signed by the certified device key and lives only in a
 * private field.
 */
export declare class LatchSession {
    #private;
    readonly sid: bigint;
    readonly uid: Buffer;
    private constructor();
    get isOpen(): boolean;
    static open(dev: LatchFrameDevice, devicePubRaw: Buffer, timeoutMs?: number): Promise<LatchSession>;
    /** Renew the lease. Returns the lease granted (ms). */
    keepalive(): Promise<number>;
    /** Set the device latch under this session (reason HOST_HALT, `hostCode` recorded). */
    halt(hostCode: number): Promise<void>;
    /** A journal checkpoint the device signs for this session only (finding H2). */
    checkpoint(head32: Buffer): Promise<{
        uid: Buffer;
        sid: bigint;
        ck: bigint;
        sig: Buffer;
    }>;
    /** The clean close: the only thing that disarms the device's dirty-on-start flag. */
    close(): Promise<void>;
    /** Best effort at process exit, when nothing can be awaited. */
    closeSync(): void;
    startKeepalive(intervalMs: number, onLost: (err: Error) => void): void;
}
/** Verify a journal checkpoint signature (finding H2). */
export declare function verifyJournalCheckpoint(devicePubRaw: Buffer, uid: Buffer, sid: bigint, ck: bigint, head32: Buffer, sig: Buffer): boolean;
/** The operator-quorum message for one AUTH_CHALLENGE nonce: what each operator signs. */
export declare function operatorAuthMessage(nonce16: Buffer, cmd: number, uid: Buffer, args: Buffer): Buffer;
/**
 * Custodial clear by the operator quorum (lost factors). The signers see the exact message (the
 * AUTH_CHALLENGE nonce, LATCH_CLEAR, this uid, the current latch seq) and should be off-host:
 * hardware tokens, an air-gapped station, or a key on removable media.
 */
export declare function clearByOperatorQuorum(dev: LatchFrameDevice, devicePubRaw: Buffer, uid: Buffer, signers: OperatorSigner[]): Promise<bigint>;
export type SecondFactor = {
    kind: "totp";
    code: number;
    hostTimeS: number;
} | {
    kind: "fido2";
    authenticatorData: Buffer;
    signature: Buffer;
};
/** Two-factor clear. `recoveryCode` is the 16 raw bytes; the caller wipes it afterwards. */
export declare function clearByTwoFactors(dev: LatchFrameDevice, recoveryCode: Buffer, factorA: SecondFactor): Promise<{
    codeIndex: number;
    codesLeft: number;
    seq: bigint;
}>;
/** FIDO2 factor: the device's one-shot clientDataHash and the registered credential id. */
export declare function fidoChallenge(dev: LatchFrameDevice): Promise<{
    clientDataHash: Buffer;
    counter: number;
    credentialId: Buffer;
}>;
export declare const FIDO_RP_ID = "enclaweder.local";
export declare const FIDO_RP_ID_HASH: NonSharedBuffer;
/** Untrusted host clock for the device's failure-log labels. Best effort. */
export declare function setHostTime(dev: LatchFrameDevice, unixS?: number): Promise<void>;
export declare const FAIL_OP: Record<number, string>;
export declare const FAIL_REASON: Record<number, string>;
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
export declare function readFailLog(dev: LatchFrameDevice, devicePubRaw: Buffer, uid: Buffer): Promise<{
    total: bigint;
    pending: number;
    entries: DeviceFailure[];
}>;
/** Who holds operator authority, as the device signs it. */
export declare function readCustody(dev: LatchFrameDevice, devicePubRaw: Buffer, uid: Buffer): Promise<{
    counter: number;
    m: number;
    keys: Buffer[];
}>;
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
export declare function readLatchLog(dev: LatchFrameDevice, devicePubRaw: Buffer, uid: Buffer): Promise<LatchEvent[]>;
