import type { SessionEntry } from "../config/sessions.js";
import type { EnclawedConfig } from "../config/types.enclawed.js";
import { type ExecAsk, type ExecHost, type ExecSecurity, type ExecTarget } from "../infra/exec-approvals.js";
export declare function canExecRequestNode(params: {
    cfg?: EnclawedConfig;
    sessionEntry?: SessionEntry;
    agentId?: string;
    sessionKey?: string;
    sandboxAvailable?: boolean;
}): boolean;
export declare function resolveExecDefaults(params: {
    cfg?: EnclawedConfig;
    sessionEntry?: SessionEntry;
    agentId?: string;
    sessionKey?: string;
    sandboxAvailable?: boolean;
}): {
    host: ExecTarget;
    effectiveHost: ExecHost;
    security: ExecSecurity;
    ask: ExecAsk;
    node?: string;
    canRequestNode: boolean;
};
