import { NodeHourLedger, type HpcDecision } from "./gate.js";
import { type HpcPolicy } from "./policy.js";
export { checkHpcCommand, NodeHourLedger, type HpcDecision, type HpcLaunchSummary, } from "./gate.js";
export { extractHpcBlock, parseHpcPolicy, type HpcPolicy, type HpcScheduler } from "./policy.js";
export { parseCommandLine } from "./shell-words.js";
export { parseLauncher, type HpcRequest, type LaunchRequest } from "./launchers.js";
type HpcState = {
    policy: HpcPolicy;
    ledger: NodeHourLedger;
};
/**
 * The gate policy bootstrap installs for the `enclawed.hpc` block. An absent
 * block turns the gate off in the open flavor; in the enclaved flavor it means
 * the refuse-all gate (every scheduler launch refused), so deleting the block
 * from the user-writable config never turns the gate off there. An invalid
 * block throws (the caller fails closed).
 */
export declare function resolveHpcGatePolicy(block: unknown, flavor: "open" | "enclaved"): HpcPolicy | null;
export declare function configureHpcGate(policy: HpcPolicy | null): void;
export declare function hpcGateState(): Readonly<HpcState> | null;
/**
 * Called before an exec tool call runs. Returns null when the gate is off or
 * the command does not touch a scheduler; otherwise the decision, which has
 * already been written to the audit log.
 */
export declare function checkEnclawedHpcCall(command: unknown, cwd: unknown, actor?: string, callEnv?: unknown): HpcDecision | null;
