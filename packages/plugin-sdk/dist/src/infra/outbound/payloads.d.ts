import { resolveSendableOutboundReplyParts } from "@enclawed/plugin-sdk/reply-payload";
import type { ReplyPayload } from "../../auto-reply/types.js";
import { type InteractiveReply } from "../../interactive/payload.js";
export type NormalizedOutboundPayload = {
    text: string;
    mediaUrls: string[];
    audioAsVoice?: boolean;
    interactive?: InteractiveReply;
    channelData?: Record<string, unknown>;
};
export type OutboundPayloadJson = {
    text: string;
    mediaUrl: string | null;
    mediaUrls?: string[];
    audioAsVoice?: boolean;
    interactive?: InteractiveReply;
    channelData?: Record<string, unknown>;
};
export type OutboundPayloadPlan = {
    payload: ReplyPayload;
    parts: ReturnType<typeof resolveSendableOutboundReplyParts>;
    hasInteractive: boolean;
    hasChannelData: boolean;
};
export type OutboundPayloadMirror = {
    text: string;
    mediaUrls: string[];
};
/**
 * What a turn that produced no visible text should leave behind.
 *
 * In a one-to-one chat the person addressed the agent directly, so delivering
 * nothing reads as a hang rather than as "nothing to add". In a room silence is
 * the desired outcome -- an agent that answers every message is noise -- and
 * internal sessions have no audience at all.
 */
export declare const SILENT_REPLY_VISIBLE_FALLBACK = "No response generated. Please try again.";
export declare function createOutboundPayloadPlan(payloads: readonly ReplyPayload[], _options?: {
    cfg?: import("../../config/types.enclawed.js").EnclawedConfig;
    sessionKey?: string;
    surface?: string;
}): OutboundPayloadPlan[];
export declare function projectOutboundPayloadPlanForDelivery(plan: readonly OutboundPayloadPlan[]): ReplyPayload[];
export declare function projectOutboundPayloadPlanForOutbound(plan: readonly OutboundPayloadPlan[]): NormalizedOutboundPayload[];
export declare function projectOutboundPayloadPlanForJson(plan: readonly OutboundPayloadPlan[]): OutboundPayloadJson[];
export declare function projectOutboundPayloadPlanForMirror(plan: readonly OutboundPayloadPlan[]): OutboundPayloadMirror;
export declare function summarizeOutboundPayloadForTransport(payload: ReplyPayload): NormalizedOutboundPayload;
export declare function normalizeReplyPayloadsForDelivery(payloads: readonly ReplyPayload[]): ReplyPayload[];
export declare function normalizeOutboundPayloads(payloads: readonly ReplyPayload[]): NormalizedOutboundPayload[];
export declare function normalizeOutboundPayloadsForJson(payloads: readonly ReplyPayload[]): OutboundPayloadJson[];
export declare function formatOutboundPayloadLog(payload: Pick<NormalizedOutboundPayload, "text" | "channelData"> & {
    mediaUrls: readonly string[];
}): string;
