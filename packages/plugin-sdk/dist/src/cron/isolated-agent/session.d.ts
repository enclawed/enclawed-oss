import type { SessionEntry } from "../../config/sessions/types.js";
import type { EnclawedConfig } from "../../config/types.enclawed.js";
export declare function resolveCronSession(params: {
    cfg: EnclawedConfig;
    sessionKey: string;
    nowMs: number;
    agentId: string;
    forceNew?: boolean;
}): {
    storePath: string;
    store: Record<string, SessionEntry>;
    sessionEntry: SessionEntry;
    systemSent: boolean;
    isNewSession: boolean;
};
