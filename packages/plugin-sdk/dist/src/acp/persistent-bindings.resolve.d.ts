import type { EnclawedConfig } from "../config/types.enclawed.js";
import type { ConversationRef } from "../infra/outbound/session-binding-service.js";
import { type ConfiguredAcpBindingSpec, type ResolvedConfiguredAcpBinding } from "./persistent-bindings.types.js";
export declare function resolveConfiguredAcpBindingRecord(params: {
    cfg: EnclawedConfig;
    channel: string;
    accountId: string;
    conversationId: string;
    parentConversationId?: string;
}): ResolvedConfiguredAcpBinding | null;
export declare function resolveConfiguredAcpBindingRecordForConversation(params: {
    cfg: EnclawedConfig;
    conversation: ConversationRef;
}): ResolvedConfiguredAcpBinding | null;
export declare function resolveConfiguredAcpBindingSpecBySessionKey(params: {
    cfg: EnclawedConfig;
    sessionKey: string;
}): ConfiguredAcpBindingSpec | null;
