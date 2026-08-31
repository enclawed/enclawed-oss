// Private runtime barrel for the bundled Microsoft Teams extension.
// Keep this barrel thin and aligned with the local extension surface.

export { DEFAULT_ACCOUNT_ID } from "@enclawed/plugin-sdk/account-id";
export type { AllowlistMatch } from "@enclawed/plugin-sdk/allow-from";
export {
  mergeAllowlist,
  resolveAllowlistMatchSimple,
  summarizeMapping,
} from "@enclawed/plugin-sdk/allow-from";
export type {
  BaseProbeResult,
  ChannelDirectoryEntry,
  ChannelGroupContext,
  ChannelMessageActionName,
  ChannelOutboundAdapter,
} from "@enclawed/plugin-sdk/channel-contract";
export type { ChannelPlugin } from "@enclawed/plugin-sdk/channel-core";
export { logTypingFailure } from "@enclawed/plugin-sdk/channel-logging";
export { createChannelPairingController } from "@enclawed/plugin-sdk/channel-pairing";
export {
  evaluateSenderGroupAccessForPolicy,
  readStoreAllowFromForDmPolicy,
  resolveDmGroupAccessWithLists,
  resolveEffectiveAllowFromLists,
  resolveSenderScopedGroupPolicy,
  resolveToolsBySender,
} from "@enclawed/plugin-sdk/channel-policy";
export { createChannelReplyPipeline } from "@enclawed/plugin-sdk/channel-reply-pipeline";
export {
  PAIRING_APPROVED_MESSAGE,
  buildProbeChannelStatusSummary,
  createDefaultChannelRuntimeState,
} from "@enclawed/plugin-sdk/channel-status";
export {
  buildChannelKeyCandidates,
  normalizeChannelSlug,
  resolveChannelEntryMatchWithFallback,
  resolveNestedAllowlistDecision,
} from "@enclawed/plugin-sdk/channel-targets";
export type {
  GroupPolicy,
  GroupToolPolicyConfig,
  MSTeamsChannelConfig,
  MSTeamsConfig,
  MSTeamsReplyStyle,
  MSTeamsTeamConfig,
  MarkdownTableMode,
  EnclawedConfig,
} from "@enclawed/plugin-sdk/config-types";
export { isDangerousNameMatchingEnabled } from "@enclawed/plugin-sdk/dangerous-name-runtime";
export { resolveDefaultGroupPolicy } from "@enclawed/plugin-sdk/runtime-group-policy";
export { withFileLock } from "@enclawed/plugin-sdk/file-lock";
export { keepHttpServerTaskAlive } from "@enclawed/plugin-sdk/channel-lifecycle";
export {
  detectMime,
  extensionForMime,
  extractOriginalFilename,
  getFileExtension,
  resolveChannelMediaMaxBytes,
} from "@enclawed/plugin-sdk/media-runtime";
export { dispatchReplyFromConfigWithSettledDispatcher } from "@enclawed/plugin-sdk/inbound-reply-dispatch";
export { loadOutboundMediaFromUrl } from "@enclawed/plugin-sdk/outbound-media";
export { buildMediaPayload } from "@enclawed/plugin-sdk/reply-payload";
export type { ReplyPayload } from "@enclawed/plugin-sdk/reply-payload";
export type { PluginRuntime } from "@enclawed/plugin-sdk/runtime-store";
export type { RuntimeEnv } from "@enclawed/plugin-sdk/runtime";
export type { SsrFPolicy } from "@enclawed/plugin-sdk/ssrf-runtime";
export { fetchWithSsrFGuard } from "@enclawed/plugin-sdk/ssrf-runtime";
export { normalizeStringEntries } from "@enclawed/plugin-sdk/string-normalization-runtime";
export { chunkTextForOutbound } from "@enclawed/plugin-sdk/text-chunking";
export { DEFAULT_WEBHOOK_MAX_BODY_BYTES } from "@enclawed/plugin-sdk/webhook-ingress";
export { setMSTeamsRuntime } from "./src/runtime.js";
