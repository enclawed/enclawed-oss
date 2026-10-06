import type { SessionEntry } from "../config/sessions.js";
import type { EnclawedConfig } from "../config/types.enclawed.js";
export declare function resolveModelAuthLabel(params: {
    provider?: string;
    cfg?: EnclawedConfig;
    sessionEntry?: Partial<Pick<SessionEntry, "authProfileOverride">>;
    agentDir?: string;
}): string | undefined;
