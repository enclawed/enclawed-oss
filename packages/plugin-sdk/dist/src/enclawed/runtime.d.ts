import type { AuditLogger } from "./audit-log.js";
import type { Flavor } from "./flavor.js";
import type { ModuleDecision } from "./module-loader.js";
import type { Policy } from "./policy.js";
export type EnclawedRuntime = Readonly<{
    flavor: Flavor;
    policy: Policy;
    audit: AuditLogger;
    restoreFetch: () => void;
    fipsRequired: boolean;
    moduleDecisions: ReadonlyMap<string, ModuleDecision> | null;
}>;
export declare function getRuntime(): EnclawedRuntime | null;
export declare function setRuntime(runtime: EnclawedRuntime): void;
export declare function clearRuntime(): void;
