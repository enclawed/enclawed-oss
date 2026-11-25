// Ask a person to approve one agent tool call through the gateway's approval
// route (plugin.approval.request / plugin.approval.waitDecision), the same
// route `/approve`, native chat buttons and the Control UI already serve for
// exec and plugin approvals. Both plugin before_tool_call hooks and the
// enclawed irreversible-action gate use it, so there is one approval path.

import { AsyncLocalStorage } from "node:async_hooks";
import { PluginApprovalResolutions } from "../plugins/types.js";
import { callGatewayTool } from "./tools/gateway.js";

export const DEFAULT_TOOL_CALL_APPROVAL_TIMEOUT_MS = 120_000;

export type ToolCallApprovalRequest = {
  pluginId?: string;
  title: string;
  description: string;
  severity?: "info" | "warning" | "critical";
  timeoutMs?: number;
  toolName: string;
  toolCallId?: string;
  agentId?: string;
  sessionKey?: string;
  signal?: AbortSignal;
};

export type ToolCallApprovalWait =
  | { kind: "decision"; decision: "allow-once" | "allow-always" | "deny" | "timeout" }
  /** The gateway accepted no request (no id came back). */
  | { kind: "request-failed" }
  /** No approval client can answer (the gateway returned a null decision). */
  | { kind: "no-route" }
  /** The agent run was aborted while waiting. */
  | { kind: "aborted"; error: unknown }
  /** The gateway could not be reached or failed. */
  | { kind: "error"; error: unknown };

function isAbortSignalCancellation(err: unknown, signal?: AbortSignal): boolean {
  if (!signal?.aborted) {
    return false;
  }
  if (err === signal.reason) {
    return true;
  }
  return err instanceof Error && err.name === "AbortError";
}

export type ToolCallApprover = (req: ToolCallApprovalRequest) => Promise<ToolCallApprovalWait>;

// A scoped approval route for code that drives the gate in-process without a
// gateway (the `enclawed conformance` self-check answers its own requests).
// It applies only inside `runWithToolCallApprover`; everything else uses the
// gateway's route.
const scopedApprover = new AsyncLocalStorage<ToolCallApprover>();

export function runWithToolCallApprover<T>(approver: ToolCallApprover, run: () => T): T {
  return scopedApprover.run(approver, run);
}

export async function requestToolCallApproval(
  req: ToolCallApprovalRequest,
): Promise<ToolCallApprovalWait> {
  const scoped = scopedApprover.getStore();
  if (scoped) {
    try {
      return await scoped(req);
    } catch (err) {
      return { kind: "error", error: err };
    }
  }
  const timeoutMs = req.timeoutMs ?? DEFAULT_TOOL_CALL_APPROVAL_TIMEOUT_MS;
  // Buffer beyond the approval timeout so the gateway can clean up and
  // respond before the client-side RPC timeout fires.
  const rpcTimeoutMs = timeoutMs + 10_000;
  try {
    const requestResult: { id?: string; status?: string; decision?: string | null } =
      await callGatewayTool(
        "plugin.approval.request",
        { timeoutMs: rpcTimeoutMs },
        {
          pluginId: req.pluginId,
          title: req.title,
          description: req.description,
          severity: req.severity,
          toolName: req.toolName,
          toolCallId: req.toolCallId,
          agentId: req.agentId,
          sessionKey: req.sessionKey,
          timeoutMs,
          twoPhase: true,
        },
        { expectFinal: false },
      );
    const id = requestResult?.id;
    if (!id) {
      return { kind: "request-failed" };
    }
    let decision: string | null | undefined;
    if (Object.prototype.hasOwnProperty.call(requestResult ?? {}, "decision")) {
      decision = requestResult?.decision;
      if (decision === null) {
        return { kind: "no-route" };
      }
    } else {
      // Wait for the decision, but abort early if the agent run is cancelled
      // so the user isn't blocked for the full approval timeout.
      const waitPromise: Promise<{ id?: string; decision?: string | null }> = callGatewayTool(
        "plugin.approval.waitDecision",
        { timeoutMs: rpcTimeoutMs },
        { id },
      );
      const signal = req.signal;
      let waitResult: { id?: string; decision?: string | null } | undefined;
      if (signal) {
        let onAbort: (() => void) | undefined;
        const abortPromise = new Promise<never>((_, reject) => {
          if (signal.aborted) {
            reject(signal.reason);
            return;
          }
          onAbort = () => reject(signal.reason);
          signal.addEventListener("abort", onAbort, { once: true });
        });
        try {
          waitResult = await Promise.race([waitPromise, abortPromise]);
        } finally {
          if (onAbort) {
            signal.removeEventListener("abort", onAbort);
          }
        }
      } else {
        waitResult = await waitPromise;
      }
      decision = waitResult?.decision;
    }
    if (
      decision === PluginApprovalResolutions.ALLOW_ONCE ||
      decision === PluginApprovalResolutions.ALLOW_ALWAYS ||
      decision === PluginApprovalResolutions.DENY
    ) {
      return { kind: "decision", decision };
    }
    return { kind: "decision", decision: "timeout" };
  } catch (err) {
    if (isAbortSignalCancellation(err, req.signal)) {
      return { kind: "aborted", error: err };
    }
    return { kind: "error", error: err };
  }
}
