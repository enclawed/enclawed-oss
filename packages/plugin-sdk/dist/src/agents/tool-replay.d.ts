/** Marks a tool that can re-run itself on a recorded wire exchange. */
export declare const TOOL_WIRE_REPLAY: unique symbol;
export type ToolReplayOutcome = {
    ok: true;
    result: unknown;
    wire?: unknown;
} | {
    ok: false;
    error: unknown;
    wire?: unknown;
};
export type ToolReplayDirective = 
/** `refresh`: a batcher-scheduled re-issue of a recorded call (no issue slot). */
{
    kind: "record";
    refresh?: boolean;
} | {
    kind: "replay";
    outcome: ToolReplayOutcome;
};
export type ToolReplayCall = {
    readonly toolName: string;
    readonly toolCallId: string;
    readonly runId?: string;
    readonly wireReplay: boolean;
    directive?: ToolReplayDirective;
    executed: boolean;
    outcome?: ToolReplayOutcome;
    /** Set by a wire-replay tool while it records. */
    wire?: unknown;
    /**
     * Set by the wrapper on a recorded call: re-issue the identical call
     * through the tool's own path (same parameters) and return its new
     * outcome, or null when a gate halts it. The batcher's refresh uses it.
     */
    rerun?: () => Promise<ToolReplayOutcome | null>;
};
/** Run `fn` as one tool call's replay context. */
export declare function runInToolReplayContext<T>(call: ToolReplayCall, fn: () => Promise<T>): Promise<T>;
/** The replay context of the tool call running now, if any. */
export declare function currentToolReplayCall(): ToolReplayCall | undefined;
/**
 * The context of `toolCallId` for a wire-replay tool: what to do with its
 * network exchange. `replay` carries the recorded exchange; `record` asks the
 * tool to store it on the call (`call.wire`).
 */
export declare function wireReplayFor(toolName: string, toolCallId: string): {
    mode: "replay";
    wire: unknown;
} | {
    mode: "record";
    call: ToolReplayCall;
    refresh: boolean;
} | undefined;
/**
 * A recorded outcome the wrapper reproduces itself (no execute), or null when
 * the tool must run (no replay directive, or a wire replay the tool performs).
 */
export declare function resolveDirectReplay(call: ToolReplayCall): ToolReplayOutcome | null;
/** A copy of a recorded result, so a consumer mutating it cannot alter the record. */
export declare function cloneReplayResult<T>(value: T): T;
