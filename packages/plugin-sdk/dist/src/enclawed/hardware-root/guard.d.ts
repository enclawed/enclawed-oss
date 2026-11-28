import { type LatchFrameDevice, type SecondFactor } from "./device-latch.js";
import { type Identity, type DeviceStatus, type ChallengeResponse, type EnclawederSku, type OperatorSigner } from "./enclaweder-hid.js";
/** Failures since the last clean session at or above this print a launch warning. */
export declare const FAILURE_WARN_THRESHOLD = 3;
export declare class HaltError extends Error {
    readonly reason: string;
    constructor(reason: string);
}
/** The subset of the device the guard drives. `Enclaweder` satisfies this structurally. */
export interface GuardDevice {
    getIdentity(): Promise<Identity>;
    getStatus(): Promise<DeviceStatus>;
    challenge(nonce32: Buffer): Promise<ChallengeResponse>;
    getCert(): Promise<Buffer | null>;
    /** Frame-level access for the device-held latch (command set 0.3). Absent = unsupported. */
    request?: LatchFrameDevice["request"];
    sendNoWait?: LatchFrameDevice["sendNoWait"];
}
/**
 * A device that can also enrol a measurement and attest against it.
 *
 * This is deliberately separate from GuardDevice. Binding a hardware root
 * needs identity, status, challenge and certificate, and the Enclaweder
 * class in enclaweder-hid.ts implements exactly those. Enrolment and
 * attestation are a further capability whose wire opcodes are not in this
 * tree, so nothing here implements them; the fleet tests supply devices
 * that do. Naming the capability means a device that lacks it is refused
 * with an explanation instead of failing on an undefined method.
 */
export interface AttestingDevice extends GuardDevice {
    enroll(meas32: Buffer): Promise<number | null>;
    attest(meas32: Buffer, nonce32: Buffer): Promise<unknown>;
}
interface BoundInfo {
    serial: string;
    pubkey: string;
    uid: string;
    /**
     * Which pinned domain signed this device's birth certificate. This is the
     * AUTHENTICATED model -- the USB serial prefix is display only and a Pro
     * unit reports the driver's base prefix until something re-renders it, so
     * anything deciding what the device IS has to read this. Optional because
     * state files written before it existed do not carry it.
     */
    sku?: EnclawederSku;
}
/** One append-only history entry. Never removed, never rewritten, carried across every rebind. */
export interface GuardHistoryEntry {
    at: number;
    kind: "bound" | "rebound" | "halt" | "recovered" | "device-latch-set" | "pushed-to-device" | "refused-boot" | "session-closed";
    detail?: string;
    serial?: string;
    deviceSeq?: string;
    via?: "two-factor" | "operator-quorum";
}
/** How a DIRTY latch is cleared. There is no "confirmed" boolean: the device decides. */
export type RecoveryAuth = {
    kind: "two-factor";
    /** The one-time recovery code, 16 raw bytes (parseRecoveryCode). Wiped after use. */
    recoveryCode: Buffer;
    /** Factor A, verified by the device: TOTP code + host time, or a FIDO2 assertion. */
    factorA: SecondFactor;
} | {
    kind: "operator-quorum";
    /** M operator signers (off-host: hardware tokens, an air-gapped station, removable media). */
    signers: OperatorSigner[];
};
export declare class HardwareRootGuard {
    private statePath;
    private onHalt;
    private state;
    private timer;
    private rootPubkey;
    private session;
    private sessionDev;
    /** A refused boot keeps every gate closed until a later boot succeeds (finding H5). */
    private refused;
    /** When (monotonic ms) the device's own latch was last read and verified CLEAR (finding N18). */
    private deviceCheckedAt;
    private deviceStaleMs;
    private checking;
    /** When the heartbeat check now in flight started (finding H9). */
    private checkStartedAt;
    /** A heartbeat check still unanswered after this long closes the gate (finding H9). */
    private answerBudgetMs;
    private heartbeatStarted;
    private cert;
    constructor({ statePath, onHalt, rootPubkey, deviceStaleMs, answerBudgetMs, }?: {
        statePath?: string;
        onHalt?: (r: string) => void;
        rootPubkey?: Buffer;
        /** assertClean() fails closed when the last verified device latch read is older than this. */
        deviceStaleMs?: number;
        /** assertClean() fails closed while a heartbeat check has been unanswered this long. */
        answerBudgetMs?: number;
    });
    /**
     * The host cache. Missing means never bound. ANY other failure -- a directory, a permission
     * error, a truncated or corrupt file -- reads as DIRTY (finding H7): an attacker who can break
     * the file must not thereby make the host look clean.
     */
    private loadState;
    private unreadable;
    /** Atomic write (temp + rename). Throws; callers decide what a failure means. */
    private saveState;
    private trySave;
    private log;
    get status(): string;
    get bound(): BoundInfo | null;
    get history(): readonly GuardHistoryEntry[];
    /** The bound device's birth certificate, as verified at boot (clients re-verify it; H1). */
    get certificate(): Buffer | null;
    /** Why the last boot was refused, if it was (finding H5). */
    get refusal(): string | null;
    /** Gate every accredited operation. Throws HaltError unless CLEAN, unrefused and device-fresh. */
    assertClean(): void;
    /** Bind at boot. Refuses unless the DEVICE says clean; opens the device's host session. */
    boot(dev: GuardDevice): Promise<BoundInfo>;
    private bootInner;
    /** Failed authentications since the last clean session above the threshold: say so, loudly. */
    private lastFailureTotal;
    private warnOnFailures;
    private mirrorDevice;
    /** The device says DIRTY: mirror it here (cache + audit), never the other way round. */
    private adoptDeviceHalt;
    /**
     * End the hardware-accredited session deliberately: the authenticated clean close is what
     * disarms the device. Only the guard that opened a session closes it, and only that writes
     * sessionOpen = false (finding H4): a refused recovery or a per-call process never does.
     */
    closeSession(): void;
    /** As closeSession(), awaiting the device's acknowledgement (graceful exit paths). */
    closeSessionAsync(): Promise<void>;
    /** A journal checkpoint signed under this guard's device host session (finding H2). */
    checkpoint(head32: Buffer): Promise<{
        uid: Buffer;
        sid: bigint;
        ck: bigint;
        sig: Buffer;
    }>;
    /** One liveness check; latches DIRTY on any failure. Never rejects (finding H7). */
    check(dev: GuardDevice): Promise<{
        ok: boolean;
        reason?: string;
    }>;
    private onHaltSafe;
    private markDirty;
    startHeartbeat(dev: GuardDevice, { intervalMs }?: {
        intervalMs?: number;
    }): void;
    stopHeartbeat(): void;
    /**
     * Recovery. The DEVICE clears its latch, verifying the factors itself; this only relays them,
     * then accepts the outcome when a fresh signed LATCH_GET says CLEAR. There is no boolean
     * "confirmed" authority: a process of this user cannot clear anything by calling this.
     */
    recover(dev: GuardDevice, auth?: RecoveryAuth | {
        humanConfirmed?: boolean;
    }): Promise<boolean>;
}
export {};
