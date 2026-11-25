import type { ToolLoopDetectionConfig } from "../config/types.tools.js";
import {
  checkAuditLogForToolCall,
  checkHardwareRootForToolCall,
  planIrreversibleToolCall,
  recordApprovalBindingRefusal,
  resolveIrreversibleApproval,
} from "../enclawed/agent-tool-guard.js";
import type { SandboxTarget } from "../enclawed/fs-reversibility.js";
import { checkEnclawedHpcCall } from "../enclawed/hpc/index.js";
import { checkEnclawedToolCall } from "../enclawed/tool-gate.js";
import type { SessionState } from "../logging/diagnostic-session-state.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { getGlobalHookRunner } from "../plugins/hook-runner-global.js";
import { copyPluginToolMeta } from "../plugins/tools.js";
import { PluginApprovalResolutions, type PluginApprovalResolution } from "../plugins/types.js";
import { createLazyRuntimeSurface } from "../shared/lazy-runtime.js";
import { isPlainObject } from "../utils.js";
import { copyChannelAgentToolMeta } from "./channel-tools.js";
import {
  approveToolCallGrant,
  consumeToolCallGrant,
  describeGrantForApproval,
  issueToolCallGrant,
  revokeToolCallGrant,
} from "./tool-call-approval-grant.js";
import { requestToolCallApproval } from "./tool-call-approval.js";
import { resolveFsCallTargets } from "./tool-call-fs-targets.js";
import { normalizeToolName } from "./tool-policy.js";
import {
  cloneReplayResult,
  resolveDirectReplay,
  runInToolReplayContext,
  TOOL_WIRE_REPLAY,
  type ToolReplayCall,
  type ToolReplayOutcome,
} from "./tool-replay.js";
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

type HookOutcome = { blocked: true; reason: string } | { blocked: false; params: unknown };

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
export class ToolCallBlockedError extends Error {
  readonly blocked = true as const;
  constructor(reason: string) {
    super(reason);
    this.name = "ToolCallBlockedError";
  }
}

/**
 * Identify a block across module instances.
 *
 * The suite runs with `isolate: false`, so a class identity check can fail when
 * two copies of this module exist; the marker survives that.
 */
export function isToolCallBlockedError(value: unknown): value is ToolCallBlockedError {
  return (
    value instanceof Error &&
    ((value as { blocked?: unknown }).blocked === true || value.name === "ToolCallBlockedError")
  );
}

const log = createSubsystemLogger("agents/tools");
const BEFORE_TOOL_CALL_WRAPPED = Symbol("beforeToolCallWrapped");
const BEFORE_TOOL_CALL_HOOK_FAILURE_REASON =
  "Tool call blocked because before_tool_call hook failed";
const adjustedParamsByToolCallId = new Map<string, unknown>();
const MAX_TRACKED_ADJUSTED_PARAMS = 1024;
const LOOP_WARNING_BUCKET_SIZE = 10;
const MAX_LOOP_WARNING_KEYS = 256;

const loadBeforeToolCallRuntime = createLazyRuntimeSurface(
  () => import("./pi-tools.before-tool-call.runtime.js"),
  ({ beforeToolCallRuntime }) => beforeToolCallRuntime,
);

function buildAdjustedParamsKey(params: { runId?: string; toolCallId: string }): string {
  if (params.runId && params.runId.trim()) {
    return `${params.runId}:${params.toolCallId}`;
  }
  return params.toolCallId;
}

function mergeParamsWithApprovalOverrides(
  originalParams: unknown,
  approvalParams?: unknown,
): unknown {
  if (approvalParams && isPlainObject(approvalParams)) {
    if (isPlainObject(originalParams)) {
      return { ...originalParams, ...approvalParams };
    }
    return approvalParams;
  }
  return originalParams;
}

function unwrapErrorCause(err: unknown): unknown {
  if (err instanceof Error && err.cause !== undefined) {
    return err.cause;
  }
  return err;
}

function shouldEmitLoopWarning(state: SessionState, warningKey: string, count: number): boolean {
  if (!state.toolLoopWarningBuckets) {
    state.toolLoopWarningBuckets = new Map();
  }
  const bucket = Math.floor(count / LOOP_WARNING_BUCKET_SIZE);
  const lastBucket = state.toolLoopWarningBuckets.get(warningKey) ?? 0;
  if (bucket <= lastBucket) {
    return false;
  }
  state.toolLoopWarningBuckets.set(warningKey, bucket);
  if (state.toolLoopWarningBuckets.size > MAX_LOOP_WARNING_KEYS) {
    const oldest = state.toolLoopWarningBuckets.keys().next().value;
    if (oldest) {
      state.toolLoopWarningBuckets.delete(oldest);
    }
  }
  return true;
}

async function recordLoopOutcome(args: {
  ctx?: HookContext;
  toolName: string;
  toolParams: unknown;
  toolCallId?: string;
  result?: unknown;
  error?: unknown;
}): Promise<void> {
  if (!args.ctx?.sessionKey) {
    return;
  }
  try {
    const { getDiagnosticSessionState, recordToolCallOutcome } = await loadBeforeToolCallRuntime();
    const sessionState = getDiagnosticSessionState({
      sessionKey: args.ctx.sessionKey,
      sessionId: args.ctx?.agentId,
    });
    recordToolCallOutcome(sessionState, {
      toolName: args.toolName,
      toolParams: args.toolParams,
      toolCallId: args.toolCallId,
      result: args.result,
      error: args.error,
      config: args.ctx.loopDetection,
    });
  } catch (err) {
    log.warn(`tool loop outcome tracking failed: tool=${args.toolName} error=${String(err)}`);
  }
}

type BeforeToolCallArgs = {
  toolName: string;
  params: unknown;
  toolCallId?: string;
  ctx?: HookContext;
  signal?: AbortSignal;
};

export async function runBeforeToolCallHook(args: BeforeToolCallArgs): Promise<HookOutcome> {
  const toolName = normalizeToolName(args.toolName || "tool");
  const guardCtx = {
    agentId: args.ctx?.agentId,
    sessionKey: args.ctx?.sessionKey,
    toolCallId: args.toolCallId,
  };
  // enclawed: a bound Enclaweder that is no longer CLEAN halts every tool call,
  // mid-session, before any other gate runs. Cached state only; a no-op in
  // software-only deployments.
  const hardware = checkHardwareRootForToolCall(toolName, guardCtx);
  if (!hardware.allowed) {
    return { blocked: true, reason: `enclawed hardware root: ${hardware.reason}` };
  }
  // enclawed (enclaved flavor): no evidence, no action. A gated call never
  // runs while the audit log cannot record it.
  const auditGate = await checkAuditLogForToolCall();
  if (!auditGate.allowed) {
    return { blocked: true, reason: `enclawed audit: ${auditGate.reason}` };
  }
  const outcome = await runToolCallGates(args, toolName);
  if (outcome.blocked) {
    return outcome;
  }
  // enclawed (enclaved flavor): irreversible calls wait for a person. Runs
  // last, so a person is never asked about a call another gate would refuse.
  const plan = await planIrreversibleToolCall(toolName, guardCtx, {
    hookApproved: outcome.hookApproved === true,
    fs: resolveFsCallTargets(toolName, outcome.params, {
      fsRoot: args.ctx?.fsRoot,
      fsSandbox: args.ctx?.fsSandbox,
    }),
  });
  if (plan.kind === "refused") {
    return { blocked: true, reason: `enclawed: ${plan.reason}` };
  }
  if (plan.kind === "proceed") {
    // The plan may have just recorded a decision (pre-approval, history):
    // run only once it is durable.
    const recorded = await checkAuditLogForToolCall();
    if (!recorded.allowed) {
      return { blocked: true, reason: `enclawed audit: ${recorded.reason}` };
    }
    return { blocked: false, params: outcome.params };
  }
  // The person approves this exact call: tool, arguments and targets as
  // resolved now. The grant is checked again right before the call runs.
  const where = { fsRoot: args.ctx?.fsRoot, fsSandbox: args.ctx?.fsSandbox };
  const grant = await issueToolCallGrant({ toolName, args: outcome.params, where });
  const wait = await requestToolCallApproval({
    pluginId: "enclawed",
    title: plan.title,
    description: `${plan.description}\n${describeGrantForApproval(grant, outcome.params)}`,
    severity: "warning",
    toolName,
    toolCallId: args.toolCallId,
    agentId: args.ctx?.agentId,
    sessionKey: args.ctx?.sessionKey,
    signal: args.signal,
  });
  if (wait.kind === "error") {
    log.warn(`enclawed approval request failed, refusing the call: ${String(wait.error)}`);
  }
  const result =
    wait.kind === "decision"
      ? wait.decision
      : wait.kind === "aborted"
        ? "cancelled"
        : wait.kind === "no-route"
          ? "no-route"
          : "unavailable";
  if (resolveIrreversibleApproval(toolName, guardCtx, plan.classification, result)) {
    approveToolCallGrant(grant.id);
    const bound = await consumeToolCallGrant({
      grantId: grant.id,
      toolName,
      args: outcome.params,
      where,
    });
    if (!bound.ok) {
      recordApprovalBindingRefusal(toolName, guardCtx, bound.code, bound.reason);
      return {
        blocked: true,
        reason: `enclawed: the approval for "${toolName}" does not cover this call (${bound.reason}); it must be approved again`,
      };
    }
    // The approval is only as good as its record: run once it is durable.
    const recorded = await checkAuditLogForToolCall();
    if (!recorded.allowed) {
      return { blocked: true, reason: `enclawed audit: ${recorded.reason}` };
    }
    return { blocked: false, params: outcome.params };
  }
  revokeToolCallGrant(grant.id);
  return {
    blocked: true,
    reason: `enclawed: irreversible action "${toolName}" not approved (${result})`,
  };
}

async function runToolCallGates(
  args: BeforeToolCallArgs,
  toolName: string,
): Promise<HookOutcome & { hookApproved?: true }> {
  const params = args.params;

  // enclawed: refuse tools outside the policy allowlist even if a session was
  // offered them by a path that skipped the tool policy pipeline.
  const enclawedDecision = checkEnclawedToolCall(toolName, args.ctx?.agentId);
  if (!enclawedDecision.allowed) {
    return { blocked: true, reason: `enclawed policy: ${enclawedDecision.reason}` };
  }
  // enclawed: MPI, Slurm, Moab and Flux launches must fit enclawed.hpc.
  if (toolName === "exec" && isPlainObject(params)) {
    const hpc = checkEnclawedHpcCall(params.command, params.workdir, args.ctx?.agentId, params.env);
    if (hpc && !hpc.allowed) {
      return { blocked: true, reason: `enclawed hpc policy: ${hpc.reasons.join("; ")}` };
    }
  }

  if (args.ctx?.sessionKey) {
    const { getDiagnosticSessionState, logToolLoopAction, detectToolCallLoop, recordToolCall } =
      await loadBeforeToolCallRuntime();
    const sessionState = getDiagnosticSessionState({
      sessionKey: args.ctx.sessionKey,
      sessionId: args.ctx?.agentId,
    });

    const loopResult = detectToolCallLoop(sessionState, toolName, params, args.ctx.loopDetection);

    if (loopResult.stuck) {
      if (loopResult.level === "critical") {
        log.error(`Blocking ${toolName} due to critical loop: ${loopResult.message}`);
        logToolLoopAction({
          sessionKey: args.ctx.sessionKey,
          sessionId: args.ctx?.agentId,
          toolName,
          level: "critical",
          action: "block",
          detector: loopResult.detector,
          count: loopResult.count,
          message: loopResult.message,
          pairedToolName: loopResult.pairedToolName,
        });
        return {
          blocked: true,
          reason: loopResult.message,
        };
      } else {
        const warningKey = loopResult.warningKey ?? `${loopResult.detector}:${toolName}`;
        if (shouldEmitLoopWarning(sessionState, warningKey, loopResult.count)) {
          log.warn(`Loop warning for ${toolName}: ${loopResult.message}`);
          logToolLoopAction({
            sessionKey: args.ctx.sessionKey,
            sessionId: args.ctx?.agentId,
            toolName,
            level: "warning",
            action: "warn",
            detector: loopResult.detector,
            count: loopResult.count,
            message: loopResult.message,
            pairedToolName: loopResult.pairedToolName,
          });
        }
      }
    }

    recordToolCall(sessionState, toolName, params, args.toolCallId, args.ctx.loopDetection);
  }

  const hookRunner = getGlobalHookRunner();
  if (!hookRunner?.hasHooks("before_tool_call")) {
    return { blocked: false, params: args.params };
  }

  try {
    const normalizedParams = isPlainObject(params) ? params : {};
    const toolContext = {
      toolName,
      ...(args.ctx?.agentId && { agentId: args.ctx.agentId }),
      ...(args.ctx?.sessionKey && { sessionKey: args.ctx.sessionKey }),
      ...(args.ctx?.sessionId && { sessionId: args.ctx.sessionId }),
      ...(args.ctx?.runId && { runId: args.ctx.runId }),
      ...(args.toolCallId && { toolCallId: args.toolCallId }),
    };
    const hookResult = await hookRunner.runBeforeToolCall(
      {
        toolName,
        params: normalizedParams,
        ...(args.ctx?.runId && { runId: args.ctx.runId }),
        ...(args.toolCallId && { toolCallId: args.toolCallId }),
      },
      toolContext,
    );

    if (hookResult?.block) {
      return {
        blocked: true,
        reason: hookResult.blockReason || "Tool call blocked by plugin hook",
      };
    }

    if (hookResult?.requireApproval) {
      const approval = hookResult.requireApproval;
      const safeOnResolution = (resolution: PluginApprovalResolution): void => {
        const onResolution = approval.onResolution;
        if (typeof onResolution !== "function") {
          return;
        }
        try {
          void Promise.resolve(onResolution(resolution)).catch((err) => {
            log.warn(`plugin onResolution callback failed: ${String(err)}`);
          });
        } catch (err) {
          log.warn(`plugin onResolution callback failed: ${String(err)}`);
        }
      };
      const approvedParams = mergeParamsWithApprovalOverrides(params, hookResult.params);
      const where = { fsRoot: args.ctx?.fsRoot, fsSandbox: args.ctx?.fsSandbox };
      const grant = await issueToolCallGrant({
        toolName,
        args: approvedParams,
        where,
        timeoutMs: approval.timeoutMs,
      });
      const wait = await requestToolCallApproval({
        pluginId: approval.pluginId,
        title: approval.title,
        description: approval.description,
        severity: approval.severity,
        timeoutMs: approval.timeoutMs,
        toolName,
        toolCallId: args.toolCallId,
        agentId: args.ctx?.agentId,
        sessionKey: args.ctx?.sessionKey,
        signal: args.signal,
      });
      switch (wait.kind) {
        case "request-failed":
          safeOnResolution(PluginApprovalResolutions.CANCELLED);
          return {
            blocked: true,
            reason: approval.description || "Plugin approval request failed",
          };
        case "no-route":
          safeOnResolution(PluginApprovalResolutions.CANCELLED);
          return { blocked: true, reason: "Plugin approval unavailable (no approval route)" };
        case "aborted":
          safeOnResolution(PluginApprovalResolutions.CANCELLED);
          log.warn(`plugin approval wait cancelled by run abort: ${String(wait.error)}`);
          return { blocked: true, reason: "Approval cancelled (run aborted)" };
        case "error":
          safeOnResolution(PluginApprovalResolutions.CANCELLED);
          log.warn(
            `plugin approval gateway request failed, falling back to block: ${String(wait.error)}`,
          );
          return { blocked: true, reason: "Plugin approval required (gateway unavailable)" };
        case "decision":
          break;
      }
      safeOnResolution(wait.decision);
      if (wait.decision === "allow-once" || wait.decision === "allow-always") {
        approveToolCallGrant(grant.id);
        const runParams = mergeParamsWithApprovalOverrides(params, hookResult.params);
        const bound = await consumeToolCallGrant({
          grantId: grant.id,
          toolName,
          args: runParams,
          where,
        });
        if (!bound.ok) {
          recordApprovalBindingRefusal(toolName, args.ctx ?? {}, bound.code, bound.reason);
          return {
            blocked: true,
            reason: `The approval does not cover this call (${bound.reason}); it must be approved again`,
          };
        }
        return {
          blocked: false,
          params: runParams,
          hookApproved: true,
        };
      }
      revokeToolCallGrant(grant.id);
      if (wait.decision === "deny") {
        return { blocked: true, reason: "Denied by user" };
      }
      const timeoutBehavior = approval.timeoutBehavior ?? "deny";
      if (timeoutBehavior === "allow") {
        return {
          blocked: false,
          params: mergeParamsWithApprovalOverrides(params, hookResult.params),
        };
      }
      return { blocked: true, reason: "Approval timed out" };
    }

    if (hookResult?.params) {
      return {
        blocked: false,
        params: mergeParamsWithApprovalOverrides(params, hookResult.params),
      };
    }
  } catch (err) {
    const toolCallId = args.toolCallId ? ` toolCallId=${args.toolCallId}` : "";
    const cause = unwrapErrorCause(err);
    log.error(`before_tool_call hook failed: tool=${toolName}${toolCallId} error=${String(cause)}`);
    return {
      blocked: true,
      reason: BEFORE_TOOL_CALL_HOOK_FAILURE_REASON,
    };
  }

  return { blocked: false, params };
}

/** Run a tool's execute, recording its outcome when the call asks for it. */
async function executeRecorded<T>(call: ToolReplayCall, run: () => Promise<T>): Promise<T> {
  let result: T;
  try {
    result = await run();
  } catch (err) {
    if (call.directive?.kind === "record") {
      call.outcome = { ok: false, error: err, wire: call.wire };
    }
    throw err;
  }
  if (call.directive?.kind === "record") {
    call.outcome = { ok: true, result: cloneReplayResult(result), wire: call.wire };
  }
  return result;
}

/**
 * Re-issue a recorded call for the egress batcher's scheduled refresh: the
 * same tool and parameters, in a fresh replay context marked as a refresh.
 * The halting gates still apply (a hardware root that is no longer CLEAN, or
 * an audit log that cannot record), and a halted refresh changes nothing.
 */
async function rerunRecorded(
  original: ToolReplayCall,
  ctx: HookContext | undefined,
  run: () => Promise<unknown>,
): Promise<ToolReplayOutcome | null> {
  const guardCtx = {
    agentId: ctx?.agentId,
    sessionKey: ctx?.sessionKey,
    toolCallId: original.toolCallId,
  };
  if (!checkHardwareRootForToolCall(normalizeToolName(original.toolName), guardCtx).allowed) {
    return null;
  }
  if (!(await checkAuditLogForToolCall()).allowed) {
    return null;
  }
  const again: ToolReplayCall = {
    toolName: original.toolName,
    toolCallId: original.toolCallId,
    ...(original.runId ? { runId: original.runId } : {}),
    wireReplay: original.wireReplay,
    directive: { kind: "record", refresh: true },
    executed: true,
  };
  await runInToolReplayContext(again, () => executeRecorded(again, run)).catch(() => undefined);
  return again.outcome ?? null;
}

export function wrapToolWithBeforeToolCallHook(
  tool: AnyAgentTool,
  ctx?: HookContext,
): AnyAgentTool {
  const execute = tool.execute;
  if (!execute) {
    return tool;
  }
  const toolName = tool.name || "tool";
  const wireReplay = (tool as unknown as Record<symbol, unknown>)[TOOL_WIRE_REPLAY] === true;
  const wrappedTool: AnyAgentTool = {
    ...tool,
    // Each call runs in its own replay context (`tool-replay.ts`): the egress
    // action batcher's hook may ask for the outcome to be recorded, or for a
    // recorded outcome to be reproduced instead of sending the request again.
    execute: (toolCallId, params, signal, onUpdate) => {
      const call: ToolReplayCall = {
        toolName,
        toolCallId,
        ...(ctx?.runId ? { runId: ctx.runId } : {}),
        wireReplay,
        executed: false,
      };
      return runInToolReplayContext(call, () =>
        executeWrapped(call, toolCallId, params, signal, onUpdate),
      );
    },
  };
  const executeWrapped = async (
    call: ToolReplayCall,
    ...[toolCallId, params, signal, onUpdate]: Parameters<NonNullable<AnyAgentTool["execute"]>>
  ) => {
    const outcome = await runBeforeToolCallHook({
      toolName,
      params,
      toolCallId,
      ctx,
      signal,
    });
    if (outcome.blocked) {
      throw new ToolCallBlockedError(outcome.reason);
    }
    if (toolCallId) {
      const adjustedParamsKey = buildAdjustedParamsKey({ runId: ctx?.runId, toolCallId });
      adjustedParamsByToolCallId.set(adjustedParamsKey, outcome.params);
      if (adjustedParamsByToolCallId.size > MAX_TRACKED_ADJUSTED_PARAMS) {
        const oldest = adjustedParamsByToolCallId.keys().next().value;
        if (oldest) {
          adjustedParamsByToolCallId.delete(oldest);
        }
      }
    }
    const normalizedToolName = normalizeToolName(toolName || "tool");
    try {
      let result: Awaited<ReturnType<typeof execute>>;
      const replay = resolveDirectReplay(call);
      if (replay) {
        // A repeat answered from the identical earlier call's recorded
        // outcome: the same result, or the same error, without re-sending.
        if (!replay.ok) {
          throw replay.error;
        }
        result = cloneReplayResult(replay.result) as typeof result;
      } else {
        call.executed = true;
        if (call.directive?.kind === "record") {
          call.rerun = () =>
            rerunRecorded(call, ctx, () =>
              execute(toolCallId, outcome.params, undefined, undefined),
            );
        }
        result = await executeRecorded(call, () =>
          execute(toolCallId, outcome.params, signal, onUpdate),
        );
      }
      await recordLoopOutcome({
        ctx,
        toolName: normalizedToolName,
        toolParams: outcome.params,
        toolCallId,
        result,
      });
      return result;
    } catch (err) {
      await recordLoopOutcome({
        ctx,
        toolName: normalizedToolName,
        toolParams: outcome.params,
        toolCallId,
        error: err,
      });
      throw err;
    }
  };
  copyPluginToolMeta(tool, wrappedTool);
  copyChannelAgentToolMeta(tool as never, wrappedTool as never);
  Object.defineProperty(wrappedTool, BEFORE_TOOL_CALL_WRAPPED, {
    value: true,
    enumerable: true,
  });
  return wrappedTool;
}

export function isToolWrappedWithBeforeToolCallHook(tool: AnyAgentTool): boolean {
  const taggedTool = tool as unknown as Record<symbol, unknown>;
  return taggedTool[BEFORE_TOOL_CALL_WRAPPED] === true;
}

export function consumeAdjustedParamsForToolCall(toolCallId: string, runId?: string): unknown {
  const adjustedParamsKey = buildAdjustedParamsKey({ runId, toolCallId });
  const params = adjustedParamsByToolCallId.get(adjustedParamsKey);
  adjustedParamsByToolCallId.delete(adjustedParamsKey);
  return params;
}

export const __testing = {
  BEFORE_TOOL_CALL_WRAPPED,
  buildAdjustedParamsKey,
  adjustedParamsByToolCallId,
  runBeforeToolCallHook,
  mergeParamsWithApprovalOverrides,
  isPlainObject,
};
