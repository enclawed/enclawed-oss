// Runs the outbound sending hooks (`message_sending`, `media_sending`) on
// every reply the core reply dispatcher hands to a channel. Channel reply
// deliverers (Telegram, Slack, Signal, WhatsApp, Matrix, LINE, Zalo, ... and
// third-party channels) each own their own send code, so the only point every
// one of them shares is the dispatcher's `deliver` call; mediating there
// covers them all without per-channel hook code. Discord-style deliverers
// that call `deliverOutboundPayloads` themselves run inside the mediated
// scope, so the hooks do not run twice (see `infra/outbound/sending-scope.ts`).

import type { EnclawedConfig } from "../../config/types.enclawed.js";
import {
  applyOutboundSendingOutcome,
  runOutboundSendingHooks,
} from "../../infra/outbound/sending-hooks.js";
import { hasReplyPayloadContent } from "../../interactive/payload.js";
import { resolveAgentScopedOutboundMediaAccess } from "../../media/read-capability.js";
import type { GetReplyOptions } from "../get-reply-options.types.js";
import type { ReplyOutboundMediator } from "./reply-dispatcher.types.js";

export type ReplyOutboundMediatorTarget = {
  cfg: EnclawedConfig;
  channel: string;
  to: string;
  accountId?: string;
  threadId?: string | number;
  agentId?: string;
  sessionKey?: string;
  requesterSenderId?: string;
  requesterSenderName?: string;
  requesterSenderUsername?: string;
  requesterSenderE164?: string;
};

export function createReplyOutboundMediator(
  target: ReplyOutboundMediatorTarget,
): ReplyOutboundMediator {
  return async (payload, info) => {
    const mediaUrls = payload.mediaUrls?.length
      ? payload.mediaUrls
      : payload.mediaUrl
        ? [payload.mediaUrl]
        : [];
    const mediaAccess =
      mediaUrls.length > 0
        ? resolveAgentScopedOutboundMediaAccess({
            cfg: target.cfg,
            agentId: target.agentId,
            mediaSources: mediaUrls,
            sessionKey: target.sessionKey,
            messageProvider: target.sessionKey ? undefined : target.channel,
            accountId: target.accountId,
            requesterSenderId: target.requesterSenderId,
            requesterSenderName: target.requesterSenderName,
            requesterSenderUsername: target.requesterSenderUsername,
            requesterSenderE164: target.requesterSenderE164,
          })
        : undefined;
    const outcome = await runOutboundSendingHooks({
      text: payload.text ?? "",
      mediaUrls,
      target: {
        cfg: target.cfg,
        channel: target.channel,
        to: target.to,
        accountId: target.accountId,
        threadId: target.threadId,
        ...(payload.replyToId ? { replyToId: payload.replyToId } : {}),
        agentId: target.agentId,
        mediaAccess,
        metadata: { replyKind: info.kind },
      },
    });
    const mediated = applyOutboundSendingOutcome(payload, outcome);
    if (!mediated) {
      return null;
    }
    // A hook that emptied the text of a text-only reply leaves nothing to send.
    if (mediated !== payload && !hasReplyPayloadContent(mediated)) {
      return null;
    }
    return mediated;
  };
}

/**
 * Streaming callbacks that put agent text on a channel surface outside the
 * reply dispatcher: preview drafts edited in place, reasoning lanes and
 * progress drafts. A `message_sending` or `media_sending` handler never sees
 * those bytes, so a handler that rewrites or cancels a reply would be
 * defeated by a preview that already showed the draft. While such a handler
 * is registered they are withheld; the final, block and tool replies still go
 * through the dispatcher and the hooks.
 */
const UNMEDIATED_STREAMING_CALLBACKS = [
  "onPartialReply",
  "onReasoningStream",
  "onItemEvent",
  "onPlanUpdate",
  "onCommandOutput",
  "onPatchSummary",
] as const satisfies ReadonlyArray<keyof GetReplyOptions>;

export function withoutUnmediatedStreamingCallbacks<T extends Partial<GetReplyOptions>>(
  options: T,
): T {
  const next = { ...options };
  for (const key of UNMEDIATED_STREAMING_CALLBACKS) {
    delete next[key];
  }
  return next;
}
