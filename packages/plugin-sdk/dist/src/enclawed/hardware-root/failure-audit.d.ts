import { type DeviceFailure, type LatchFrameDevice } from "./device-latch.js";
export interface HostAuthFailure {
    /** Closed: what was attempted. */
    op: "latch-clear-two-factor" | "latch-clear-operator" | "recover-anchor" | "anchor-session" | "latch-session" | "audit-accept" | "activation-auth" | "operator-tool";
    /** Closed-ish reason code (never free text containing input). */
    reason: string;
    serial?: string;
    deviceTotal?: string;
}
/** Where the host keeps which device failure entries it has seen (beside the latch cache). */
export declare function failureMirrorPath(statePath: string): string;
/** Record one host-observed failure (audit log + forensic log). Best effort; never throws. */
export declare function recordHostAuthFailure(f: HostAuthFailure): Promise<void>;
/**
 * Pull the device's signed failure log and reconcile it with what this host has recorded.
 * Returns the device entries this host had NOT recorded (each now recorded, flagged).
 */
export declare function reconcileDeviceFailures(dev: LatchFrameDevice, devicePubRaw: Buffer, uid: Buffer, statePath: string, serial?: string, 
/** Failures this host just caused itself and has recorded: the newest that many are its own. */
ownRecent?: number): Promise<{
    total: bigint;
    unlogged: DeviceFailure[];
}>;
