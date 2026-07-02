import type { EnclawedConfig } from "../config/types.enclawed.js";
type SessionDepthEntry = {
    sessionId?: unknown;
    spawnDepth?: unknown;
    spawnedBy?: unknown;
};
export declare function getSubagentDepthFromSessionStore(sessionKey: string | undefined | null, opts?: {
    cfg?: EnclawedConfig;
    store?: Record<string, SessionDepthEntry>;
}): number;
export {};
