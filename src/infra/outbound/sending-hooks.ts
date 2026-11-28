// The outbound sending hooks as one helper: `message_sending` over the text,
// then `media_sending` over the attachments. Every path that sends agent
// output to an external surface runs it: core `deliverOutboundPayloads`, the
// core reply dispatcher (around each channel's `deliver` callback), the
// message-tool send action, and the channel-local send paths that bypass
// both (exposed to channel plugins as `runOutboundSendingHooks` on
// `@enclawed/plugin-sdk/outbound-runtime`).
//
// Fail-closed rule for media: an attachment the gateway cannot load, or a
// replacement it cannot save, throws, so the message is not sent. A handler
// that mediates media must never be bypassed by media it could not see.
// `message_sending` handler errors are contained by the hook runner itself.

import type { EnclawedConfig } from "../../config/types.enclawed.js";
import { resolveConfiguredMediaMaxBytes } from "../../media/configured-max-bytes.js";
import { MAX_DOCUMENT_BYTES } from "../../media/constants.js";
import {
  buildOutboundMediaLoadOptions,
  type OutboundMediaAccess,
} from "../../media/load-options.js";
import type { PluginHookOutboundMedia } from "../../plugins/hook-message.types.js";
import { getGlobalHookRunner } from "../../plugins/hook-runner-global.js";
import { isOutboundSendMediated } from "./sending-scope.js";

export type OutboundSendingHookRunner = Pick<
  NonNullable<ReturnType<typeof getGlobalHookRunner>>,
  "hasHooks" | "runMessageSending" | "runMediaSending"
>;
type HookRunner = OutboundSendingHookRunner;

let mediaSendingRuntimePromise: Promise<typeof import("./media-sending.runtime.js")> | undefined;

// Loaded only when a media_sending handler is registered and a send carries media.
async function loadMediaSendingRuntime() {
  mediaSendingRuntimePromise ??= import("./media-sending.runtime.js");
  return await mediaSendingRuntimePromise;
}

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

export type OutboundSendingOutcome =
  | { cancelled: true }
  | {
      cancelled: false;
      /** True when a hook rewrote the text or the attachments. */
      changed: boolean;
      text: string;
      /** Attachments to send, in order (saved replacements when rewritten). */
      mediaUrls: string[];
    };

/** True when a `message_sending` or `media_sending` handler is registered. */
export function hasOutboundSendingHooks(
  hookRunner: OutboundSendingHookRunner | null | undefined = getGlobalHookRunner(),
): boolean {
  return Boolean(
    hookRunner && (hookRunner.hasHooks("message_sending") || hookRunner.hasHooks("media_sending")),
  );
}

/** Outbound media as the hooks return it: bytes plus optional type and name. */
export type OutboundSendingMedia = { buffer: Buffer; contentType?: string; fileName?: string };

/**
 * Run `media_sending` over attachments the caller already holds as bytes.
 * Returns the replacement attachments when a handler rewrote them.
 */
export async function runMediaSendingHookOnLoadedMedia(params: {
  hookRunner: HookRunner;
  text: string;
  media: PluginHookOutboundMedia[];
  target: OutboundSendingTarget;
}): Promise<
  | { cancelled: true }
  | { cancelled: false; changed: false }
  | { cancelled: false; changed: true; media: OutboundSendingMedia[] }
> {
  const { target } = params;
  const result = await params.hookRunner.runMediaSending(
    {
      to: target.to,
      content: params.text,
      media: params.media,
      metadata: { ...target.metadata, channel: target.channel, accountId: target.accountId },
    },
    {
      channelId: target.channel,
      accountId: target.accountId,
      conversationId: target.conversationId ?? target.to,
    },
  );
  if (result?.cancel) {
    return { cancelled: true };
  }
  if (!result?.media) {
    return { cancelled: false, changed: false };
  }
  if (result.media.length === 0 && !params.text.trim()) {
    // Every attachment was dropped and there is no text left to send.
    return { cancelled: true };
  }
  return { cancelled: false, changed: true, media: result.media };
}

/** Largest attachment the sending hooks load: the configured cap, else the largest default. */
function resolveSendingMaxBytes(cfg: EnclawedConfig): number {
  // The media kind is unknown until the bytes are loaded, so the cap is the
  // configured media limit, else the largest per-kind default; the channel
  // still applies its own limit when it sends.
  return resolveConfiguredMediaMaxBytes(cfg) ?? MAX_DOCUMENT_BYTES;
}

/**
 * Run `media_sending` over one send's attachments. The media is loaded under
 * the sender's media-access policy, so a handler never sees a file the sender
 * could not send; replacements are saved to the outbound media store.
 */
export async function runMediaSendingHook(params: {
  hookRunner: HookRunner;
  text: string;
  mediaUrls: readonly string[];
  target: OutboundSendingTarget;
}): Promise<{ cancelled: true } | { cancelled: false; changed: boolean; mediaUrls: string[] }> {
  const { target } = params;
  const unchanged = { cancelled: false as const, changed: false, mediaUrls: [...params.mediaUrls] };
  if (params.mediaUrls.length === 0 || !params.hookRunner.hasHooks("media_sending")) {
    return unchanged;
  }
  const runtime = await loadMediaSendingRuntime();
  const mediaAccess = target.mediaAccess ?? {
    localRoots: runtime.getAgentScopedMediaLocalRoots(target.cfg, target.agentId),
  };
  const maxBytes = resolveSendingMaxBytes(target.cfg);
  const media: PluginHookOutboundMedia[] = [];
  for (const source of params.mediaUrls) {
    const loaded = await runtime.loadWebMediaRaw(
      source,
      buildOutboundMediaLoadOptions({ maxBytes, mediaAccess, optimizeImages: false }),
    );
    media.push({
      source,
      buffer: loaded.buffer,
      ...(loaded.contentType ? { contentType: loaded.contentType } : {}),
      ...(loaded.fileName ? { fileName: loaded.fileName } : {}),
    });
  }
  const result = await runMediaSendingHookOnLoadedMedia({
    hookRunner: params.hookRunner,
    text: params.text,
    media,
    target,
  });
  if (result.cancelled) {
    return { cancelled: true };
  }
  if (!result.changed) {
    return unchanged;
  }
  const mediaUrls: string[] = [];
  for (const item of result.media) {
    const saved = await runtime.saveMediaBuffer(
      item.buffer,
      item.contentType,
      "outbound",
      maxBytes,
      item.fileName,
    );
    mediaUrls.push(saved.path);
  }
  return { cancelled: false, changed: true, mediaUrls };
}

/**
 * Run `message_sending` then `media_sending` over one outbound send. A no-op
 * (unchanged) when no handler is registered, or when the caller is already
 * inside a delivery whose payload ran the hooks (see `sending-scope.ts`).
 */
export async function runOutboundSendingHooks(params: {
  text: string;
  mediaUrls?: readonly string[];
  target: OutboundSendingTarget;
  /**
   * Hook runner to use; defaults to the global one. Channel plugins pass the
   * runner they resolved through the plugin SDK so both stay the same seam.
   */
  hookRunner?: HookRunner | null;
}): Promise<OutboundSendingOutcome> {
  const mediaUrls = [...(params.mediaUrls ?? [])];
  const unchanged: OutboundSendingOutcome = {
    cancelled: false,
    changed: false,
    text: params.text,
    mediaUrls,
  };
  const hookRunner = params.hookRunner === undefined ? getGlobalHookRunner() : params.hookRunner;
  if (!hookRunner || isOutboundSendMediated()) {
    return unchanged;
  }
  const { target } = params;
  let text = params.text;
  let changed = false;
  if (hookRunner.hasHooks("message_sending")) {
    const result = await hookRunner.runMessageSending(
      {
        to: target.to,
        content: text,
        ...(target.replyToId != null ? { replyToId: target.replyToId } : {}),
        ...(target.threadId != null ? { threadId: target.threadId } : {}),
        metadata: {
          ...target.metadata,
          channel: target.channel,
          accountId: target.accountId,
          mediaUrls,
          ...(target.threadId != null ? { threadId: target.threadId } : {}),
        },
      },
      {
        channelId: target.channel,
        accountId: target.accountId,
        conversationId: target.conversationId ?? target.to,
      },
    );
    if (result?.cancel) {
      return { cancelled: true };
    }
    if (typeof result?.content === "string" && result.content !== text) {
      text = result.content;
      changed = true;
    }
  }
  const media = await runMediaSendingHook({ hookRunner, text, mediaUrls, target });
  if (media.cancelled) {
    return { cancelled: true };
  }
  return {
    cancelled: false,
    changed: changed || media.changed,
    text,
    mediaUrls: media.mediaUrls,
  };
}

/**
 * Apply a sending outcome to a reply payload: the rewritten text and, when the
 * attachments were rewritten, the saved replacements. Returns null when the
 * send was cancelled.
 */
export function applyOutboundSendingOutcome<
  T extends { text?: string; mediaUrl?: string; mediaUrls?: string[] },
>(payload: T, outcome: OutboundSendingOutcome): T | null {
  if (outcome.cancelled) {
    return null;
  }
  if (!outcome.changed) {
    return payload;
  }
  const originalText = payload.text ?? "";
  const textChanged = outcome.text !== originalText;
  const original = payload.mediaUrls?.length
    ? payload.mediaUrls
    : payload.mediaUrl
      ? [payload.mediaUrl]
      : [];
  const mediaChanged =
    original.length !== outcome.mediaUrls.length ||
    original.some((url, index) => url !== outcome.mediaUrls[index]);
  return {
    ...payload,
    ...(textChanged ? { text: outcome.text } : {}),
    ...(mediaChanged
      ? {
          mediaUrl: outcome.mediaUrls[0],
          mediaUrls: outcome.mediaUrls.length > 0 ? outcome.mediaUrls : undefined,
        }
      : {}),
  };
}
