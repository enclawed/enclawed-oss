import { type HistoryPolicy } from "./policy.js";
export declare const SNAPSHOT_HASH_RE: RegExp;
export type HistoryOp = "write" | "edit" | "delete" | "restore";
export type HistoryEntry = Readonly<{
    v: 1;
    ts: number;
    /** The path the tool was asked to write. */
    path: string;
    /** Its resolved location on disk (symlinks followed). */
    realPath: string;
    op: HistoryOp;
    /** Content hash of the prior content; null when the file did not exist. */
    hash: string | null;
    size: number;
    tool: string;
    toolCallId: string | null;
    agentId: string | null;
    /**
     * Not a file's history: this session copied `source` (content hash
     * `contentHash`, sha256) to a path whose name has a part unknown when it was
     * decided (`pattern`, a regular expression over real paths; nothing matched
     * it then). hash stays null and path names no file, so restore ignores it.
     */
    copyPattern?: Readonly<{
        pattern: string;
        source: string;
        contentHash: string;
    }>;
    /** Set when the file lives in a sandbox: restore writes back through it. */
    sandbox?: Readonly<{
        backendId: string;
        runtimeId: string;
        sessionKey: string;
        containerPath: string;
        /** The path and cwd the file tool handed the bridge, replayed on restore. */
        bridgePath: string;
        bridgeCwd: string;
    }>;
}>;
export type PutResult = {
    ok: true;
    hash: string;
    stored: boolean;
} | {
    ok: false;
    code: "over-retention-budget" | "store-failed";
    detail?: string;
};
export declare class HistoryTamperedError extends Error {
    readonly code: "tampered";
    constructor(hash: string);
}
export declare function resolveHistoryDir(env?: NodeJS.ProcessEnv): string;
export declare function sha256Hex(data: Buffer): string;
export declare class HistoryStore {
    readonly dir: string;
    private readonly limits;
    private readonly now;
    private totalBytes;
    private lastPrune;
    constructor(opts: {
        dir?: string;
        limits: HistoryPolicy;
        now?: () => number;
    });
    private get objectsDir();
    private get indexPath();
    objectPath(hash: string): string;
    private ensureDirs;
    private scanTotal;
    /** Bytes the store holds now. */
    usedBytes(): Promise<number>;
    /** Store content under its hash, unless that would exceed the budget. */
    put(content: Buffer): Promise<PutResult>;
    record(entry: Omit<HistoryEntry, "v" | "ts">): Promise<HistoryEntry>;
    list(filterPath?: string): Promise<HistoryEntry[]>;
    /** The content of a snapshot, after checking it still hashes to its name. */
    readVerified(hash: string): Promise<Buffer>;
    private maybePrune;
    /** Drop entries older than maxAgeDays and the objects nothing references. */
    prune(): Promise<{
        removedEntries: number;
        removedObjects: number;
    }>;
}
