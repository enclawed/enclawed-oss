export type PluginHookMessageContext = {
  channelId: string;
  accountId?: string;
  conversationId?: string;
  /**
   * Correlation fields. Without these a hook can identify the conversation but
   * not the turn, which makes the event unusable for anything that has to line
   * up with the transcript or a later message_sent.
   */
  sessionKey?: string;
  messageId?: string;
  senderId?: string;
};

export type PluginHookInboundClaimContext = PluginHookMessageContext & {
  parentConversationId?: string;
  senderId?: string;
  messageId?: string;
  /**
   * The active plugin conversation binding for this conversation, when one is
   * bound. Plugins read their persisted `data` payload from it to drive
   * binding-scoped inbound handling.
   */
  pluginBinding?: import("./conversation-binding.types.js").PluginConversationBinding | null;
};

export type PluginHookInboundClaimEvent = {
  content: string;
  body?: string;
  bodyForAgent?: string;
  transcript?: string;
  timestamp?: number;
  channel: string;
  accountId?: string;
  conversationId?: string;
  parentConversationId?: string;
  senderId?: string;
  senderName?: string;
  senderUsername?: string;
  threadId?: string | number;
  messageId?: string;
  isGroup: boolean;
  commandAuthorized?: boolean;
  wasMentioned?: boolean;
  metadata?: Record<string, unknown>;
};

export type PluginHookMessageReceivedEvent = {
  from: string;
  content: string;
  timestamp?: number;
  /** Correlation fields, alongside the copies kept in `metadata`. */
  sessionKey?: string;
  messageId?: string;
  senderId?: string;
  metadata?: Record<string, unknown>;
};

export type PluginHookMessageSendingEvent = {
  to: string;
  content: string;
  /** Optional reply-to message id for the outbound message. */
  replyToId?: string | number;
  /** Optional thread/topic id for the outbound message. */
  threadId?: string | number;
  metadata?: Record<string, unknown>;
};

export type PluginHookMessageSendingResult = {
  content?: string;
  cancel?: boolean;
};

/** One outbound attachment, loaded under the sender's media-access policy. */
export type PluginHookOutboundMedia = {
  /** Where the media came from (URL or local path), or `plugin:<id>` after a rewrite. */
  source: string;
  buffer: Buffer;
  contentType?: string;
  fileName?: string;
};

/**
 * `media_sending`: the attachments of one outbound message, after
 * `message_sending` and before the channel adapter sends them. Fires only when
 * the message carries media and a handler is registered; the gateway loads
 * the media bytes for it.
 */
export type PluginHookMediaSendingEvent = {
  to: string;
  /** Caption or text that goes with the media (after `message_sending`). */
  content: string;
  /** Attachments in send order. Later handlers see earlier rewrites. */
  media: PluginHookOutboundMedia[];
  metadata?: Record<string, unknown>;
};

export type PluginHookMediaSendingResult = {
  /**
   * Replacement attachments, in send order. They are saved and sent in place
   * of the originals; an empty list sends the text alone.
   */
  media?: Array<{ buffer: Buffer; contentType?: string; fileName?: string }>;
  /** Drop the whole message. Terminal: later handlers are skipped. */
  cancel?: boolean;
};

export type PluginHookMessageSentEvent = {
  to: string;
  content: string;
  success: boolean;
  error?: string;
};
