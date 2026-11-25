import type { EnclawedConfig } from "../../config/types.enclawed.js";
import type { GetReplyOptions } from "../get-reply-options.types.js";
import type { ReplyOutboundMediator } from "./reply-dispatcher.types.js";
export type ReplyOutboundMediatorTarget = {
    cfg: EnclawedConfig;
    channel: string;
    to: string;
    accountId?: string;
    threadId?: string | number;
    agentId?: string;
    sessionKey?: string;
    requesterSenderId?: string;
    requesterSenderName?: string;
    requesterSenderUsername?: string;
    requesterSenderE164?: string;
};
export declare function createReplyOutboundMediator(target: ReplyOutboundMediatorTarget): ReplyOutboundMediator;
export declare function withoutUnmediatedStreamingCallbacks<T extends Partial<GetReplyOptions>>(options: T): T;
