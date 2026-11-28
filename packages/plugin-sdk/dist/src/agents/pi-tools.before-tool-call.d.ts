import type { ToolLoopDetectionConfig } from "../config/types.tools.js";
import type { SandboxTarget } from "../enclawed/fs-reversibility.js";
import { isPlainObject } from "../utils.js";
import type { AnyAgentTool } from "./tools/common.js";
export type HookContext = {
    agentId?: string;
    sessionKey?: string;
    /** Ephemeral session UUID — regenerated on /new and /reset. */
    sessionId?: string;
    runId?: string;
    loopDetection?: ToolLoopDetectionConfig;
    /**
     * Host workspace root the file tools (write, edit, apply_patch) resolve
     * paths against. Set only when they write the host filesystem directly
     * (not in a sandbox); enclawed keeps write history only when it is set.
     */
    fsRoot?: string;
    /**
     * The sandbox the file tools write through, when they run in one: enclawed
     * reads a target's prior content through its file bridge.
     */
    fsSandbox?: SandboxTarget;
};
type HookOutcome = {
    blocked: true;
    reason: string;
} | {
    blocked: false;
    params: unknown;
};
/**
 * A tool call refused by a before_tool_call hook.
 *
 * A policy refusal used to be thrown as a bare Error, so every consumer saw it
 * as an execution failure. That matters at the Codex app-server boundary: a
 * failure invites a retry, and retrying a policy decision just re-runs the gate,
 * while the model is told the tool "errored" rather than that it was refused.
 * A distinct type lets a caller report the refusal as a completed call whose
 * answer is "no" -- terminal and legible -- and still be caught by anything
 * handling plain Errors.
 */
export declare class ToolCallBlockedError extends Error {
    readonly blocked: true;
    constructor(reason: string);
}
/**
 * Identify a block across module instances.
 *
 * The suite runs with `isolate: false`, so a class identity check can fail when
 * two copies of this module exist; the marker survives that.
 */
export declare function isToolCallBlockedError(value: unknown): value is ToolCallBlockedError;
declare function buildAdjustedParamsKey(params: {
    runId?: string;
    toolCallId: string;
}): string;
declare function mergeParamsWithApprovalOverrides(originalParams: unknown, approvalParams?: unknown): unknown;
type BeforeToolCallArgs = {
    toolName: string;
    params: unknown;
    toolCallId?: string;
    ctx?: HookContext;
    signal?: AbortSignal;
};
export declare function runBeforeToolCallHook(args: BeforeToolCallArgs): Promise<HookOutcome>;
export declare function wrapToolWithBeforeToolCallHook(tool: AnyAgentTool, ctx?: HookContext): AnyAgentTool;
export declare function isToolWrappedWithBeforeToolCallHook(tool: AnyAgentTool): boolean;
export declare function consumeAdjustedParamsForToolCall(toolCallId: string, runId?: string): unknown;
export declare const __testing: {
    BEFORE_TOOL_CALL_WRAPPED: symbol;
    buildAdjustedParamsKey: typeof buildAdjustedParamsKey;
    adjustedParamsByToolCallId: Map<string, unknown>;
    runBeforeToolCallHook: typeof runBeforeToolCallHook;
    mergeParamsWithApprovalOverrides: typeof mergeParamsWithApprovalOverrides;
    isPlainObject: typeof isPlainObject;
};
export {};
