import { type SessionEntry } from "../../config/sessions.js";
import type { EnclawedConfig } from "../../config/types.enclawed.js";
type RunResult = Awaited<ReturnType<(typeof import("../pi-embedded.js"))["runEmbeddedPiAgent"]>>;
export declare function updateSessionStoreAfterAgentRun(params: {
    cfg: EnclawedConfig;
    contextTokensOverride?: number;
    sessionId: string;
    sessionKey: string;
    storePath: string;
    sessionStore: Record<string, SessionEntry>;
    defaultProvider: string;
    defaultModel: string;
    fallbackProvider?: string;
    fallbackModel?: string;
    result: RunResult;
}): Promise<void>;
export {};
