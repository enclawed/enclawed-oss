import { type Label } from "./classification.js";
export type Decision = {
    allowed: true;
} | {
    allowed: false;
    reason: string;
};
/**
 * Network access for the commands a model asks Enclawed to run (the exec
 * tool). "none": they run in a network cage and every attempt to connect is
 * blocked, recorded and reported. "host": they share the host's network.
 */
export type CommandNetwork = "none" | "host";
/**
 * Write history for agent file tools (enclaved flavor). A write whose prior
 * content is kept here is reversible and runs without asking a person; a
 * write opted out of history, or one that would exceed these caps, is
 * irreversible and waits for approval.
 */
export type HistoryPolicy = Readonly<{
    /** Largest single prior-content snapshot kept, in bytes. */
    maxFileBytes: number;
    /** Total bytes the history store may hold. */
    maxTotalBytes: number;
    /** Snapshots older than this are pruned. */
    maxAgeDays: number;
    /** Absolute paths or globs (`*`, `**`) whose writes keep no history. */
    noHistoryPaths: readonly string[];
    /** Tool ids whose writes keep no history. */
    noHistoryTools: ReadonlySet<string>;
}>;
/**
 * Bounds on history.maxAgeDays (settings audit #1). The floor keeps every
 * restore point for at least a week, far longer than any pending write needs
 * it, and the history store applies it again when it prunes.
 */
export declare const HISTORY_MIN_AGE_DAYS = 7;
export declare const HISTORY_MAX_AGE_DAYS = 365;
export declare const DEFAULT_HISTORY_POLICY: HistoryPolicy;
export type Policy = Readonly<{
    enforceAllowlists: boolean;
    allowedChannels: ReadonlySet<string>;
    allowedProviders: ReadonlySet<string>;
    allowedTools: ReadonlySet<string>;
    allowedHosts: ReadonlySet<string>;
    commandNetwork: CommandNetwork;
    /**
     * Irreversible agent tools (canonical tool ids) the operator pre-approves,
     * so the enclaved flavor runs them without asking a person each time.
     * Empty by default: every irreversible call waits for approval.
     */
    preApprovedIrreversibleTools: ReadonlySet<string>;
    /**
     * Absolute directories where agent writes need no history (scratch), in
     * addition to the gateway's own temp directory.
     */
    scratchPaths: readonly string[];
    history: HistoryPolicy;
    maxOutputClearance: Label;
    defaultDataLabel: Label;
}>;
export declare function createPolicy(input: {
    enforceAllowlists?: boolean;
    allowedChannels?: Iterable<string>;
    allowedProviders?: Iterable<string>;
    allowedTools?: Iterable<string>;
    allowedHosts?: Iterable<string>;
    commandNetwork?: CommandNetwork;
    preApprovedIrreversibleTools?: Iterable<string>;
    scratchPaths?: Iterable<string>;
    history?: Partial<{
        maxFileBytes: number;
        maxTotalBytes: number;
        maxAgeDays: number;
        noHistoryPaths: Iterable<string>;
        noHistoryTools: Iterable<string>;
    }>;
    maxOutputClearance: Label;
    defaultDataLabel: Label;
}): Policy;
export declare function checkChannel(policy: Policy, id: string): Decision;
export declare function checkProvider(policy: Policy, id: string): Decision;
export declare function checkTool(policy: Policy, id: string): Decision;
export declare function defaultEnclavedPolicy(opts?: {
    localModelProviderId?: string;
    controlChannelId?: string;
}): Policy;
export declare function defaultOpenPolicy(): Policy;
export declare const defaultClassifiedPolicy: typeof defaultEnclavedPolicy;
