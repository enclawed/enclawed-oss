// Private runtime barrel for the bundled Mattermost extension.
// Keep this barrel thin and generic-only.

export type {
  BaseProbeResult,
  ChannelAccountSnapshot,
  ChannelDirectoryEntry,
  ChannelGroupContext,
  ChannelMessageActionName,
  ChannelPlugin,
  ChatType,
  HistoryEntry,
  EnclawedConfig,
  EnclawedPluginApi,
  PluginRuntime,
} from "@enclawed/plugin-sdk/core";
export type { RuntimeEnv } from "@enclawed/plugin-sdk/runtime";
export type { ReplyPayload } from "@enclawed/plugin-sdk/reply-runtime";
export type { ModelsProviderData } from "@enclawed/plugin-sdk/command-auth";
export type {
  BlockStreamingCoalesceConfig,
  DmPolicy,
  GroupPolicy,
} from "@enclawed/plugin-sdk/config-types";
export {
  DEFAULT_ACCOUNT_ID,
  buildChannelConfigSchema,
  createDedupeCache,
  parseStrictPositiveInteger,
  resolveClientIp,
  isTrustedProxyAddress,
} from "@enclawed/plugin-sdk/core";
export { buildComputedAccountStatusSnapshot } from "@enclawed/plugin-sdk/channel-status";
export { createAccountStatusSink } from "@enclawed/plugin-sdk/channel-lifecycle";
export { buildAgentMediaPayload } from "@enclawed/plugin-sdk/agent-media-payload";
export {
  buildModelsProviderData,
  listSkillCommandsForAgents,
  resolveControlCommandGate,
  resolveStoredModelOverride,
} from "@enclawed/plugin-sdk/command-auth";
export {
  GROUP_POLICY_BLOCKED_LABEL,
  resolveAllowlistProviderRuntimeGroupPolicy,
  resolveDefaultGroupPolicy,
  warnMissingProviderGroupPolicyFallbackOnce,
} from "@enclawed/plugin-sdk/runtime-group-policy";
export { isDangerousNameMatchingEnabled } from "@enclawed/plugin-sdk/dangerous-name-runtime";
export { loadSessionStore, resolveStorePath } from "@enclawed/plugin-sdk/session-store-runtime";
export { formatInboundFromLabel } from "@enclawed/plugin-sdk/channel-inbound";
export { logInboundDrop } from "@enclawed/plugin-sdk/channel-inbound";
export { createChannelPairingController } from "@enclawed/plugin-sdk/channel-pairing";
export {
  DM_GROUP_ACCESS_REASON,
  readStoreAllowFromForDmPolicy,
  resolveDmGroupAccessWithLists,
  resolveEffectiveAllowFromLists,
} from "@enclawed/plugin-sdk/channel-policy";
export { evaluateSenderGroupAccessForPolicy } from "@enclawed/plugin-sdk/group-access";
export { createChannelReplyPipeline } from "@enclawed/plugin-sdk/channel-reply-pipeline";
export { logTypingFailure } from "@enclawed/plugin-sdk/channel-feedback";
export { loadOutboundMediaFromUrl } from "@enclawed/plugin-sdk/outbound-media";
export { rawDataToString } from "@enclawed/plugin-sdk/webhook-ingress";
export { chunkTextForOutbound } from "@enclawed/plugin-sdk/text-chunking";
export {
  DEFAULT_GROUP_HISTORY_LIMIT,
  buildPendingHistoryContextFromMap,
  clearHistoryEntriesIfEnabled,
  recordPendingHistoryEntryIfEnabled,
} from "@enclawed/plugin-sdk/reply-history";
export { normalizeAccountId, resolveThreadSessionKeys } from "@enclawed/plugin-sdk/routing";
export { resolveAllowlistMatchSimple } from "@enclawed/plugin-sdk/allow-from";
export { registerPluginHttpRoute } from "@enclawed/plugin-sdk/webhook-targets";
export {
  isRequestBodyLimitError,
  readRequestBodyWithLimit,
} from "@enclawed/plugin-sdk/webhook-ingress";
export {
  applyAccountNameToChannelSection,
  applySetupAccountConfigPatch,
  migrateBaseNameToDefaultAccount,
} from "@enclawed/plugin-sdk/setup";
export {
  getAgentScopedMediaLocalRoots,
  resolveChannelMediaMaxBytes,
} from "@enclawed/plugin-sdk/media-runtime";
export { normalizeProviderId } from "@enclawed/plugin-sdk/provider-model-shared";
export { setMattermostRuntime } from "./src/runtime.js";
