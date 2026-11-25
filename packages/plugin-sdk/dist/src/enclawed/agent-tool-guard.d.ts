import { type FsWriteTarget, type SandboxTarget } from "./fs-reversibility.js";
import { type ToolCapabilityClass } from "./tool-capability-map.js";
export type ToolCallGuardContext = Readonly<{
    agentId?: string;
    sessionKey?: string;
    toolCallId?: string;
}>;
export type HardwareHaltCode = "hardware-dirty" | "hardware-unavailable" | "hardware-required-missing";
export type HardwareGateDecision = {
    allowed: true;
} | {
    allowed: false;
    code: HardwareHaltCode;
    reason: string;
};
export type AuditGateDecision = {
    allowed: true;
} | {
    allowed: false;
    reason: string;
};
/**
 * Enclaved flavor: refuse a tool call while the audit log cannot record it.
 * Waits for pending records, so a decision just appended is known to be
 * durable (or known to have failed) before the call runs. Open flavor: never
 * blocks (the logger still reports the failure on stderr).
 */
export declare function checkAuditLogForToolCall(): Promise<AuditGateDecision>;
/**
 * Refuse a tool call while the hardware root is not CLEAN. Synchronous and
 * O(1): only cached state is read.
 */
export declare function checkHardwareRootForToolCall(toolName: string, ctx?: ToolCallGuardContext): HardwareGateDecision;
export type IrreversibleProceedCode = "no-runtime" | "open-flavor" | "reversible" | "reversible-with-history" | "pre-approved" | "session-approved" | "approved-by-hook-approval";
export type IrreversiblePlan = {
    kind: "proceed";
    code: IrreversibleProceedCode;
    classification?: ToolCapabilityClass;
} | {
    kind: "refused";
    reason: string;
} | {
    kind: "approval-required";
    classification: ToolCapabilityClass;
    title: string;
    description: string;
};
/** The person's answer, or why there was none. Anything but an allow denies. */
export type IrreversibleApprovalResult = "allow-once" | "allow-always" | "deny" | "timeout" | "no-route" | "cancelled" | "unavailable";
/** What a file tool call writes, resolved by the caller that knows the tool's root. */
export type FsCallTargets = Readonly<{
    /** Every path the call writes or deletes; null when they cannot be determined. */
    targets: readonly FsWriteTarget[] | null;
    /** Why `targets` is null: no way to reach the files, or paths that do not resolve. */
    unresolved?: "no-file-bridge" | "unresolvable-path";
    /** Host workspace root of the file tools; absent when they run in a sandbox. */
    fsRoot?: string;
    /** The sandbox the file tools run in, read through its file bridge. */
    sandbox?: SandboxTarget;
}>;
/**
 * Decide whether a tool call needs a person before it runs. `hookApproved`
 * is true when a before_tool_call plugin already obtained a person's approval
 * for this exact call, so the person is not asked twice. `fs` carries the
 * targets of a file tool call; file writes are reversible only per target.
 */
export declare function planIrreversibleToolCall(toolName: string, ctx?: ToolCallGuardContext, opts?: {
    hookApproved?: boolean;
    fs?: FsCallTargets;
}): Promise<IrreversiblePlan>;
/**
 * Record a person's answer to an approval request. Returns true only when
 * the call may run.
 */
export declare function resolveIrreversibleApproval(toolName: string, ctx: ToolCallGuardContext, classification: ToolCapabilityClass, result: IrreversibleApprovalResult): boolean;
/** What the audit trail records for an irreversible call. */
export type IrreversibleDecisionCode = "pre-approved" | "session-approved" | "approved-by-hook-approval" | `approved:${"allow-once" | "allow-always"}` | `denied:${Exclude<IrreversibleApprovalResult, "allow-once" | "allow-always">}`;
/**
 * An approved call refused at execution because it is not the call the
 * person approved (replayed, expired, other arguments, or a target that
 * changed since; see ./approval-binding.ts).
 */
export declare function recordApprovalBindingRefusal(toolName: string, ctx: ToolCallGuardContext, code: string, reason: string): void;
export declare function resetAgentToolGuardForTest(): void;
