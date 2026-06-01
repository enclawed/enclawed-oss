import type { ChunkMode } from "../../auto-reply/chunk.js";
import type { ReplyPayload } from "../../auto-reply/reply-payload.js";
import type { MarkdownTableMode, ReplyToMode } from "../../config/types.base.js";
import type { EnclawedConfig } from "../../config/types.enclawed.js";
import type { OutboundDeliveryResult } from "../../infra/outbound/deliver-types.js";
import type { OutboundIdentity } from "../../infra/outbound/identity-types.js";
import type { OutboundSendDeps } from "../../infra/outbound/send-deps.js";
import type { MessagePresentation } from "../../interactive/payload.js";
import type { OutboundMediaAccess } from "../../media/load-options.js";
import type {
  ChannelOutboundTargetMode,
  ChannelPollContext,
  ChannelPollResult,
} from "./types.core.js";

/**
 * Optional per-delivery formatting knobs forwarded from a channel adapter to
 * its outbound rendering helpers. Adapters populate this with effective
 * config + channel limits so generic delivery helpers do not need to import
 * channel-specific config plumbing.
 */
export type ChannelOutboundFormattingOptions = {
  textLimit?: number;
  maxLinesPerMessage?: number;
  tableMode?: MarkdownTableMode;
  chunkMode?: ChunkMode;
};

/**
 * Per-channel presentation feature flags consumed by interactive reply
 * normalization. Adapters declare which presentation block kinds they can
 * actually render so the runtime can downgrade gracefully on channels that
 * cannot.
 */
export type ChannelPresentationCapabilities = {
  supported: boolean;
  buttons?: boolean;
  selects?: boolean;
  context?: boolean;
  divider?: boolean;
};

/**
 * Per-channel delivery-feature flags surfaced to runtime delivery planning.
 * Adapters set these to advertise optional behaviors such as message pinning.
 */
export type ChannelDeliveryCapabilities = {
  pin?: boolean;
};

/** Delivery-side pin request as resolved by the auto-reply layer. */
export type ChannelDeliveryPinRequest = {
  enabled: boolean;
  notify?: boolean;
};

export type ChannelOutboundContext = {
  cfg: EnclawedConfig;
  to: string;
  text: string;
  mediaUrl?: string;
  audioAsVoice?: boolean;
  mediaAccess?: OutboundMediaAccess;
  mediaLocalRoots?: readonly string[];
  mediaReadFile?: (filePath: string) => Promise<Buffer>;
  gifPlayback?: boolean;
  /** Send image as document to avoid Telegram compression. */
  forceDocument?: boolean;
  replyToId?: string | null;
  /** Source of the resolved reply-to id (explicit tag vs implicit last-route). */
  replyToIdSource?: "explicit" | "implicit";
  /**
   * Optional per-target reply policy override.
   *
   * When present, overrides the channel default reply-to mode for this
   * delivery. Used by outbound adapters that propagate a configured
   * pin/reply-policy from the channel plugin to delivery-time helpers.
   */
  replyToMode?: ReplyToMode;
  threadId?: string | number | null;
  accountId?: string | null;
  identity?: OutboundIdentity;
  deps?: OutboundSendDeps;
  silent?: boolean;
  gatewayClientScopes?: readonly string[];
  /** Optional per-delivery formatting knobs forwarded from the channel adapter. */
  formatting?: ChannelOutboundFormattingOptions;
};

export type ChannelOutboundPayloadContext = ChannelOutboundContext & {
  payload: ReplyPayload;
};

export type ChannelOutboundPayloadHint =
  | { kind: "approval-pending"; approvalKind: "exec" | "plugin"; nativeRouteActive?: boolean }
  | { kind: "approval-resolved"; approvalKind: "exec" | "plugin"; nativeRouteActive?: boolean };

export type ChannelOutboundTargetRef = {
  channel: string;
  to: string;
  accountId?: string | null;
  threadId?: string | number | null;
};

export type ChannelOutboundFormattedContext = ChannelOutboundContext & {
  abortSignal?: AbortSignal;
};

export type ChannelOutboundAdapter = {
  deliveryMode: "direct" | "gateway" | "hybrid";
  chunker?:
    | ((
        text: string,
        limit: number,
        ctx?: { formatting?: ChannelOutboundFormattingOptions },
      ) => string[])
    | null;
  chunkerMode?: "text" | "markdown";
  /**
   * When true, extract inline markdown images from outbound text and deliver
   * them as native media attachments (Telegram). Default: false.
   */
  extractMarkdownImages?: boolean;
  textChunkLimit?: number;
  sanitizeText?: (params: { text: string; payload: ReplyPayload }) => string;
  pollMaxOptions?: number;
  supportsPollDurationSeconds?: boolean;
  supportsAnonymousPolls?: boolean;
  normalizePayload?: (params: { payload: ReplyPayload }) => ReplyPayload | null;
  shouldSkipPlainTextSanitization?: (params: { payload: ReplyPayload }) => boolean;
  resolveEffectiveTextChunkLimit?: (params: {
    cfg: EnclawedConfig;
    accountId?: string | null;
    fallbackLimit?: number;
  }) => number | undefined;
  shouldSuppressLocalPayloadPrompt?: (params: {
    cfg: EnclawedConfig;
    accountId?: string | null;
    payload: ReplyPayload;
    hint?: ChannelOutboundPayloadHint;
  }) => boolean;
  beforeDeliverPayload?: (params: {
    cfg: EnclawedConfig;
    target: ChannelOutboundTargetRef;
    payload: ReplyPayload;
    hint?: ChannelOutboundPayloadHint;
  }) => Promise<void> | void;
  /**
   * Optional post-delivery hook invoked after a payload is delivered. Used for
   * channel-side bookkeeping such as touching thread-binding activity.
   */
  afterDeliverPayload?: (params: {
    cfg: EnclawedConfig;
    target: ChannelOutboundTargetRef;
    payload?: ReplyPayload;
    /** Delivery results returned by the transport for this payload. */
    results?: readonly OutboundDeliveryResult[];
  }) => Promise<void> | void;
  /**
   * @deprecated Use shouldTreatDeliveredTextAsVisible instead.
   */
  shouldTreatRoutedTextAsVisible?: (params: {
    kind: "tool" | "block" | "final";
    text?: string;
  }) => boolean;
  shouldTreatDeliveredTextAsVisible?: (params: {
    kind: "tool" | "block" | "final";
    text?: string;
  }) => boolean;
  targetsMatchForReplySuppression?: (params: {
    originTarget: string;
    targetKey: string;
    targetThreadId?: string;
  }) => boolean;
  resolveTarget?: (params: {
    cfg?: EnclawedConfig;
    to?: string;
    allowFrom?: string[];
    accountId?: string | null;
    mode?: ChannelOutboundTargetMode;
  }) => { ok: true; to: string } | { ok: false; error: Error };
  sendPayload?: (ctx: ChannelOutboundPayloadContext) => Promise<OutboundDeliveryResult>;
  sendFormattedText?: (ctx: ChannelOutboundFormattedContext) => Promise<OutboundDeliveryResult[]>;
  sendFormattedMedia?: (
    ctx: ChannelOutboundFormattedContext & { mediaUrl: string },
  ) => Promise<OutboundDeliveryResult>;
  sendText?: (ctx: ChannelOutboundContext) => Promise<OutboundDeliveryResult>;
  sendMedia?: (ctx: ChannelOutboundContext) => Promise<OutboundDeliveryResult>;
  sendPoll?: (ctx: ChannelPollContext) => Promise<ChannelPollResult>;
  /**
   * Per-channel feature flags for interactive-reply / presentation rendering.
   * Used by runtime presentation normalization to downgrade unsupported block
   * kinds for channels that cannot render them natively.
   */
  presentationCapabilities?: ChannelPresentationCapabilities;
  /** Per-channel delivery-feature flags such as message pinning. */
  deliveryCapabilities?: ChannelDeliveryCapabilities;
  /**
   * Optional payload renderer for interactive-message presentation blocks.
   *
   * Adapters that natively render presentation blocks (Slack, Discord, Telegram
   * inline keyboards, Feishu cards, etc.) implement this to produce a payload
   * tailored to their transport.
   */
  renderPresentation?: (params: {
    payload: ReplyPayload;
    presentation: MessagePresentation;
    /** Optional outbound context for adapters that need identity/target hints. */
    ctx?: ChannelOutboundPayloadContext;
  }) => ReplyPayload | null | Promise<ReplyPayload | null>;
  /**
   * Optional post-delivery pin/unpin action for channels that support it.
   *
   * Invoked by the auto-reply layer when the reply payload requests pinning.
   */
  pinDeliveredMessage?: (params: {
    cfg: EnclawedConfig;
    target: ChannelOutboundTargetRef;
    messageId: string;
    pin: ChannelDeliveryPinRequest;
  }) => Promise<void> | void;
  /**
   * When true, fall back to the final assistant visible text for one-shot
   * deliveries such as cron announcements where the channel cannot replay the
   * full transcript.
   */
  preferFinalAssistantVisibleText?: boolean;
};
