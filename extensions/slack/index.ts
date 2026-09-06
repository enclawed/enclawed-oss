import {
  defineBundledChannelEntry,
  loadBundledEntryExportSync,
} from "@enclawed/plugin-sdk/channel-entry-contract";
import type { EnclawedPluginApi } from "@enclawed/plugin-sdk/channel-entry-contract";

function registerSlackPluginHttpRoutes(api: EnclawedPluginApi): void {
  const register = loadBundledEntryExportSync<(api: EnclawedPluginApi) => void>(import.meta.url, {
    specifier: "./http-routes-api.js",
    exportName: "registerSlackPluginHttpRoutes",
  });
  register(api);
}

export default defineBundledChannelEntry({
  id: "slack",
  name: "Slack",
  description: "Slack channel plugin",
  importMetaUrl: import.meta.url,
  plugin: {
    specifier: "./channel-plugin-api.js",
    exportName: "slackPlugin",
  },
  secrets: {
    specifier: "./secret-contract-api.js",
    exportName: "channelSecrets",
  },
  runtime: {
    specifier: "./runtime-setter-api.js",
    exportName: "setSlackRuntime",
  },
  accountInspect: {
    specifier: "./account-inspect-api.js",
    exportName: "inspectSlackReadOnlyAccount",
  },
  registerFull: registerSlackPluginHttpRoutes,
});
