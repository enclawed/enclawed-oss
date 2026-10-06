import { resolveChannelGroupRequireMention } from "@enclawed/plugin-sdk/channel-policy";
import type { EnclawedConfig } from "@enclawed/plugin-sdk/core";

type GoogleChatGroupContext = {
  cfg: EnclawedConfig;
  accountId?: string | null;
  groupId?: string | null;
};

export function resolveGoogleChatGroupRequireMention(params: GoogleChatGroupContext): boolean {
  return resolveChannelGroupRequireMention({
    cfg: params.cfg,
    channel: "googlechat",
    groupId: params.groupId,
    accountId: params.accountId,
  });
}
