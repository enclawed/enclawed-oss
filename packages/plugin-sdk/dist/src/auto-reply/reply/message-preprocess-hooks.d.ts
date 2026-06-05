import type { EnclawedConfig } from "../../config/types.enclawed.js";
import type { FinalizedMsgContext } from "../templating.js";
export declare function emitPreAgentMessageHooks(params: {
    ctx: FinalizedMsgContext;
    cfg: EnclawedConfig;
    isFastTestEnv: boolean;
}): void;
