import type { EnclawedConfig } from "../../config/types.enclawed.js";
import type { ConversationRef } from "../../infra/outbound/session-binding-service.js";
import type { ConfiguredBindingRecordResolution, ConfiguredBindingResolution } from "./binding-types.js";
export declare function primeConfiguredBindingRegistry(params: {
    cfg: EnclawedConfig;
}): {
    bindingCount: number;
    channelCount: number;
};
export declare function resolveConfiguredBindingRecord(params: {
    cfg: EnclawedConfig;
    channel: string;
    accountId: string;
    conversationId: string;
    parentConversationId?: string;
}): ConfiguredBindingRecordResolution | null;
export declare function resolveConfiguredBindingRecordForConversation(params: {
    cfg: EnclawedConfig;
    conversation: ConversationRef;
}): ConfiguredBindingRecordResolution | null;
export declare function resolveConfiguredBinding(params: {
    cfg: EnclawedConfig;
    conversation: ConversationRef;
}): ConfiguredBindingResolution | null;
export declare function resolveConfiguredBindingRecordBySessionKey(params: {
    cfg: EnclawedConfig;
    sessionKey: string;
}): ConfiguredBindingRecordResolution | null;
