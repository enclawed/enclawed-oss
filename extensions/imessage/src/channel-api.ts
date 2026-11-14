import { formatTrimmedAllowFromEntries } from "@enclawed/plugin-sdk/channel-config-helpers";
import { PAIRING_APPROVED_MESSAGE } from "@enclawed/plugin-sdk/channel-status";
import {
  DEFAULT_ACCOUNT_ID,
  getChatChannelMeta,
  type ChannelPlugin,
} from "@enclawed/plugin-sdk/core";
import { resolveChannelMediaMaxBytes } from "@enclawed/plugin-sdk/media-runtime";
import { collectStatusIssuesFromLastError } from "@enclawed/plugin-sdk/status-helpers";
import { normalizeIMessageMessagingTarget } from "./normalize.js";
export { chunkTextForOutbound } from "@enclawed/plugin-sdk/text-chunking";

export {
  collectStatusIssuesFromLastError,
  DEFAULT_ACCOUNT_ID,
  formatTrimmedAllowFromEntries,
  getChatChannelMeta,
  normalizeIMessageMessagingTarget,
  PAIRING_APPROVED_MESSAGE,
  resolveChannelMediaMaxBytes,
};

export type { ChannelPlugin };
