import type {
  ChannelThreadingContext,
  ChannelThreadingToolContext,
} from "@enclawed/plugin-sdk/channel-contract";
import type { EnclawedConfig } from "@enclawed/plugin-sdk/config-types";
import { normalizeOptionalString } from "@enclawed/plugin-sdk/text-runtime";
import { resolveSlackAccount, resolveSlackReplyToMode } from "./accounts.js";
import { normalizeSlackThreadTsCandidate } from "./thread-ts.js";

export function buildSlackThreadingToolContext(params: {
  cfg: EnclawedConfig;
  accountId?: string | null;
  context: ChannelThreadingContext;
  hasRepliedRef?: { value: boolean };
}): ChannelThreadingToolContext {
  const account = resolveSlackAccount({
    cfg: params.cfg,
    accountId: params.accountId,
  });
  const configuredReplyToMode = resolveSlackReplyToMode(account, params.context.ChatType);
  const hasExplicitThreadTarget = params.context.MessageThreadId != null;
  const effectiveReplyToMode = hasExplicitThreadTarget ? "all" : configuredReplyToMode;
  const threadId = params.context.MessageThreadId ?? params.context.ReplyToId;
  // For channel messages, To is "channel:C…" — extract the bare ID.
  // For DMs, To is "user:U…" which can't be used for reactions; fall back
  // to NativeChannelId (the raw Slack channel id, e.g. "D…").
  const currentChannelId = params.context.To?.startsWith("channel:")
    ? params.context.To.slice("channel:".length)
    : normalizeOptionalString(params.context.NativeChannelId);
  return {
    currentChannelId,
    currentThreadTs: normalizeSlackThreadTsCandidate(threadId),
    replyToMode: effectiveReplyToMode,
    hasRepliedRef: params.hasRepliedRef,
  };
}
