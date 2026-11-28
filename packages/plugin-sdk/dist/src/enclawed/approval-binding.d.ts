export type FsResourceKind = "missing" | "file" | "dir" | "symlink" | "other";
export type FsResourceIdentity = Readonly<{
    type: "fs";
    /** The path as the action names it, absolute. */
    absPath: string;
    kind: FsResourceKind;
    /** Where the path really resolves (nearest existing ancestor + rest when missing). */
    realPath: string;
    /** readlink() of the path itself when it is a symlink. */
    linkTarget: string | null;
    dev: number | null;
    ino: number | null;
    nlink: number | null;
    /**
     * The birth time (statx btime, nanoseconds, decimal) of what the path reaches, or null where
     * the filesystem keeps none. An inode number is reused as soon as a file is deleted, so a file
     * removed and recreated under the same name can carry the approved (dev, ino); its birth time
     * is new. An in-place write keeps it.
     */
    born: string | null;
    parent: Readonly<{
        realPath: string;
        dev: number | null;
        ino: number | null;
        born: string | null;
    }>;
}>;
export type UrlResourceIdentity = Readonly<{
    type: "url";
    url: string;
}>;
export type ResourceIdentity = FsResourceIdentity | UrlResourceIdentity;
/** What `absPath` designates on disk right now. */
export declare function resolveFsResource(absPath: string): Promise<FsResourceIdentity>;
/** The canonical form of a URL target; null when it is not a URL. */
export declare function resolveUrlResource(raw: string): UrlResourceIdentity | null;
/** Why `now` is not the resource that was approved; null when it is the same. */
export declare function describeResourceChange(approved: ResourceIdentity, now: ResourceIdentity): string | null;
/** SHA-256 (hex) of the canonical JSON of an action's arguments. */
export declare function approvalArgsDigest(args: unknown): string;
export type ApprovalSubject = Readonly<{
    tool: string;
    args: unknown;
    resources?: readonly ResourceIdentity[];
}>;
export type ApprovalGrant = Readonly<{
    id: string;
    tool: string;
    argsDigest: string;
    resources: readonly ResourceIdentity[];
    issuedAtMs: number;
    expiresAtMs: number;
}>;
export type ApprovalRefusalCode = "unknown-grant" | "replayed" | "expired" | "not-approved" | "tool-mismatch" | "args-mismatch" | "resource-changed";
export type ApprovalConsumeResult = {
    ok: true;
    grant: ApprovalGrant;
} | {
    ok: false;
    code: ApprovalRefusalCode;
    reason: string;
};
type GrantState = {
    grant: ApprovalGrant;
    approved: boolean;
    consumedAtMs: number | null;
};
/** A ledger's grants as plain data (a file-backed ledger shared by processes keeps this). */
export type ApprovalLedgerState = readonly Readonly<GrantState>[];
/**
 * The grants of one process. A grant is issued when a person is asked,
 * marked approved when the person allows the action, and consumed exactly
 * once, at execution, against the action as it is then.
 */
export declare class ApprovalGrantLedger {
    private readonly clock;
    private readonly grants;
    constructor(clock?: () => number);
    /** The grants, for a ledger kept in a file between processes (see fromState). */
    exportState(): ApprovalLedgerState;
    /** A ledger with the grants exportState returned (malformed entries are dropped: fail closed). */
    static fromState(state: unknown, clock?: () => number): ApprovalGrantLedger;
    issue(subject: ApprovalSubject, opts: {
        ttlMs: number;
    }): ApprovalGrant;
    /** Record that a person allowed the action. Returns false for an unknown or expired grant. */
    approve(id: string): boolean;
    /** Drop a grant whose request was denied or abandoned. */
    revoke(id: string): void;
    /**
     * Use the grant for one execution of `current`. The grant is spent by the
     * first attempt, whatever its outcome: a refused attempt must be asked
     * about again.
     */
    consume(id: string, current: ApprovalSubject): ApprovalConsumeResult;
    private prune;
}
export {};
