import { verifyChain } from "../audit-log.js";
export interface DeviceForensics {
    serial: string | null;
    pubkey: string | null;
    status: string;
}
export interface ForensicSnapshot {
    schema: "enclaweder.forensics.v1";
    capturedAt: string;
    trigger: string;
    device: DeviceForensics | null;
    session: Record<string, unknown> | null;
    host: Record<string, unknown>;
    network: {
        interfaces: unknown[];
    };
    timeline: unknown[];
    prevHash: string | null;
    hash: string;
}
export declare function setForensicContext(ctx: Record<string, unknown>): void;
export declare function getForensicContext(): Record<string, unknown>;
export declare function forensicLogPath(): string;
/** Snapshot every identifying signal available at the moment of a tamper/DIRTY event. */
export declare function captureForensics(trigger: string, device: DeviceForensics | null): ForensicSnapshot;
/** Where each snapshot's hash is chained: the app's audit log (finding H13). */
export type ForensicAuditSink = (rec: {
    type: string;
    actor: string;
    level: string | null;
    payload: unknown;
}) => Promise<unknown>;
/** Registers (or, with null, removes) the audit chain every forensic snapshot is recorded in. */
export declare function setForensicAuditSink(sink: ForensicAuditSink | null): void;
/** The audit record type that carries a forensic snapshot's hash. */
export declare const FORENSIC_AUDIT_TYPE = "hardware-root.forensics";
/** Persist a snapshot: append-only local log (survives the device wipe) + optional off-box webhook. */
export declare function recordForensics(snap: ForensicSnapshot): Promise<void>;
/** Capture + persist in one call. Fired by the guard when the hardware root goes DIRTY. */
export declare function captureAndRecordTamper(trigger: string, device: DeviceForensics | null): Promise<ForensicSnapshot>;
export type ForensicVerifyResult = {
    ok: boolean;
    snapshots: number;
    /** Forensic records found in the audit chain. */
    audited: number;
    problems: string[];
};
/**
 * Checks the forensic log against the audit chain (finding H13): the log's own chain must be
 * consistent; every forensic hash the audit chain recorded must still be in the log (a removed
 * or rewritten snapshot is caught here); every snapshot in the log must be in the audit chain
 * (one added afterwards is caught here); and the audit chain itself must verify, against its
 * head anchor (the Enclaweder's, when the caller passes it).
 */
export declare function verifyForensicLog(forensicPath: string, auditPath: string, headAnchor?: Parameters<typeof verifyChain>[1]): Promise<ForensicVerifyResult>;
