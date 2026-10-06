import type { EnclawedConfig } from "../../config/types.enclawed.js";
import type { MsgContext } from "../templating.js";
import type { InlineDirectives } from "./directive-handling.parse.js";
export declare function isDirectiveOnly(params: {
    directives: InlineDirectives;
    cleanedBody: string;
    ctx: MsgContext;
    cfg: EnclawedConfig;
    agentId?: string;
    isGroup: boolean;
}): boolean;
