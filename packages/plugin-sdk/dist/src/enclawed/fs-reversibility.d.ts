import { HistoryStore, type HistoryOp } from "./history-store.js";
import type { Policy } from "./policy.js";
export type FsWriteOp = Extract<HistoryOp, "write" | "edit" | "delete">;
export type FsWriteTarget = Readonly<{
    /** The path as the tool call gave it. */
    path: string;
    /** Resolved absolute path; null when it could not be resolved. */
    absPath: string | null;
    op: FsWriteOp;
}>;
export type FsReversibleBasis = "scratch" | "snapshot" | "git-clean";
export type FsNoHistoryCode = "no-history-path" | "no-history-tool" | "over-size-cap" | "over-retention-budget" | "outside-allowed-roots" | "special-file" | "unreadable" | "store-failed" | "unresolvable-path" | "no-file-bridge" | "sandbox-read-failed";
/** Which sandbox a snapshot came from, so a restore can find it again. */
export type SandboxRef = Readonly<{
    backendId: string;
    runtimeId: string;
    sessionKey: string;
}>;
/** The subset of a sandbox file bridge the history needs. */
export type SandboxFileAccess = {
    resolvePath(params: {
        filePath: string;
        cwd?: string;
    }): {
        hostPath?: string;
        containerPath: string;
    };
    readFile(params: {
        filePath: string;
        cwd?: string;
    }): Promise<Buffer>;
    stat(params: {
        filePath: string;
        cwd?: string;
    }): Promise<{
        type: "file" | "directory" | "other";
        size: number;
    } | null>;
};
/** A sandbox whose file tools a call uses: where paths resolve, and its bridge. */
export type SandboxTarget = Readonly<{
    ref: SandboxRef;
    root: string;
    files: SandboxFileAccess;
}>;
export type FsTargetResult = Readonly<{
    path: string;
    realPath: string | null;
    op: FsWriteOp;
    sandbox?: SandboxRef & {
        containerPath: string;
    };
} & ({
    reversible: true;
    basis: FsReversibleBasis;
    /** Snapshot hash of the prior content; null for scratch, git-clean or a new file. */
    snapshot: string | null;
    prior: "absent" | "content" | "unrecorded";
    gitHead?: string;
} | {
    reversible: false;
    code: FsNoHistoryCode;
})>;
export type FsHistoryOutcome = Readonly<{
    reversible: boolean;
    targets: FsTargetResult[];
}>;
export type PrepareFsHistoryParams = Readonly<{
    tool: string;
    targets: readonly FsWriteTarget[];
    /** Host workspace root the file tools write under; absent when sandboxed. */
    fsRoot?: string;
    /** The sandbox the file tools run in, when they do. */
    sandbox?: SandboxTarget;
    policy: Policy;
    toolCallId?: string;
    agentId?: string;
    store?: HistoryStore;
    /** Override the gateway temp directory (tests); null disables it. */
    gatewayTmpDir?: string | null;
}>;
/**
 * Classify every target of one call and keep the history that makes it
 * reversible. The call is reversible only if every target is.
 */
export declare function prepareFsWriteHistory(params: PrepareFsHistoryParams): Promise<FsHistoryOutcome>;
export declare function resetFsReversibilityForTest(): void;
