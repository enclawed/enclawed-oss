import type { EnclawedConfig } from "../config/types.enclawed.js";
export type ConversationBindingContext = {
    channel: string;
    accountId: string;
    conversationId: string;
    parentConversationId?: string;
    threadId?: string;
};
export type ResolveConversationBindingContextInput = {
    cfg: EnclawedConfig;
    channel?: string | null;
    accountId?: string | null;
    chatType?: string | null;
    threadId?: string | number | null;
    threadParentId?: string | null;
    senderId?: string | null;
    sessionKey?: string | null;
    parentSessionKey?: string | null;
    originatingTo?: string | null;
    commandTo?: string | null;
    fallbackTo?: string | null;
    from?: string | null;
    nativeChannelId?: string | null;
};
export declare function resolveConversationBindingContext(params: ResolveConversationBindingContextInput): ConversationBindingContext | null;
