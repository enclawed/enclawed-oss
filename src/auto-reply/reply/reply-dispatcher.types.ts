import type { ReplyPayload } from "../types.js";

export type ReplyDispatchKind = "tool" | "block" | "final";

/**
 * Last step before a channel's `deliver` callback: returns the payload to
 * deliver, or null to drop it. Installed by core reply dispatch to run the
 * outbound sending hooks (`message_sending`, `media_sending`) on every reply.
 */
export type ReplyOutboundMediator = (
  payload: ReplyPayload,
  info: { kind: ReplyDispatchKind },
) => Promise<ReplyPayload | null>;

export type ReplyDispatcher = {
  sendToolResult: (payload: ReplyPayload) => boolean;
  sendBlockReply: (payload: ReplyPayload) => boolean;
  sendFinalReply: (payload: ReplyPayload) => boolean;
  waitForIdle: () => Promise<void>;
  getQueuedCounts: () => Record<ReplyDispatchKind, number>;
  getFailedCounts: () => Record<ReplyDispatchKind, number>;
  markComplete: () => void;
  /**
   * Install (or clear) the outbound mediator. Core reply dispatch sets it when
   * an outbound sending hook is registered; the channel's `deliver` callback
   * then receives the mediated payload. Optional so hand-written dispatchers
   * stay valid.
   */
  setOutboundMediator?: (mediator: ReplyOutboundMediator | undefined) => void;
};
