// Private runtime barrel for the bundled Twitch extension.
// Keep this barrel thin and aligned with the local extension surface.

export type {
  ChannelAccountSnapshot,
  ChannelCapabilities,
  ChannelGatewayContext,
  ChannelLogSink,
  ChannelMessageActionAdapter,
  ChannelMessageActionContext,
  ChannelMeta,
  ChannelOutboundAdapter,
  ChannelOutboundContext,
  ChannelResolveKind,
  ChannelResolveResult,
  ChannelStatusAdapter,
} from "@enclawed/plugin-sdk/channel-contract";
export type { ChannelPlugin } from "@enclawed/plugin-sdk/channel-core";
export type { OutboundDeliveryResult } from "@enclawed/plugin-sdk/channel-send-result";
export type { EnclawedConfig } from "@enclawed/plugin-sdk/config-types";
export type { RuntimeEnv } from "@enclawed/plugin-sdk/runtime";
export type { WizardPrompter } from "@enclawed/plugin-sdk/setup";
