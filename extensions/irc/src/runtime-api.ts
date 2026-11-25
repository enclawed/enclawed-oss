// Private runtime barrel for the bundled IRC extension.
// Keep this barrel thin and generic-only.

export type { BaseProbeResult } from "@enclawed/plugin-sdk/channel-contract";
export type { ChannelPlugin } from "@enclawed/plugin-sdk/channel-core";
export type { EnclawedConfig } from "@enclawed/plugin-sdk/config-types";
export type { PluginRuntime } from "@enclawed/plugin-sdk/runtime-store";
export type { RuntimeEnv } from "@enclawed/plugin-sdk/runtime";
export type {
  BlockStreamingCoalesceConfig,
  DmConfig,
  DmPolicy,
  GroupPolicy,
  GroupToolPolicyBySenderConfig,
  GroupToolPolicyConfig,
  MarkdownConfig,
} from "@enclawed/plugin-sdk/config-types";
export type { OutboundReplyPayload } from "@enclawed/plugin-sdk/reply-payload";
export { DEFAULT_ACCOUNT_ID } from "@enclawed/plugin-sdk/account-id";
export { buildChannelConfigSchema } from "@enclawed/plugin-sdk/channel-config-primitives";
export {
  PAIRING_APPROVED_MESSAGE,
  buildBaseChannelStatusSummary,
} from "@enclawed/plugin-sdk/channel-status";
export { createChannelPairingController } from "@enclawed/plugin-sdk/channel-pairing";
export { createAccountStatusSink } from "@enclawed/plugin-sdk/channel-lifecycle";
export {
  readStoreAllowFromForDmPolicy,
  resolveEffectiveAllowFromLists,
} from "@enclawed/plugin-sdk/channel-policy";
export { resolveControlCommandGate } from "@enclawed/plugin-sdk/command-auth";
export { dispatchInboundReplyWithBase } from "@enclawed/plugin-sdk/inbound-reply-dispatch";
export { chunkTextForOutbound } from "@enclawed/plugin-sdk/text-chunking";
export {
  deliverFormattedTextWithAttachments,
  formatTextWithAttachmentLinks,
  resolveOutboundMediaUrls,
} from "@enclawed/plugin-sdk/reply-payload";
export {
  GROUP_POLICY_BLOCKED_LABEL,
  resolveAllowlistProviderRuntimeGroupPolicy,
  resolveDefaultGroupPolicy,
  warnMissingProviderGroupPolicyFallbackOnce,
} from "@enclawed/plugin-sdk/runtime-group-policy";
export { isDangerousNameMatchingEnabled } from "@enclawed/plugin-sdk/dangerous-name-runtime";
export { logInboundDrop } from "@enclawed/plugin-sdk/channel-inbound";
