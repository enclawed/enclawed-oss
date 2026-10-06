import type { SessionEntry } from "../../config/sessions/types.js";
import type { EnclawedConfig } from "../../config/types.enclawed.js";
export declare function clearSessionAuthProfileOverride(params: {
    sessionEntry: SessionEntry;
    sessionStore: Record<string, SessionEntry>;
    sessionKey: string;
    storePath?: string;
}): Promise<void>;
export declare function resolveSessionAuthProfileOverride(params: {
    cfg: EnclawedConfig;
    provider: string;
    agentDir: string;
    sessionEntry?: SessionEntry;
    sessionStore?: Record<string, SessionEntry>;
    sessionKey?: string;
    storePath?: string;
    isNewSession: boolean;
}): Promise<string | undefined>;
