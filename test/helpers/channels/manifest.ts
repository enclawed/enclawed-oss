export const channelPluginSurfaceKeys = [
  "actions",
  "setup",
  "status",
  "outbound",
  "messaging",
  "threading",
  "directory",
  "gateway",
] as const;

export type ChannelPluginSurface = (typeof channelPluginSurfaceKeys)[number];

// All previously listed channels (bluebubbles, discord, feishu, imessage,
// matrix, telegram) are stripped from this fork pending enclawed security
// review. The list will repopulate when a channel is restored. Typed as
// readonly string[] (not `as const`) so callers that consume the type
// continue to compile against a string-shaped element.
export type SessionBindingContractChannelId = string;
export const sessionBindingContractChannelIds: ReadonlyArray<SessionBindingContractChannelId> = [];
