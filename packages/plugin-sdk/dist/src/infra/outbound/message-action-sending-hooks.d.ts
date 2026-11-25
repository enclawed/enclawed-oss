import type { EnclawedConfig } from "../../config/types.enclawed.js";
import type { OutboundMediaAccess } from "../../media/load-options.js";
export declare class MessageActionSendCancelledError extends Error {
    constructor(action: string);
}
/** True when `action` must run the outbound sending hooks in this process. */
export declare function shouldMediateMessageAction(action: string): boolean;
/**
 * Run the outbound sending hooks over a message action's arguments, in place:
 * the message (or caption) text and the attachment are replaced by the
 * mediated ones. An inline base64 `buffer` (agent-supplied, or hydrated from
 * a path for attachment actions) is what the plugin sends, so it is mediated
 * as bytes. Throws `MessageActionSendCancelledError` when a hook cancels.
 */
export declare function mediateMessageActionArgs(params: {
    cfg: EnclawedConfig;
    channel: string;
    action: string;
    args: Record<string, unknown>;
    to?: string;
    accountId?: string;
    threadId?: string | number;
    replyToId?: string;
    agentId?: string;
    mediaAccess?: OutboundMediaAccess;
    /** Extra attachments the caller resolved (for example MEDIA: directives). */
    mediaUrls?: readonly string[];
}): Promise<{
    text: string;
    mediaUrls: string[];
}>;
