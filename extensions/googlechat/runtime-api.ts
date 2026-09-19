// Private runtime barrel for the bundled Google Chat extension.
// Keep this barrel thin and avoid broad plugin-sdk surfaces during bootstrap.

export { DEFAULT_ACCOUNT_ID } from "@enclawed/plugin-sdk/account-id";
export {
  createActionGate,
  jsonResult,
  readNumberParam,
  readReactionParams,
  readStringParam,
} from "@enclawed/plugin-sdk/channel-actions";
export { buildChannelConfigSchema } from "@enclawed/plugin-sdk/channel-config-primitives";
export type {
  ChannelMessageActionAdapter,
  ChannelMessageActionName,
  ChannelStatusIssue,
} from "@enclawed/plugin-sdk/channel-contract";
export { missingTargetError } from "@enclawed/plugin-sdk/channel-feedback";
export {
  createAccountStatusSink,
  runPassiveAccountLifecycle,
} from "@enclawed/plugin-sdk/channel-lifecycle";
export { createChannelPairingController } from "@enclawed/plugin-sdk/channel-pairing";
export { createChannelReplyPipeline } from "@enclawed/plugin-sdk/channel-reply-pipeline";
export {
  evaluateGroupRouteAccessForPolicy,
  resolveDmGroupAccessWithLists,
  resolveSenderScopedGroupPolicy,
} from "@enclawed/plugin-sdk/channel-policy";
export { PAIRING_APPROVED_MESSAGE } from "@enclawed/plugin-sdk/channel-status";
export { chunkTextForOutbound } from "@enclawed/plugin-sdk/text-chunking";
export type { EnclawedConfig } from "@enclawed/plugin-sdk/config-types";
export { GoogleChatConfigSchema } from "@enclawed/plugin-sdk/bundled-channel-config-schema";
export {
  GROUP_POLICY_BLOCKED_LABEL,
  resolveAllowlistProviderRuntimeGroupPolicy,
  resolveDefaultGroupPolicy,
  warnMissingProviderGroupPolicyFallbackOnce,
} from "@enclawed/plugin-sdk/runtime-group-policy";
export { isDangerousNameMatchingEnabled } from "@enclawed/plugin-sdk/dangerous-name-runtime";
export { fetchRemoteMedia, resolveChannelMediaMaxBytes } from "@enclawed/plugin-sdk/media-runtime";
export { loadOutboundMediaFromUrl } from "@enclawed/plugin-sdk/outbound-media";
export type { PluginRuntime } from "@enclawed/plugin-sdk/runtime-store";
export { fetchWithSsrFGuard } from "@enclawed/plugin-sdk/ssrf-runtime";
export type { GoogleChatAccountConfig, GoogleChatConfig } from "@enclawed/plugin-sdk/config-types";
export { extractToolSend } from "@enclawed/plugin-sdk/tool-send";
export { resolveInboundMentionDecision } from "@enclawed/plugin-sdk/channel-inbound";
export { resolveInboundRouteEnvelopeBuilderWithRuntime } from "@enclawed/plugin-sdk/inbound-envelope";
export { resolveWebhookPath } from "@enclawed/plugin-sdk/webhook-path";
export {
  registerWebhookTargetWithPluginRoute,
  resolveWebhookTargetWithAuthOrReject,
  withResolvedWebhookRequestPipeline,
} from "@enclawed/plugin-sdk/webhook-targets";
export {
  createWebhookInFlightLimiter,
  readJsonWebhookBodyOrReject,
  type WebhookInFlightLimiter,
} from "@enclawed/plugin-sdk/webhook-request-guards";
export { setGoogleChatRuntime } from "./src/runtime.js";
