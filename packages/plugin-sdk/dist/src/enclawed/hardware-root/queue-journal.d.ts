import { type AuditRecord, type ChainVerifyResult } from "../audit-log.js";
export declare const QUEUE_REQUEST = "device.request";
export declare const QUEUE_SIGNED = "device.signed";
export declare const QUEUE_REFUSED = "device.refused";
export declare const QUEUE_CHECKPOINT = "device.checkpoint";
/** What the device signs at a checkpoint: the journal's head at that moment. */
export declare function checkpointDigest(head: string): Buffer;
/** Where the journal of a machine's device requests lives, beside its guard state. */
export declare function queueJournalPath(statePath: string): string;
export declare class QueueJournal {
    readonly filePath: string;
    private readonly log;
    private head;
    /** Who owns the devices while these records are written. */
    private readonly owner;
    constructor(filePath: string);
    private append;
    request(client: number, seq: number, digest: Buffer, until: number): Promise<AuditRecord>;
    signed(client: number, seq: number, uid: Buffer, sig: Buffer): Promise<AuditRecord>;
    refused(client: number, seq: number | null, reason: string): Promise<AuditRecord>;
    /** A checkpoint the device signed under the owner's latch session (LATCH_CHECKPOINT, H2). */
    checkpoint(covers: string, uid: Buffer, sig: Buffer, sid: bigint, ck: bigint): Promise<AuditRecord>;
    /** The hash of the last record written, or null before the first. */
    currentHead(): string | null;
    close(): Promise<void>;
}
export type QueueJournalReport = {
    chain: ChainVerifyResult;
    records: number;
    requests: number;
    signed: number;
    refused: number;
    checkpoints: number;
    /** Checkpoints whose signature is not a device's over a head that is in the chain. */
    badCheckpoints: number;
    /** Signatures recorded with no request before them. */
    orphanSignatures: number;
    /** Records after the last valid checkpoint: covered by the chain only. */
    uncovered: number;
    ok: boolean;
};
/**
 * Verifies a journal: the chain and its head anchor, every checkpoint's
 * signature against the devices' keys over a head that really is in the
 * chain, and that no signature was handed out without a request before it.
 */
export declare function verifyQueueJournal(filePath: string, devices: readonly {
    uid: string;
    pubkey: string;
}[]): Promise<QueueJournalReport>;
