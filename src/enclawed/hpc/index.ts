// HPC launch gate wiring: configured once at bootstrap, consulted on every exec call.

import { getRuntime } from "../runtime.js";
import { checkHpcCommand, NodeHourLedger, type HpcDecision } from "./gate.js";
import type { HpcPolicy } from "./policy.js";

export {
  checkHpcCommand,
  NodeHourLedger,
  type HpcDecision,
  type HpcLaunchSummary,
} from "./gate.js";
export { extractHpcBlock, parseHpcPolicy, type HpcPolicy, type HpcScheduler } from "./policy.js";
export { parseCommandLine } from "./shell-words.js";
export { parseLauncher, type HpcRequest, type LaunchRequest } from "./launchers.js";

const STATE_KEY = Symbol.for("enclawed.hpc");

type HpcState = { policy: HpcPolicy; ledger: NodeHourLedger };
type GlobalWithHpc = typeof globalThis & { [STATE_KEY]?: HpcState };

export function configureHpcGate(policy: HpcPolicy | null): void {
  const g = globalThis as GlobalWithHpc;
  if (!policy) {
    delete g[STATE_KEY];
    return;
  }
  g[STATE_KEY] = { policy, ledger: new NodeHourLedger(policy.nodeHourBudget) };
}

export function hpcGateState(): Readonly<HpcState> | null {
  return (globalThis as GlobalWithHpc)[STATE_KEY] ?? null;
}

/**
 * Called before an exec tool call runs. Returns null when the gate is off or
 * the command does not touch a scheduler; otherwise the decision, which has
 * already been written to the audit log.
 */
export function checkEnclawedHpcCall(
  command: unknown,
  cwd: unknown,
  actor?: string,
  callEnv?: unknown,
): HpcDecision | null {
  const state = hpcGateState();
  if (!state || typeof command !== "string") {
    return null;
  }
  const decision = checkHpcCommand(
    command,
    state.policy,
    {
      cwd: typeof cwd === "string" && cwd ? cwd : process.cwd(),
      env: process.env,
      callEnv:
        callEnv && typeof callEnv === "object" && !Array.isArray(callEnv)
          ? (callEnv as Record<string, unknown>)
          : undefined,
    },
    state.ledger,
  );
  if (!decision.touchedHpc) {
    return null;
  }
  getRuntime()
    ?.audit.append({
      type: decision.allowed ? "hpc.launch.allow" : "hpc.launch.deny",
      actor: actor ?? "process",
      level: null,
      payload: {
        enforce: state.policy.enforce,
        reasons: decision.reasons,
        launches: decision.launches,
        nodeHours: decision.nodeHours,
        nodeHoursUsed: state.ledger.used,
      },
    })
    .catch(() => {});
  return decision;
}
