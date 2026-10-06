// Private runtime barrel for the bundled Voice Call extension.
// Keep this barrel thin and aligned with the local extension surface.

export { definePluginEntry } from "@enclawed/plugin-sdk/plugin-entry";
export type { EnclawedPluginApi } from "@enclawed/plugin-sdk/plugin-entry";
export type { GatewayRequestHandlerOptions } from "@enclawed/plugin-sdk/gateway-runtime";
export {
  isRequestBodyLimitError,
  readRequestBodyWithLimit,
  requestBodyErrorToText,
} from "@enclawed/plugin-sdk/webhook-request-guards";
export { fetchWithSsrFGuard, isBlockedHostnameOrIp } from "@enclawed/plugin-sdk/ssrf-runtime";
export type { SessionEntry } from "@enclawed/plugin-sdk/session-store-runtime";
export {
  TtsAutoSchema,
  TtsConfigSchema,
  TtsModeSchema,
  TtsProviderSchema,
} from "@enclawed/plugin-sdk/tts-runtime";
export { sleep } from "@enclawed/plugin-sdk/runtime-env";
