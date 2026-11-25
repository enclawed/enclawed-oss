import type { ChannelMessageActionAdapter } from "@enclawed/plugin-sdk/channel-contract";
import type { PluginRuntime } from "@enclawed/plugin-sdk/channel-core";
import { createPluginRuntimeStore } from "@enclawed/plugin-sdk/runtime-store";

type DiscordChannelRuntime = {
  // Typed by the SDK contract (not `typeof discordMessageActions`) so this
  // runtime store stays a leaf: channel-actions.ts reaches back into it.
  messageActions?: ChannelMessageActionAdapter;
  sendMessageDiscord?: typeof import("./send.js").sendMessageDiscord;
};

export type DiscordRuntime = PluginRuntime & {
  channel: PluginRuntime["channel"] & {
    discord?: DiscordChannelRuntime;
  };
};

const {
  setRuntime: setDiscordRuntime,
  tryGetRuntime: getOptionalDiscordRuntime,
  getRuntime: getDiscordRuntime,
} = createPluginRuntimeStore<DiscordRuntime>({
  pluginId: "discord",
  errorMessage: "Discord runtime not initialized",
});
export { getDiscordRuntime, getOptionalDiscordRuntime, setDiscordRuntime };
