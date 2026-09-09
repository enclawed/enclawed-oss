import type { ReplyPayload } from "../auto-reply/reply-payload.js";

export type PluginConversationBindingRequestParams = {
  summary?: string;
  detachHint?: string;
  /**
   * Opaque plugin-owned payload persisted with the binding. Returned verbatim
   * to the plugin via `PluginConversationBinding.data` and the resolved-event
   * request snapshot.
   */
  data?: Record<string, unknown>;
};

export type PluginConversationBindingResolutionDecision = "allow-once" | "allow-always" | "deny";

export type PluginConversationBinding = {
  bindingId: string;
  pluginId: string;
  pluginName?: string;
  pluginRoot: string;
  channel: string;
  accountId: string;
  conversationId: string;
  parentConversationId?: string;
  threadId?: string | number;
  boundAt: number;
  summary?: string;
  detachHint?: string;
  /** Opaque plugin-owned payload persisted with this binding. */
  data?: Record<string, unknown>;
};

export type PluginConversationBindingRequestResult =
  | {
      status: "bound";
      binding: PluginConversationBinding;
    }
  | {
      status: "pending";
      approvalId: string;
      reply: ReplyPayload;
    }
  | {
      status: "error";
      message: string;
    };

export type PluginConversationBindingResolvedEvent = {
  status: "approved" | "denied";
  binding?: PluginConversationBinding;
  decision: PluginConversationBindingResolutionDecision;
  request: {
    summary?: string;
    detachHint?: string;
    requestedBySenderId?: string;
    /** Opaque plugin-owned payload supplied when the binding was requested. */
    data?: Record<string, unknown>;
    conversation: {
      channel: string;
      accountId: string;
      conversationId: string;
      parentConversationId?: string;
      threadId?: string | number;
    };
  };
};
