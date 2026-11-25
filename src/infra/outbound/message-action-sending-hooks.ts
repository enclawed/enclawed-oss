// Outbound sending hooks for the message tool. A channel plugin that handles
// a message action itself (Discord, Slack, Matrix, Signal, Zalo, ...) sends
// from its own code, outside `deliverOutboundPayloads`, so without this the
// `message_sending` and `media_sending` hooks never saw a tool-driven send.
// The message-carrying actions run the hooks here, before the plugin (or the
// core send path) sees the arguments; the send then runs inside the mediated
// scope so the core path does not run them a second time.
//
// Actions that do not carry a message (renames, topics, profiles, polls, ...)
// are outside this hook's scope; the tool-call chokepoint (`before_tool_call`
// on the `message` tool) covers their arguments.

import type { EnclawedConfig } from "../../config/types.enclawed.js";
import type { OutboundMediaAccess } from "../../media/load-options.js";
import { getGlobalHookRunner } from "../../plugins/hook-runner-global.js";
import {
  runMediaSendingHookOnLoadedMedia,
  runOutboundSendingHooks,
  type OutboundSendingTarget,
} from "./sending-hooks.js";
import { isOutboundSendMediated } from "./sending-scope.js";

/** Message actions whose arguments are an outbound message. */
const MESSAGE_CARRYING_ACTIONS: ReadonlySet<string> = new Set([
  "send",
  "reply",
  "thread-reply",
  "edit",
  "sendWithEffect",
  "sendAttachment",
  "upload-file",
]);

const TEXT_KEYS = ["message", "caption"] as const;
const MEDIA_KEYS = ["media", "mediaUrl", "path", "filePath", "fileUrl"] as const;

export class MessageActionSendCancelledError extends Error {
  constructor(action: string) {
    super(`message ${action} was blocked by an outbound sending hook`);
    this.name = "MessageActionSendCancelledError";
  }
}

/** True when `action` must run the outbound sending hooks in this process. */
export function shouldMediateMessageAction(action: string): boolean {
  if (!MESSAGE_CARRYING_ACTIONS.has(action) || isOutboundSendMediated()) {
    return false;
  }
  const hookRunner = getGlobalHookRunner();
  return Boolean(
    hookRunner && (hookRunner.hasHooks("message_sending") || hookRunner.hasHooks("media_sending")),
  );
}

/**
 * Run the outbound sending hooks over a message action's arguments, in place:
 * the message (or caption) text and the attachment are replaced by the
 * mediated ones. An inline base64 `buffer` (agent-supplied, or hydrated from
 * a path for attachment actions) is what the plugin sends, so it is mediated
 * as bytes. Throws `MessageActionSendCancelledError` when a hook cancels.
 */
export async function mediateMessageActionArgs(params: {
  cfg: EnclawedConfig;
  channel: string;
  action: string;
  args: Record<string, unknown>;
  to?: string;
  accountId?: string;
  threadId?: string | number;
  replyToId?: string;
  agentId?: string;
  mediaAccess?: OutboundMediaAccess;
  /** Extra attachments the caller resolved (for example MEDIA: directives). */
  mediaUrls?: readonly string[];
}): Promise<{ text: string; mediaUrls: string[] }> {
  const { args } = params;
  const textKey = TEXT_KEYS.find((key) => typeof args[key] === "string" && args[key] !== "");
  const text = textKey ? (args[textKey] as string) : "";
  const inlineBuffer =
    typeof args.buffer === "string" && args.buffer.length > 0 ? args.buffer : undefined;
  const sources: string[] = [];
  for (const key of MEDIA_KEYS) {
    const value = args[key];
    if (typeof value === "string" && value.trim() && !sources.includes(value.trim())) {
      sources.push(value.trim());
    }
  }
  for (const url of params.mediaUrls ?? []) {
    if (url.trim() && !sources.includes(url.trim())) {
      sources.push(url.trim());
    }
  }
  const to =
    params.to ??
    (typeof args.to === "string" ? args.to : undefined) ??
    (typeof args.target === "string" ? args.target : undefined) ??
    (typeof args.channelId === "string" ? args.channelId : undefined) ??
    "unknown";
  const target: OutboundSendingTarget = {
    cfg: params.cfg,
    channel: params.channel,
    to,
    accountId: params.accountId,
    threadId: params.threadId,
    replyToId: params.replyToId,
    agentId: params.agentId,
    mediaAccess: params.mediaAccess,
    metadata: { messageAction: params.action },
  };
  // With an inline buffer the bytes are the attachment: the text runs the
  // hooks alone and the buffer runs media_sending as loaded media.
  const outcome = await runOutboundSendingHooks({
    text,
    mediaUrls: inlineBuffer ? [] : sources,
    target,
  });
  if (outcome.cancelled) {
    throw new MessageActionSendCancelledError(params.action);
  }
  if (textKey && outcome.text !== text) {
    args[textKey] = outcome.text;
  }
  const hookRunner = getGlobalHookRunner();
  if (inlineBuffer && hookRunner?.hasHooks("media_sending")) {
    const contentType = typeof args.contentType === "string" ? args.contentType : undefined;
    const fileName = typeof args.filename === "string" ? args.filename : undefined;
    const media = await runMediaSendingHookOnLoadedMedia({
      hookRunner,
      text: outcome.text,
      media: [
        {
          source: sources[0] ?? "inline:buffer",
          buffer: Buffer.from(inlineBuffer, "base64"),
          ...(contentType ? { contentType } : {}),
          ...(fileName ? { fileName } : {}),
        },
      ],
      target,
    });
    if (media.cancelled) {
      throw new MessageActionSendCancelledError(params.action);
    }
    if (media.changed) {
      for (const key of MEDIA_KEYS) {
        delete args[key];
      }
      const replacement = media.media[0];
      if (replacement) {
        args.buffer = replacement.buffer.toString("base64");
        if (replacement.contentType) {
          args.contentType = replacement.contentType;
        }
      } else {
        delete args.buffer;
      }
    }
    return { text: outcome.text, mediaUrls: media.changed ? [] : sources };
  }
  const mediaChanged =
    outcome.mediaUrls.length !== sources.length ||
    outcome.mediaUrls.some((url, index) => url !== sources[index]);
  if (mediaChanged) {
    for (const key of MEDIA_KEYS) {
      delete args[key];
    }
    if (outcome.mediaUrls[0]) {
      args.media = outcome.mediaUrls[0];
    }
  }
  return { text: outcome.text, mediaUrls: outcome.mediaUrls };
}
