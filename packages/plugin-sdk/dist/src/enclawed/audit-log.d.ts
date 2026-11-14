export type AuditRecord = {
    ts: number;
    type: string;
    actor: string;
    level: string | null;
    payload: unknown;
    prevHash: string;
    recordHash: string;
};
export declare function buildRecord(input: {
    prevHash: string;
    type: string;
    actor: string;
    level: string | null;
    payload: unknown;
    ts?: number;
}): AuditRecord;
/**
 * Where the last known-good head hash is kept.
 *
 * The whole value of an anchor is how hard it is for whoever can rewrite the
 * LOG to also rewrite the ANCHOR. That is a spectrum, and the sink is an
 * interface so the answer can move along it without touching the chain logic:
 *
 *   file         same disk, same process. Stops a naive truncation and makes
 *                it noisy; an attacker who thought to delete the log will
 *                think to delete this too. The default, because it always
 *                works and costs nothing.
 *
 *   enclaweder   the hardware root, via ANCHOR_SET/ANCHOR_GET. An attacker with
 *                full filesystem access cannot forge it without the device, and
 *                -- because the device keeps a monotonic counter the host has no
 *                opcode to set -- cannot replay an older genuine anchor either.
 *                Replay is the attack a signature alone does not stop.
 *
 *   distributed  a public append-only ledger. Strongest for non-repudiation,
 *                since the anchor is independently witnessed and not ours to
 *                revise. Costs latency and money per write, so it suits
 *                periodic checkpoints rather than every record, and only a
 *                hash is ever published -- never log content.
 */
export interface HeadAnchorSink {
    /** Identifies the sink in verification output, so "matched" says matched WHERE. */
    readonly id: string;
    write(hash: string): Promise<void>;
    read(): Promise<string | null>;
    /**
     * Optional richer read: the head, plus how strongly it is attested.
     *
     *   device   read live from the hardware root, counter and all. Completeness
     *            is demonstrated, not merely asserted.
     *   offline  a device-signed record read from disk while the device was away.
     *            It proves the head WAS signed, but not that it is the LATEST one
     *            -- an older signed anchor could have been restored, and only the
     *            device's counter distinguishes those.
     *   none     nothing to compare against.
     *
     * The distinction exists so an unplugged device cannot quietly look like a
     * full verification. Sinks without it are treated as "device"-equivalent for
     * their own medium, since there is nothing weaker to fall back to.
     */
    readAttested?(): Promise<{
        head: string | null;
        attested: "device" | "offline" | "none";
    }>;
}
/**
 * Sidecar holding the hash of the last record written.
 *
 * A hash chain proves that nothing was altered or inserted. It cannot prove
 * that nothing was REMOVED: deleting the trailing records leaves a shorter
 * chain that verifies perfectly, so an attacker need only truncate away the
 * entries that recorded what they did. Measured on this implementation --
 * deleting the last four of ten records returned {ok:true,count:6}.
 *
 * The fix is to remember, outside the log, what the head was. Verification
 * then recomputes the head and compares; a chain that verifies internally but
 * ends somewhere other than the recorded head has lost records.
 *
 * This is a speed bump, not a vault: an attacker with write access to both
 * files can update the anchor too. It exists so that truncating the log alone
 * is no longer sufficient and no longer silent, and so the anchor can later be
 * sealed somewhere the log's own writer cannot reach.
 */
export declare function headAnchorPath(logPath: string): string;
/** The default sink: a file beside the log. */
export declare function fileHeadAnchor(logPath: string): HeadAnchorSink;
export declare const SEGMENT_START_TYPE = "audit.segment.start";
export type SegmentLink = {
    seq: number;
    prevSegment: string;
    prevHead: string;
};
/** `audit.jsonl` + seq 3 -> `audit.3.jsonl`. */
export declare function segmentPath(logPath: string, seq: number): string;
/** Sealed segments oldest-first. Gaps are not silently skipped: see verifyHistory. */
export declare function listSegments(logPath: string): Promise<{
    seq: number;
    file: string;
}[]>;
/**
 * If this record is a valid segment link, return it.
 *
 * The link must be self-consistent -- the head it names has to be the very
 * prevHash it chains from -- so a forged header cannot claim to continue from
 * one place while chaining from another.
 */
export declare function segmentLink(rec: AuditRecord): SegmentLink | null;
export declare class AuditLogger {
    private readonly opts;
    private _lastHash;
    private _fh;
    private _writeQueue;
    private readonly clock;
    private readonly anchor;
    constructor(opts: {
        filePath: string;
        clock?: () => number;
        /** Defaults to a file beside the log; see HeadAnchorSink. */
        headAnchor?: HeadAnchorSink;
        /**
         * Seal the current segment once it would exceed this. Default 64 MiB --
         * comfortably under Node's ~512 MB string cap even for tools that read a
         * whole segment, and small enough that a single segment stays workable.
         * Nothing is deleted on rotation; see the rotation notes above.
         */
        maxBytes?: number;
    });
    private readonly maxBytes;
    private _size;
    private _ensureOpen;
    private _writeSegmentStart;
    /**
     * Seal the current segment and open a new one linked to it.
     *
     * Order matters: the file is renamed BEFORE the new one is opened, and the
     * link record is written immediately after. A crash anywhere in here leaves
     * either a sealed segment with no successor yet, or an empty successor --
     * both recoverable in _ensureOpen, and neither loses a record.
     */
    private _rotate;
    private _writeHeadAnchor;
    private _scanLastHash;
    append(input: {
        type: string;
        actor: string;
        level: string | null;
        payload: unknown;
    }): Promise<AuditRecord>;
    close(): Promise<void>;
}
export type ChainVerifyResult = {
    ok: true;
    count: number;
    head: string;
    /**
     * "matched"          head confirmed against the anchor.
     * "matched-offline"  confirmed against a device-signed record read from
     *                    disk, with the device absent. The head was signed,
     *                    but a restored OLDER anchor cannot be ruled out --
     *                    that is what the device's counter is for.
     * "absent"           no anchor, so completeness is unproven.
     */
    anchor: "matched" | "matched-offline" | "absent";
    /** Which sink answered, so "matched" says matched WHERE. */
    anchorId: string;
    /** Segment this file continues from, if it is a rotated continuation. */
    continuesFrom?: string;
} | {
    ok: false;
    count: number;
    brokenAt: number;
    reason: string;
};
/**
 * Verify the hash chain, one record at a time.
 *
 * This streams rather than reading the file, and that is not an optimisation.
 * Node caps a string at about 512MB, and this log has no rotation: a live
 * install reached 810MB in under five days. Reading it whole threw
 * ERR_STRING_TOO_LONG, which meant the chain became unverifiable exactly when
 * it grew large enough to matter -- the failure mode a tamper-evident log can
 * least afford, since "cannot verify" and "verifies fine" must never be the
 * same observation from the outside.
 *
 * Verification is inherently sequential, so a line stream is also the natural
 * shape: memory stays flat regardless of how far the log has grown.
 */
export declare function verifyChain(filePath: string, headAnchor?: HeadAnchorSink): Promise<ChainVerifyResult>;
export type HistoryVerifyResult = {
    ok: true;
    segments: {
        file: string;
        count: number;
    }[];
    count: number;
    head: string;
    anchor: "matched" | "matched-offline" | "absent";
    anchorId: string;
} | {
    ok: false;
    file: string;
    /** Records verified across the whole history before the failure. */
    count: number;
    /** Index of the offending record WITHIN `file`, or null for a seam failure. */
    brokenAt: number | null;
    reason: string;
};
/**
 * Verify the whole history across every rotated segment.
 *
 * verifyChain checks one file, and a rotated file legitimately begins mid-chain,
 * so on its own it cannot tell a genuine continuation from a fabricated one --
 * an attacker could delete every earlier segment and forge a link header
 * claiming to continue from a file that no longer exists. This walks the
 * segments oldest-first and checks each seam against the file it names, so a
 * missing or substituted segment is caught rather than assumed away.
 *
 * The anchor is checked once, at the end, against the newest head.
 */
export declare function verifyHistory(filePath: string, headAnchor?: HeadAnchorSink): Promise<HistoryVerifyResult>;
