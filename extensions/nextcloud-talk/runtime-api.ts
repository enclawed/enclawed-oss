// Private runtime barrel for the bundled Nextcloud Talk extension.
// Keep this barrel thin and aligned with the local extension surface.

export type { AllowlistMatch } from "@enclawed/plugin-sdk/allow-from";
export type { ChannelGroupContext } from "@enclawed/plugin-sdk/channel-contract";
export { logInboundDrop } from "@enclawed/plugin-sdk/channel-logging";
export { createChannelPairingController } from "@enclawed/plugin-sdk/channel-pairing";
export {
  readStoreAllowFromForDmPolicy,
  resolveDmGroupAccessWithCommandGate,
} from "@enclawed/plugin-sdk/channel-policy";
export type {
  BlockStreamingCoalesceConfig,
  DmConfig,
  DmPolicy,
  GroupPolicy,
  GroupToolPolicyConfig,
  EnclawedConfig,
} from "@enclawed/plugin-sdk/config-types";
export {
  GROUP_POLICY_BLOCKED_LABEL,
  resolveAllowlistProviderRuntimeGroupPolicy,
  resolveDefaultGroupPolicy,
  warnMissingProviderGroupPolicyFallbackOnce,
} from "@enclawed/plugin-sdk/runtime-group-policy";
export { dispatchInboundReplyWithBase } from "@enclawed/plugin-sdk/inbound-reply-dispatch";
export type { OutboundReplyPayload } from "@enclawed/plugin-sdk/reply-payload";
export { deliverFormattedTextWithAttachments } from "@enclawed/plugin-sdk/reply-payload";
export type { PluginRuntime } from "@enclawed/plugin-sdk/runtime-store";
export type { RuntimeEnv } from "@enclawed/plugin-sdk/runtime";
export type { SecretInput } from "@enclawed/plugin-sdk/secret-input";
export { fetchWithSsrFGuard } from "@enclawed/plugin-sdk/ssrf-runtime";
export { setNextcloudTalkRuntime } from "./src/runtime.js";
