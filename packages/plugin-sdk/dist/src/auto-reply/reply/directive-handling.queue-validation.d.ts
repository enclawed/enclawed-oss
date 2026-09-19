import type { SessionEntry } from "../../config/sessions.js";
import type { EnclawedConfig } from "../../config/types.enclawed.js";
import type { ReplyPayload } from "../types.js";
import type { InlineDirectives } from "./directive-handling.parse.js";
export declare function maybeHandleQueueDirective(params: {
    directives: InlineDirectives;
    cfg: EnclawedConfig;
    channel: string;
    sessionEntry?: SessionEntry;
}): ReplyPayload | undefined;
