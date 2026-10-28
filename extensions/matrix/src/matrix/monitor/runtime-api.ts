// Narrow Matrix monitor helper seam.
// Keep monitor internals off the broad package runtime-api barrel so monitor
// tests and shared workers do not pull unrelated Matrix helper surfaces.

export type { NormalizedLocation } from "@enclawed/plugin-sdk/channel-location";
export type { PluginRuntime, RuntimeLogger } from "@enclawed/plugin-sdk/plugin-runtime";
export type { BlockReplyContext, ReplyPayload } from "@enclawed/plugin-sdk/reply-runtime";
export type { MarkdownTableMode, EnclawedConfig } from "@enclawed/plugin-sdk/config-types";
export type { RuntimeEnv } from "@enclawed/plugin-sdk/runtime";
export {
  addAllowlistUserEntriesFromConfigEntry,
  buildAllowlistResolutionSummary,
  canonicalizeAllowlistWithResolvedIds,
  formatAllowlistMatchMeta,
  patchAllowlistUsersInConfigEntries,
  summarizeMapping,
} from "@enclawed/plugin-sdk/allow-from";
export {
  createReplyPrefixOptions,
  createTypingCallbacks,
} from "@enclawed/plugin-sdk/channel-reply-options-runtime";
export { formatLocationText, toLocationContext } from "@enclawed/plugin-sdk/channel-location";
export { getAgentScopedMediaLocalRoots } from "@enclawed/plugin-sdk/agent-media-payload";
export { logInboundDrop, logTypingFailure } from "@enclawed/plugin-sdk/channel-logging";
export {
  buildChannelKeyCandidates,
  resolveChannelEntryMatch,
} from "@enclawed/plugin-sdk/channel-targets";
