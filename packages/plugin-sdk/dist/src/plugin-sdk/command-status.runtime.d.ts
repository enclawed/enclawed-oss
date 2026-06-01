import type { ReplyPayload } from "../auto-reply/types.js";
import type { EnclawedConfig } from "../config/types.enclawed.js";
export type ResolveDirectStatusReplyForSessionParams = {
    cfg: EnclawedConfig;
    sessionKey: string;
    channel: string;
    senderId?: string;
    senderIsOwner: boolean;
    isAuthorizedSender: boolean;
    isGroup: boolean;
    defaultGroupActivation: () => "always" | "mention";
};
export declare function resolveDirectStatusReplyForSession(params: ResolveDirectStatusReplyForSessionParams): Promise<ReplyPayload | undefined>;
