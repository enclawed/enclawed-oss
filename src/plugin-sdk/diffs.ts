// Narrow plugin-sdk surface for the bundled diffs plugin.
// Keep this list additive and scoped to the bundled diffs surface.

export { definePluginEntry } from "./plugin-entry.js";
export type { EnclawedConfig } from "../config/config.js";
export { resolvePreferredEnclawedTmpDir } from "../infra/tmp-enclawed-dir.js";
export type {
  AnyAgentTool,
  EnclawedPluginApi,
  EnclawedPluginConfigSchema,
  EnclawedPluginToolContext,
  PluginLogger,
} from "../plugins/types.js";
