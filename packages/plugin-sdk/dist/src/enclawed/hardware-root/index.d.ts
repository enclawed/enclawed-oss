import { type CommandSetProof } from "./activation.js";
import { type RemoteAttestation, type RemoteRoot, type RootHealth, type SigningDevice } from "./broker.js";
import { type DeviceFailure, type DeviceLatchState, type LatchErrorCode } from "./device-latch.js";
import { Enclaweder, type EnclawederSku } from "./enclaweder-hid.js";
import { HardwareRootFleet, type FleetMember } from "./fleet.js";
import { HardwareRootGuard, type RecoveryAuth } from "./guard.js";
import { type KeyDeriveResult } from "./key-derive.js";
import { type Latch } from "./latches.js";
import { type SessionAnchorDecision, requireSessionAnchor } from "./session-anchor.js";
import { createDeviceTotpSecondFactor, type DeviceTotpAccess } from "./totp-verify.js";
/**
 * What running without an Enclaweder means, said wherever it applies. Keys
 * held in software sit on the host, so whoever compromises the host can use
 * them, and secrets on it are exposed.
 */
export declare const SOFTWARE_ONLY_NOTICE: string;
/** True if this deployment refuses to start without a hardware root (absence is fatal). */
export declare function hardwareRootRequired(): boolean;
/** How a process boots the hardware root. */
export type BootOptions = {
    hidraw?: string;
    statePath?: string;
    /**
     * Demand one manufacturer root instead of the pinned domains, for this process's own devices
     * AND for the devices a broker owner claims to have (tests with simulated devices,
     * single-SKU deployments). Programmatic only: never read from the environment.
     */
    rootPubkey?: Buffer;
    /**
     * The owner's socket a boot with sharing off (ENCLAWEDER_BROKER=off) probes before it opens
     * the device itself (finding N16). Defaults to the machine's broker path. Programmatic only,
     * never read from the environment: tests point it at their own socket so they never reach
     * the real owner of the machine they run on.
     */
    ownerSocket?: string;
};
export declare function bootHardwareRoot(opts?: BootOptions): Promise<HardwareRootGuard | RemoteRoot | null>;
/**
 * Each member's latch read, signed by its device over a nonce of the caller's, for a process
 * that wants to check the devices itself (codenclawed's hook; findings H1, H15): every member,
 * never just the first. As the owner, read here; as a client, relayed and verified through the
 * owner. Null when no device is bound. Verify with verifyRootMembers + verifyRootAttestation.
 */
export declare function attestHardwareRoot(nonce32: Buffer): Promise<RemoteAttestation | null>;
/** Hardware-root status for the audit trail, so every accredited action records whether it was
 *  anchored in the enclaweder hardware (and which device), not just a boot-time flag. */
export interface HardwareRootInfo {
    anchored: boolean;
    serial: string | null;
    pubkey: string | null;
    status: string;
}
export declare function hardwareRootInfo(): HardwareRootInfo;
/** Gate a sensitive operation. Throws HaltError if the bound hardware root is DIRTY. No-op when no
 *  device was detected at bootstrap (software-only deployment). */
export declare function assertHardwareClean(): void;
/**
 * The machine's hardware root as this process sees it: CLEAN, DIRTY (latched),
 * or UNAVAILABLE (its owner is gone or busy; not a tamper).
 */
export declare function hardwareRootHealth(): RootHealth;
/**
 * Every device of this machine's hardware root, for signing: the principal's
 * keys (one per device) and a way to sign on one of them. Each request goes
 * through the owner's scheduler, this process's own included. Null when no
 * device is bound.
 */
export declare function hardwareRootSigning(): {
    members: {
        uid: string;
        pubkey: string;
    }[];
    run<T>(fn: (dev: SigningDevice) => Promise<T>): Promise<T>;
} | null;
/**
 * Command set 0.5: KEY_DERIVE on the primary member, for this launch (key-derive.ts). Null when no
 * hardware root is held here. `derive(label32)` answers `{ ok: false, code: "unsupported" }` on
 * firmware before 0.5 (a kit then keeps its older key and reports KEY_DERIVE_RESIDUAL), and
 * "no-activation" when this process made no device-verified activation in the last 120 s.
 */
export declare function hardwareRootKeyDerivation(): {
    uid: string;
    pubkey: string;
    derive(label32: Buffer): Promise<KeyDeriveResult>;
} | null;
/**
 * Command set 0.5, proven by the device (activation.ts proveCommandSet05): a fresh ANCHOR_READ on
 * the primary member over this process's nonce, signed by its certified key, carried directly or
 * relayed by the owner (who cannot forge it). Never IDENTIFY's version, which is unsigned and,
 * through the owner, the owner's word. "unproven" when no hardware root is held here or it is not
 * CLEAN.
 */
export declare function hardwareRootCommandSet(): Promise<CommandSetProof>;
/**
 * The bound primary device, for signing with its key (for example the swarm
 * operator's key). Null unless a device is bound and currently CLEAN, so a
 * caller can never sign through a device the guard has halted. A machine with
 * several devices signs through hardwareRootSigning() instead.
 */
export declare function hardwareRootSigningDevice(): Pick<Enclaweder, "getIdentity" | "challenge" | "getCert"> | null;
/**
 * The bound primary device for device-verified TOTP (TOTP_VERIFY / SIGN_ATTESTED; totp-verify.ts)
 * and the device-counted unlock (UNLOCK_GRANT / UNLOCK_USE), with the key and certificate the
 * guard verified at boot. Null unless the root is CLEAN. A client of another owner gets the same
 * access through the owner (relayed-factors.ts): codes sealed to the device, every answer checked
 * here against the primary member's certified key over a nonce chosen here.
 */
export declare function hardwareRootTotpDevice(): (DeviceTotpAccess & {
    cert: Buffer;
}) | null;
/**
 * The audit anchor this session must use, decided by the kit (session-anchor.ts): this process's
 * own bound device, or, for a client of the machine's owner, the authenticated anchor session
 * relayed through the owner (relayed-anchor.ts). A session with a hardware root that cannot anchor
 * with authentication is refused (`ok: false`); adapters run the session only on `ok: true`.
 */
export declare function hardwareRootSessionAnchor(): SessionAnchorDecision;
/** hardwareRootSessionAnchor(), throwing SessionAnchorRefused when the session must not run. */
export declare function requireHardwareRootSessionAnchor(): ReturnType<typeof requireSessionAnchor>;
/** The device-verified TOTP second factor that auth/device-factor.ts consumes. */
export declare function deviceTotpSecondFactor(): Promise<ReturnType<typeof createDeviceTotpSecondFactor>>;
export declare function hardwareRootFleetHandle(): HardwareRootFleet | null;
/** Every bound device, for the audit trail. Single-device deployments report their one member. */
export declare function hardwareRootMembers(): FleetMember[];
/** True iff a hardware root was detected and bound at bootstrap. */
/**
 * Close the hardware-accredited session on a deliberate shutdown.
 *
 * Without this the sessionOpen flag never clears, every later boot
 * without the device looks like an interrupted accredited session, and
 * rule "absent + CLEAN -> may run" becomes unreachable. Safe to call
 * when no device was ever bound.
 */
export declare function closeHardwareRootSession(): void;
/**
 * As closeHardwareRootSession(), waiting for each device to acknowledge the clean close (the
 * only thing that disarms its dirty-on-start latch). Call it from SIGINT/SIGTERM handlers and
 * every graceful exit path; a process that dies without it leaves the device DIRTY, by design.
 */
export declare function closeHardwareRootSessionAsync(): Promise<void>;
export declare function hardwareRootPresent(): boolean;
export declare function getHardwareGuard(): HardwareRootGuard | null;
/** Recover inside the running agent. `auth` is verified by the DEVICE; see guard.recover(). */
export declare function recoverHardwareRoot(auth: RecoveryAuth): Promise<boolean | undefined>;
/**
 * Recover a DIRTY latch from a process that has NOT booted the root (a CLI, the installer).
 *
 * The Enclaweder holds the latch and clears it only with two factors it verifies itself (an
 * authenticator code or security-key assertion AND a one-time recovery code) or with the operator
 * quorum. `humanConfirmed` is no longer accepted as an authority: a process of this user could
 * always pass `true`. Nothing here ends an accredited session (finding H4): only the guard that
 * opened a device host session closes it, on a clean exit.
 */
export declare function recoverHardwareRootStandalone(opts: {
    auth?: RecoveryAuth;
    /** Refused with an explanation: no longer an authority. */
    humanConfirmed?: boolean;
    /** The latch cache to update: the single-device one by default, or one device's own. */
    statePath?: string;
    /** Pin one device (its hidraw path). */
    hidraw?: string;
    /** Demand one manufacturer root instead of the pinned domains (tests, single-SKU deployments). */
    rootPubkey?: Buffer;
}): Promise<{
    recovered: boolean;
    serial?: string;
}>;
/** One device as `enclawed hardware-root status` reports it, read directly and verified. */
export interface DeviceRootReport {
    path: string;
    serial: string;
    uid: string;
    /** The device's identity key (hex), as it reported it. */
    pubkey: string;
    /** The device's own state (ACC_STATE), or null when it did not answer. */
    state: number | null;
    /** Birth certificate: valid under a pinned root, missing, or present but not valid. */
    cert: "valid" | "missing" | "invalid" | null;
    /** The SKU the valid certificate's root makes it. */
    sku: EnclawederSku | null;
    /** The device signed our fresh nonce with the key it reported: true, false, or not tried. */
    keyProof: boolean | null;
    latch: DeviceLatchState | null;
    latchError: string | null;
    latchErrorCode: LatchErrorCode | null;
    failures: {
        total: bigint;
        pending: number;
        entries: DeviceFailure[];
    } | null;
    custody: {
        counter: number;
        m: number;
        keys: string[];
    } | null;
}
/**
 * The hardware root as the DEVICES report it (signed answers over fresh nonces), plus every host
 * latch cache. Reads only; never binds, never opens a host session. Refuses to open a device that
 * a live owner holds: then the owner's health is reported instead.
 */
export declare function hardwareRootStatusStandalone(opts?: {
    statePath?: string;
    rootPubkey?: Buffer;
}): Promise<{
    hostLatches: Latch[];
    owner: RootHealth | null;
    devices: DeviceRootReport[];
}>;
/**
 * The host seam for code outside the core TypeScript build: the enterprise edition's sealed
 * accreditors. They reach
 * THIS hardware root through it (broker client with device attestation, device-held latch, one
 * owner per device), never a copy of their own: a second implementation was a second owner of
 * the device that bypassed every check here. Installed once per process; a later module instance
 * of this file (a test runner's isolation, or a second bundle) leaves the first in place.
 */
export declare const HARDWARE_ROOT_SEAM: unique symbol;
export type HardwareRootSeam = Readonly<{
    version: 1;
    bootHardwareRoot: typeof bootHardwareRoot;
    assertHardwareClean: typeof assertHardwareClean;
    hardwareRootHealth: typeof hardwareRootHealth;
}>;
export type { RecoveryAuth } from "./guard.js";
export { parseRecoveryCode, parseTotp, formatRecoveryCode } from "./recovery-code.js";
export { setForensicContext, getForensicContext, setForensicAuditSink, verifyForensicLog, FORENSIC_AUDIT_TYPE, captureForensics, forensicLogPath, type ForensicSnapshot, type DeviceForensics, } from "./forensics.js";
export { HardwareRootFleet, type FleetMember } from "./fleet.js";
export { CS05_REFLASH_RUNBOOK, proveCommandSet05, type CommandSetProof } from "./activation.js";
export { KEY_DERIVE_RESIDUAL, type KeyDeriveResult } from "./key-derive.js";
