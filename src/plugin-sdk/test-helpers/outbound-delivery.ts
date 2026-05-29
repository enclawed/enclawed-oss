// Re-exports from the underlying oss locations. The upstream version aliases
// through ../testing.js, but oss testing.ts has been pared down and no longer
// covers these helpers — so we point each re-export at its real source.

export { deliverOutboundPayloads } from "../../infra/outbound/deliver.js";
export { addTestHook } from "../../plugins/hooks.test-helpers.js";
export {
  createOutboundTestPlugin,
  createTestRegistry,
} from "../../test-utils/channel-plugins.js";
export { createEmptyPluginRegistry } from "../../plugins/registry-empty.js";
export {
  releasePinnedPluginChannelRegistry,
  setActivePluginRegistry,
} from "../../plugins/runtime.js";
export {
  initializeGlobalHookRunner,
  resetGlobalHookRunner,
} from "../../plugins/hook-runner-global.js";
export type { PluginHookRegistration } from "../../plugins/hook-types.js";
