import {
  defineBundledChannelEntry,
  loadBundledEntryExportSync,
  type EnclawedPluginApi,
} from "@enclawed/plugin-sdk/channel-entry-contract";

function registerQQBotFull(api: EnclawedPluginApi): void {
  const register = loadBundledEntryExportSync<(api: EnclawedPluginApi) => void>(import.meta.url, {
    specifier: "./api.js",
    exportName: "registerQQBotFull",
  });
  register(api);
}

export default defineBundledChannelEntry({
  id: "qqbot",
  name: "QQ Bot",
  description: "QQ Bot channel plugin",
  importMetaUrl: import.meta.url,
  plugin: {
    specifier: "./channel-plugin-api.js",
    exportName: "qqbotPlugin",
  },
  runtime: {
    specifier: "./runtime-api.js",
    exportName: "setQQBotRuntime",
  },
  registerFull: registerQQBotFull,
});
