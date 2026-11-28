// enclawed: the gateway agent tool path's two call-time guards, kept in one
// place so the tool-call hook consumes a narrow seam instead of reaching into
// the hardware root, the policy and the audit log separately.
//
//   1. Hardware halt (both flavors). A bound Enclaweder is an explicit opt-in,
//      exactly as for framework apps, where SkillGate.dispatch() halts every
//      call while the root is not CLEAN. If the bound root is DIRTY (removed,
//      swapped, zeroized, failed liveness) or, for a process sharing another
//      process's device, unavailable, every tool call is refused and audited.
//      The check reads cached state that the 1 s heartbeat (or the owner's
//      health poll) maintains; it never talks to the device. With no device
//      bound it is a no-op, unless ENCLAWEDER_ROOT=required, in which case a
//      missing device refuses the call.
//
//   2. Irreversible-action approval (enclaved flavor only). Each call is
//      classified into the capability vocabulary (./tool-capability-map.ts).
//      File writes are classified per call by target (./fs-reversibility.ts):
//      a write whose history exists (snapshot kept, or git-clean) or does
//      not matter (scratch) is fs.write.rev. Reversible calls run without a
//      prompt. Irreversible calls wait for a
//      person through the gateway's existing approval route unless the
//      operator pre-approved that tool (enclawed.policy.preApprovedIrreversibleTools)
//      or a person already chose "allow always" for it in this session.
//      Every decision is audited. The open flavor is unchanged.

import { getFlavor } from "./flavor.js";
import {
  prepareFsWriteHistory,
  type FsTargetResult,
  type FsWriteTarget,
  type SandboxTarget,
} from "./fs-reversibility.js";
import {
  hardwareRootHealth,
  hardwareRootInfo,
  hardwareRootPresent,
  hardwareRootRequired,
} from "./hardware-root/index.js";
import { getRuntime } from "./runtime.js";
import { CAPABILITY } from "./skill-capabilities.js";
import {
  classifyToolCall,
  isFsWriteTool,
  type ToolCapabilityClass,
} from "./tool-capability-map.js";

export type ToolCallGuardContext = Readonly<{
  agentId?: string;
  sessionKey?: string;
  toolCallId?: string;
}>;

export type HardwareHaltCode =
  | "hardware-dirty"
  | "hardware-unavailable"
  | "hardware-required-missing";

export type HardwareGateDecision =
  | { allowed: true }
  | { allowed: false; code: HardwareHaltCode; reason: string };

function auditAppend(type: string, actor: string | undefined, payload: unknown): void {
  const runtime = getRuntime();
  if (!runtime) {
    return;
  }
  // A failure is latched (and reported once) by the logger itself; the gated
  // paths below refuse while it is latched, so nothing is lost silently.
  runtime.audit.append({ type, actor: actor ?? "process", level: null, payload }).catch(() => {});
}

export type AuditGateDecision = { allowed: true } | { allowed: false; reason: string };

/**
 * Enclaved flavor: refuse a tool call while the audit log cannot record it.
 * Waits for pending records, so a decision just appended is known to be
 * durable (or known to have failed) before the call runs. Open flavor: never
 * blocks (the logger still reports the failure on stderr).
 */
export async function checkAuditLogForToolCall(): Promise<AuditGateDecision> {
  const runtime = getRuntime();
  if (!runtime || runtime.flavor !== "enclaved") {
    return { allowed: true };
  }
  await runtime.audit.flush?.();
  const failure = runtime.audit.failure;
  if (failure) {
    return {
      allowed: false,
      reason: `the audit log cannot be written (${failure.message}); refusing until it is fixed and enclawed restarts`,
    };
  }
  return { allowed: true };
}

/**
 * Refuse a tool call while the hardware root is not CLEAN. Synchronous and
 * O(1): only cached state is read.
 */
export function checkHardwareRootForToolCall(
  toolName: string,
  ctx: ToolCallGuardContext = {},
): HardwareGateDecision {
  let decision: HardwareGateDecision;
  if (hardwareRootPresent()) {
    const health = hardwareRootHealth();
    if (health.status === "CLEAN") {
      return { allowed: true };
    }
    decision = {
      allowed: false,
      code: health.status === "DIRTY" ? "hardware-dirty" : "hardware-unavailable",
      reason: `hardware root ${health.status}: ${health.reason}`,
    };
  } else if (hardwareRootRequired()) {
    decision = {
      allowed: false,
      code: "hardware-required-missing",
      reason: "ENCLAWEDER_ROOT=required but no Enclaweder is bound",
    };
  } else {
    // Software-only deployment: nothing to enforce here.
    return { allowed: true };
  }
  auditAppend("tool.hardware.halt", ctx.agentId, {
    tool: toolName,
    toolCallId: ctx.toolCallId ?? null,
    sessionKey: ctx.sessionKey ?? null,
    code: decision.code,
    reason: decision.reason,
    hardwareRoot: hardwareRootInfo(),
  });
  return decision;
}

export type IrreversibleProceedCode =
  | "no-runtime"
  | "open-flavor"
  | "reversible"
  | "reversible-with-history"
  | "pre-approved"
  | "session-approved"
  | "approved-by-hook-approval";

export type IrreversiblePlan =
  | { kind: "proceed"; code: IrreversibleProceedCode; classification?: ToolCapabilityClass }
  | { kind: "refused"; reason: string }
  | {
      kind: "approval-required";
      classification: ToolCapabilityClass;
      title: string;
      description: string;
    };

/** The person's answer, or why there was none. Anything but an allow denies. */
export type IrreversibleApprovalResult =
  | "allow-once"
  | "allow-always"
  | "deny"
  | "timeout"
  | "no-route"
  | "cancelled"
  | "unavailable";

// "Allow always" holds for the rest of the session in this process only. A
// standing pre-approval belongs in enclawed.policy.preApprovedIrreversibleTools.
const sessionApprovals = new Set<string>();
const MAX_SESSION_APPROVALS = 4096;

function sessionApprovalKey(toolName: string, ctx: ToolCallGuardContext): string | null {
  if (!ctx.sessionKey) {
    return null;
  }
  return JSON.stringify([ctx.agentId ?? "", ctx.sessionKey, toolName]);
}

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
export async function planIrreversibleToolCall(
  toolName: string,
  ctx: ToolCallGuardContext = {},
  opts: { hookApproved?: boolean; fs?: FsCallTargets } = {},
): Promise<IrreversiblePlan> {
  const runtime = getRuntime();
  if (!runtime) {
    // Embedded or lazy paths that skipped bootstrapEnclawed(): the enclaved
    // flavor fails closed (no approval gate means no irreversible call).
    if (getFlavor() === "enclaved") {
      return {
        kind: "refused",
        reason: "the enclaved flavor is active but the enclawed runtime is not bootstrapped",
      };
    }
    return { kind: "proceed", code: "no-runtime" };
  }
  if (runtime.flavor !== "enclaved") {
    return { kind: "proceed", code: "open-flavor" };
  }
  let classification = classifyToolCall(toolName);
  let fsTargets: readonly FsTargetResult[] | null = null;
  if (isFsWriteTool(toolName)) {
    // History is kept whenever it can be, even for a pre-approved tool, so
    // the default stays reversible.
    const outcome = opts.fs?.targets
      ? await prepareFsWriteHistory({
          tool: toolName,
          targets: opts.fs.targets,
          fsRoot: opts.fs.fsRoot,
          sandbox: opts.fs.sandbox,
          policy: runtime.policy,
          toolCallId: ctx.toolCallId,
          agentId: ctx.agentId,
        })
      : null;
    fsTargets = outcome?.targets ?? null;
    if (outcome?.reversible && outcome.targets.length > 0) {
      classification = { capability: CAPABILITY.FS_WRITE_REV, reversible: true };
      auditAppend("tool.reversible.history", ctx.agentId, {
        tool: toolName,
        toolCallId: ctx.toolCallId ?? null,
        sessionKey: ctx.sessionKey ?? null,
        capability: classification.capability,
        targets: outcome.targets,
      });
      return { kind: "proceed", code: "reversible-with-history", classification };
    }
  } else if (classification.reversible) {
    return { kind: "proceed", code: "reversible", classification };
  }
  // Why a file write has no history, per target, for the audit trail.
  const noHistory =
    fsTargets === null && isFsWriteTool(toolName)
      ? [{ code: opts.fs?.unresolved ?? "no-file-bridge" }]
      : (fsTargets ?? []).filter((t) => !t.reversible);
  let code: "pre-approved" | "session-approved" | "approved-by-hook-approval" | null = null;
  if (runtime.policy.preApprovedIrreversibleTools.has(toolName)) {
    code = "pre-approved";
  } else if (opts.hookApproved) {
    code = "approved-by-hook-approval";
  } else {
    const key = sessionApprovalKey(toolName, ctx);
    if (key && sessionApprovals.has(key)) {
      code = "session-approved";
    }
  }
  if (code) {
    recordDecision(toolName, ctx, classification, code, noHistory);
    return { kind: "proceed", code, classification };
  }
  auditAppend("tool.irreversible.request", ctx.agentId, {
    tool: toolName,
    toolCallId: ctx.toolCallId ?? null,
    sessionKey: ctx.sessionKey ?? null,
    capability: classification.capability,
    ...(noHistory.length > 0 ? { noHistory } : {}),
  });
  return {
    kind: "approval-required",
    classification,
    title: `Approve irreversible action: ${toolName}`,
    description:
      `The agent wants to run "${toolName}" (capability ${classification.capability}), ` +
      "whose effect has no history to undo it (files changed for good, data sent off this machine, or settings that decide what runs). It runs only if you approve.",
  };
}

/**
 * Record a person's answer to an approval request. Returns true only when
 * the call may run.
 */
export function resolveIrreversibleApproval(
  toolName: string,
  ctx: ToolCallGuardContext,
  classification: ToolCapabilityClass,
  result: IrreversibleApprovalResult,
): boolean {
  if (result === "allow-always") {
    const key = sessionApprovalKey(toolName, ctx);
    if (key) {
      if (sessionApprovals.size >= MAX_SESSION_APPROVALS) {
        const oldest = sessionApprovals.values().next().value;
        if (oldest !== undefined) {
          sessionApprovals.delete(oldest);
        }
      }
      sessionApprovals.add(key);
    }
  }
  if (result === "allow-once" || result === "allow-always") {
    recordDecision(toolName, ctx, classification, `approved:${result}`);
    return true;
  }
  recordDecision(toolName, ctx, classification, `denied:${result}`);
  return false;
}

/** What the audit trail records for an irreversible call. */
export type IrreversibleDecisionCode =
  | "pre-approved"
  | "session-approved"
  | "approved-by-hook-approval"
  | `approved:${"allow-once" | "allow-always"}`
  | `denied:${Exclude<IrreversibleApprovalResult, "allow-once" | "allow-always">}`;

function recordDecision(
  toolName: string,
  ctx: ToolCallGuardContext,
  classification: ToolCapabilityClass,
  decision: IrreversibleDecisionCode,
  noHistory: readonly unknown[] = [],
): void {
  auditAppend("tool.irreversible.decision", ctx.agentId, {
    tool: toolName,
    toolCallId: ctx.toolCallId ?? null,
    sessionKey: ctx.sessionKey ?? null,
    capability: classification.capability,
    decision,
    ...(noHistory.length > 0 ? { noHistory } : {}),
  });
}

/**
 * An approved call refused at execution because it is not the call the
 * person approved (replayed, expired, other arguments, or a target that
 * changed since; see ./approval-binding.ts).
 */
export function recordApprovalBindingRefusal(
  toolName: string,
  ctx: ToolCallGuardContext,
  code: string,
  reason: string,
): void {
  auditAppend("tool.approval.refused", ctx.agentId, {
    tool: toolName,
    toolCallId: ctx.toolCallId ?? null,
    sessionKey: ctx.sessionKey ?? null,
    code,
    reason,
  });
}

export function resetAgentToolGuardForTest(): void {
  sessionApprovals.clear();
}
