import type { SessionEntry } from "../config/sessions.js";
import type { EnclawedConfig } from "../config/types.enclawed.js";
export type FastModeState = {
    enabled: boolean;
    source: "session" | "agent" | "config" | "default";
};
export declare function resolveFastModeParam(extraParams: Record<string, unknown> | undefined): boolean | undefined;
export declare function resolveConfiguredFastMode(params: {
    cfg: EnclawedConfig | undefined;
    provider: string;
    model: string;
}): boolean;
export declare function resolveFastModeState(params: {
    cfg: EnclawedConfig | undefined;
    provider: string;
    model: string;
    agentId?: string;
    sessionEntry?: Pick<SessionEntry, "fastMode"> | undefined;
}): FastModeState;
