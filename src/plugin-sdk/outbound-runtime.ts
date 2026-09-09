export { createRuntimeOutboundDelegates } from "../channels/plugins/runtime-forwarders.js";
export { resolveOutboundSendDep, type OutboundSendDeps } from "../infra/outbound/send-deps.js";
export { resolveAgentOutboundIdentity, type OutboundIdentity } from "../infra/outbound/identity.js";
export { sanitizeForPlainText } from "../infra/outbound/sanitize-text.js";

export { buildOutboundSessionContext } from "../infra/outbound/session-context.js";
export {
  createOutboundPayloadPlan,
  projectOutboundPayloadPlanForDelivery,
} from "../infra/outbound/payloads.js";
export { deliverOutboundPayloads } from "../infra/outbound/deliver.js";

export { createReplyToFanout } from "../infra/outbound/reply-policy.js";
export type { ReplyToResolution } from "../infra/outbound/reply-policy.js";

import type { ChunkMode } from "../auto-reply/chunk.js";
import type { MarkdownTableMode } from "../config/types.base.js";

/**
 * Outbound text-rendering knobs shared by channel delivery helpers.
 *
 * Channels build this from their per-account/per-channel config and pass it to
 * the shared outbound delivery routines (Discord, Slack, Telegram, etc.) so
 * formatting policy stays inside the channel plugin instead of leaking into
 * generic delivery code.
 */
export type OutboundDeliveryFormattingOptions = {
  textLimit: number;
  maxLinesPerMessage?: number;
  tableMode?: MarkdownTableMode;
  chunkMode?: ChunkMode;
};
