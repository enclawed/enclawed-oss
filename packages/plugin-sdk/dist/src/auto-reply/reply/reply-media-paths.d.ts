import type { EnclawedConfig } from "../../config/types.enclawed.js";
import type { ReplyPayload } from "../types.js";
export declare function createReplyMediaPathNormalizer(params: {
    cfg: EnclawedConfig;
    sessionKey?: string;
    workspaceDir: string;
    messageProvider?: string;
    accountId?: string;
    groupId?: string;
    groupChannel?: string;
    groupSpace?: string;
    requesterSenderId?: string;
    requesterSenderName?: string;
    requesterSenderUsername?: string;
    requesterSenderE164?: string;
}): (payload: ReplyPayload) => Promise<ReplyPayload>;
