import type { SessionMaintenanceWarning } from "../config/sessions/store-maintenance.js";
import type { SessionEntry } from "../config/sessions/types.js";
import type { EnclawedConfig } from "../config/types.enclawed.js";
type WarningParams = {
    cfg: EnclawedConfig;
    sessionKey: string;
    entry: SessionEntry;
    warning: SessionMaintenanceWarning;
};
declare function resetSessionMaintenanceWarningForTests(): void;
export declare const __testing: {
    readonly resetSessionMaintenanceWarningForTests: typeof resetSessionMaintenanceWarningForTests;
};
export declare function deliverSessionMaintenanceWarning(params: WarningParams): Promise<void>;
export {};
