export const CHANNEL_MESSAGE_CAPABILITIES = [
  "interactive",
  "buttons",
  "cards",
  "components",
  "blocks",
  "presentation",
  "delivery-pin",
] as const;

export type ChannelMessageCapability = (typeof CHANNEL_MESSAGE_CAPABILITIES)[number];
