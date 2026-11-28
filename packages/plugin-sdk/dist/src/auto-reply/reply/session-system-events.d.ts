import type { EnclawedConfig } from "../../config/types.enclawed.js";
/** Drain queued system events, format as `System:` lines, return the block (or undefined). */
export declare function drainFormattedSystemEvents(params: {
    cfg: EnclawedConfig;
    sessionKey: string;
    isMainSession: boolean;
    isNewSession: boolean;
}): Promise<string | undefined>;
