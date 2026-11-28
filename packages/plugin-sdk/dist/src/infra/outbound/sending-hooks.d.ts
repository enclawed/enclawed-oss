import type { EnclawedConfig } from "../../config/types.enclawed.js";
import { type OutboundMediaAccess } from "../../media/load-options.js";
import type { PluginHookOutboundMedia } from "../../plugins/hook-message.types.js";
import { getGlobalHookRunner } from "../../plugins/hook-runner-global.js";
export type OutboundSendingHookRunner = Pick<NonNullable<ReturnType<typeof getGlobalHookRunner>>, "hasHooks" | "runMessageSending" | "runMediaSending">;
type HookRunner = OutboundSendingHookRunner;
/** Where one outbound send goes. */
export type OutboundSendingTarget = {
    cfg: EnclawedConfig;
    /** Channel id (`telegram`, `discord`, ...). */
    channel: string;
    /** Recipient as the channel addresses it. */
    to: string;
    accountId?: string;
    /** Conversation the send belongs to; defaults to `to`. */
    conversationId?: string;
    replyToId?: string | number;
    threadId?: string | number;
    /** Agent whose workspace may hold the media; scopes the default media roots. */
    agentId?: string;
    /**
     * Media-access policy for loading attachments. Defaults to the agent-scoped
     * local roots (state, config and agent workspace directories).
     */
    mediaAccess?: OutboundMediaAccess;
    /** Extra metadata handed to the hooks alongside `channel` and `accountId`. */
    metadata?: Record<string, unknown>;
};
export type OutboundSendingOutcome = {
    cancelled: true;
} | {
    cancelled: false;
    /** True when a hook rewrote the text or the attachments. */
    changed: boolean;
    text: string;
    /** Attachments to send, in order (saved replacements when rewritten). */
    mediaUrls: string[];
};
/** True when a `message_sending` or `media_sending` handler is registered. */
export declare function hasOutboundSendingHooks(hookRunner?: OutboundSendingHookRunner | null | undefined): boolean;
/** Outbound media as the hooks return it: bytes plus optional type and name. */
export type OutboundSendingMedia = {
    buffer: Buffer;
    contentType?: string;
    fileName?: string;
};
/**
 * Run `media_sending` over attachments the caller already holds as bytes.
 * Returns the replacement attachments when a handler rewrote them.
 */
export declare function runMediaSendingHookOnLoadedMedia(params: {
    hookRunner: HookRunner;
    text: string;
    media: PluginHookOutboundMedia[];
    target: OutboundSendingTarget;
}): Promise<{
    cancelled: true;
} | {
    cancelled: false;
    changed: false;
} | {
    cancelled: false;
    changed: true;
    media: OutboundSendingMedia[];
}>;
/**
 * Run `media_sending` over one send's attachments. The media is loaded under
 * the sender's media-access policy, so a handler never sees a file the sender
 * could not send; replacements are saved to the outbound media store.
 */
export declare function runMediaSendingHook(params: {
    hookRunner: HookRunner;
    text: string;
    mediaUrls: readonly string[];
    target: OutboundSendingTarget;
}): Promise<{
    cancelled: true;
} | {
    cancelled: false;
    changed: boolean;
    mediaUrls: string[];
}>;
/**
 * Run `message_sending` then `media_sending` over one outbound send. A no-op
 * (unchanged) when no handler is registered, or when the caller is already
 * inside a delivery whose payload ran the hooks (see `sending-scope.ts`).
 */
export declare function runOutboundSendingHooks(params: {
    text: string;
    mediaUrls?: readonly string[];
    target: OutboundSendingTarget;
    /**
     * Hook runner to use; defaults to the global one. Channel plugins pass the
     * runner they resolved through the plugin SDK so both stay the same seam.
     */
    hookRunner?: HookRunner | null;
}): Promise<OutboundSendingOutcome>;
/**
 * Apply a sending outcome to a reply payload: the rewritten text and, when the
 * attachments were rewritten, the saved replacements. Returns null when the
 * send was cancelled.
 */
export declare function applyOutboundSendingOutcome<T extends {
    text?: string;
    mediaUrl?: string;
    mediaUrls?: string[];
}>(payload: T, outcome: OutboundSendingOutcome): T | null;
export {};
