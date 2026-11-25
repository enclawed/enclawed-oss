// enclawed: enforce the policy tool allowlist (`enclawed.policy.allowedTools`)
// on the agent tool path. Two layers:
//   1. filterToolsByEnclawedPolicy() removes denied tools from every tool set
//      the runtime offers to a model (applyToolPolicyPipeline calls it last).
//   2. checkEnclawedToolCall() refuses a denied tool at call time, so a tool
//      that reached a session by any other route still cannot run.
// The open flavor sets enforceAllowlists=false, so both layers allow
// everything there. Before bootstrap (no runtime) both layers allow, matching
// the channel and provider gates.

import { checkTool, type Decision } from "./policy.js";
import { getRuntime } from "./runtime.js";

// Offer-time denials repeat on every run; audit each tool once per process.
const auditedOfferDenials = new Set<string>();

export function filterToolsByEnclawedPolicy<T extends { name: string }>(
  tools: T[],
  normalize: (name: string) => string,
  warn?: (message: string) => void,
): T[] {
  const runtime = getRuntime();
  if (!runtime || !runtime.policy.enforceAllowlists) {
    return tools;
  }
  const denied: string[] = [];
  const allowed = tools.filter((tool) => {
    const id = normalize(tool.name);
    if (checkTool(runtime.policy, id).allowed) {
      return true;
    }
    denied.push(id);
    return false;
  });
  const fresh = denied.filter((id) => !auditedOfferDenials.has(id));
  if (fresh.length > 0) {
    for (const id of fresh) {
      auditedOfferDenials.add(id);
    }
    warn?.(
      `enclawed policy: tools not on enclawed.policy.allowedTools are unavailable (${fresh.join(", ")})`,
    );
    runtime.audit
      .append({
        type: "policy.deny.tool",
        actor: "process",
        level: null,
        payload: { stage: "offer", ids: fresh },
      })
      .catch(() => {});
  }
  return allowed;
}

export function checkEnclawedToolCall(toolName: string, actor?: string): Decision {
  const runtime = getRuntime();
  if (!runtime) {
    return { allowed: true };
  }
  const decision = checkTool(runtime.policy, toolName);
  if (!decision.allowed) {
    runtime.audit
      .append({
        type: "policy.deny.tool",
        actor: actor ?? "process",
        level: null,
        payload: { stage: "call", id: toolName },
      })
      .catch(() => {});
  }
  return decision;
}

export function resetToolGateForTest(): void {
  auditedOfferDenials.clear();
}
