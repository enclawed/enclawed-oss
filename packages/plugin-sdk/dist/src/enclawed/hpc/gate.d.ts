import type { HpcPolicy } from "./policy.js";
export type HpcLaunchSummary = {
    scheduler: string;
    verb: string;
    ranks: number | null;
    nodes: number | null;
    walltimeMinutes: number | null;
    partition: string | null;
    account: string | null;
    programs: string[];
    script: string | null;
    scriptSha256: string | null;
    nodeHours: number;
};
export type HpcDecision = {
    allowed: boolean;
    /** Present when not allowed, and in observe mode when it would not have been. */
    reasons: string[];
    launches: HpcLaunchSummary[];
    /** Node-hours this command reserves from the budget (0 when not allowed). */
    nodeHours: number;
    /** True when the gate saw at least one scheduler command. */
    touchedHpc: boolean;
};
export type HpcCheckContext = {
    cwd: string;
    /** Environment overrides the agent asked for on this call. */
    callEnv?: Record<string, unknown>;
    /** The gateway's own environment; the agent's per-call env is never trusted for this. */
    env: NodeJS.ProcessEnv;
    /** Test seam: read a script file. */
    readFile?: (absPath: string) => string | null;
};
/** Running total of node-hours granted by one gate. */
export declare class NodeHourLedger {
    readonly budget: number | null;
    private spent;
    constructor(budget: number | null);
    get used(): number;
    fits(hours: number): boolean;
    charge(hours: number): void;
}
/** Pure decision for one command line; charges `ledger` only when allowed. */
export declare function checkHpcCommand(command: string, policy: HpcPolicy, ctx: HpcCheckContext, ledger: NodeHourLedger): HpcDecision;
