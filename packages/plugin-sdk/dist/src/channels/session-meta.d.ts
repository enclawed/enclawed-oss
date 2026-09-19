import type { MsgContext } from "../auto-reply/templating.js";
import type { EnclawedConfig } from "../config/types.enclawed.js";
export declare function recordInboundSessionMetaSafe(params: {
    cfg: EnclawedConfig;
    agentId: string;
    sessionKey: string;
    ctx: MsgContext;
    onError?: (error: unknown) => void;
}): Promise<void>;
