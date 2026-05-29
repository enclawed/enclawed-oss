import { resolveChannelPreviewStreamMode } from "@enclawed/plugin-sdk/channel-streaming";

type TelegramPreviewStreamMode = "off" | "partial" | "block";

export function resolveTelegramPreviewStreamMode(
  params: {
    streamMode?: unknown;
    streaming?: unknown;
  } = {},
): TelegramPreviewStreamMode {
  return resolveChannelPreviewStreamMode(params, "partial");
}
