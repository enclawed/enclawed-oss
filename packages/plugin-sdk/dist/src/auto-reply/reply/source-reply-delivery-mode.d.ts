import type { EnclawedConfig } from "../../config/types.enclawed.js";
import type { SessionSendPolicyDecision } from "../../sessions/send-policy.js";
import type { SourceReplyDeliveryMode } from "../get-reply-options.types.js";
export type SourceReplyDeliveryModeContext = {
    ChatType?: string;
    CommandSource?: "text" | "native";
};
export declare function resolveSourceReplyDeliveryMode(params: {
    cfg: EnclawedConfig;
    ctx: SourceReplyDeliveryModeContext;
    requested?: SourceReplyDeliveryMode;
    messageToolAvailable?: boolean;
    defaultVisibleReplies?: "automatic" | "message_tool";
}): SourceReplyDeliveryMode;
export type SourceReplyVisibilityPolicy = {
    sourceReplyDeliveryMode: SourceReplyDeliveryMode;
    sendPolicyDenied: boolean;
    suppressAutomaticSourceDelivery: boolean;
    suppressDelivery: boolean;
    suppressHookUserDelivery: boolean;
    suppressHookReplyLifecycle: boolean;
    suppressTyping: boolean;
    deliverySuppressionReason: string;
};
export declare function resolveSourceReplyVisibilityPolicy(params: {
    cfg: EnclawedConfig;
    ctx: SourceReplyDeliveryModeContext;
    requested?: SourceReplyDeliveryMode;
    sendPolicy: SessionSendPolicyDecision;
    suppressAcpChildUserDelivery?: boolean;
    explicitSuppressTyping?: boolean;
    shouldSuppressTyping?: boolean;
    messageToolAvailable?: boolean;
    defaultVisibleReplies?: "automatic" | "message_tool";
}): SourceReplyVisibilityPolicy;
