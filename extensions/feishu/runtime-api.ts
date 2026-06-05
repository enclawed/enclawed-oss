// Private runtime barrel for the bundled Feishu extension.
// Keep this barrel thin and generic-only.

export type {
  AllowlistMatch,
  AnyAgentTool,
  BaseProbeResult,
  ChannelGroupContext,
  ChannelMessageActionName,
  ChannelMeta,
  ChannelOutboundAdapter,
  ChannelPlugin,
  HistoryEntry,
  EnclawedConfig,
  EnclawedPluginApi,
  OutboundIdentity,
  PluginRuntime,
  ReplyPayload,
} from "@enclawed/plugin-sdk/core";
export type { EnclawedConfig as ClawdbotConfig } from "@enclawed/plugin-sdk/core";
export type { RuntimeEnv } from "@enclawed/plugin-sdk/runtime";
export type { GroupToolPolicyConfig } from "@enclawed/plugin-sdk/config-types";
export {
  DEFAULT_ACCOUNT_ID,
  buildChannelConfigSchema,
  createActionGate,
  createDedupeCache,
} from "@enclawed/plugin-sdk/core";
export {
  PAIRING_APPROVED_MESSAGE,
  buildProbeChannelStatusSummary,
  createDefaultChannelRuntimeState,
} from "@enclawed/plugin-sdk/channel-status";
export { buildAgentMediaPayload } from "@enclawed/plugin-sdk/agent-media-payload";
export { createChannelPairingController } from "@enclawed/plugin-sdk/channel-pairing";
export { createReplyPrefixContext } from "@enclawed/plugin-sdk/channel-reply-pipeline";
export {
  evaluateSupplementalContextVisibility,
  filterSupplementalContextItems,
  resolveChannelContextVisibilityMode,
} from "@enclawed/plugin-sdk/context-visibility-runtime";
export {
  loadSessionStore,
  resolveSessionStoreEntry,
} from "@enclawed/plugin-sdk/session-store-runtime";
export { readJsonFileWithFallback } from "@enclawed/plugin-sdk/json-store";
export { createPersistentDedupe } from "@enclawed/plugin-sdk/persistent-dedupe";
export { normalizeAgentId } from "@enclawed/plugin-sdk/routing";
export { chunkTextForOutbound } from "@enclawed/plugin-sdk/text-chunking";
export {
  isRequestBodyLimitError,
  readRequestBodyWithLimit,
  requestBodyErrorToText,
} from "@enclawed/plugin-sdk/webhook-ingress";
export { setFeishuRuntime } from "./src/runtime.js";
