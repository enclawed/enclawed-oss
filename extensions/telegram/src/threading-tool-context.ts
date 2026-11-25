import type {
  ChannelThreadingContext,
  ChannelThreadingToolContext,
} from "@enclawed/plugin-sdk/channel-contract";
import type { EnclawedConfig } from "@enclawed/plugin-sdk/config-types";
import { normalizeOptionalString } from "@enclawed/plugin-sdk/text-runtime";
import { parseTelegramTarget } from "./targets.js";

function resolveTelegramToolContextThreadId(context: ChannelThreadingContext): string | undefined {
  if (context.MessageThreadId != null) {
    return String(context.MessageThreadId);
  }
  const currentChannelId = normalizeOptionalString(context.To);
  if (!currentChannelId) {
    return undefined;
  }
  const parsedTarget = parseTelegramTarget(currentChannelId);
  return parsedTarget.messageThreadId != null ? String(parsedTarget.messageThreadId) : undefined;
}

export function buildTelegramThreadingToolContext(params: {
  cfg: EnclawedConfig;
  accountId?: string | null;
  context: ChannelThreadingContext;
  hasRepliedRef?: { value: boolean };
}): ChannelThreadingToolContext {
  void params.cfg;
  void params.accountId;

  return {
    currentChannelId: normalizeOptionalString(params.context.To),
    currentThreadTs: resolveTelegramToolContextThreadId(params.context),
    hasRepliedRef: params.hasRepliedRef,
  };
}
