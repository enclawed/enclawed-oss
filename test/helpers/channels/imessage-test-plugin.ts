import type { ChannelOutboundAdapter } from "@enclawed/plugin-sdk/channel-contract";
import type { ChannelPlugin } from "@enclawed/plugin-sdk/core";
import { loadBundledPluginTestApiSync } from "../../../src/test-utils/bundled-plugin-public-surface.js";

type CreateIMessageTestPlugin = (params?: { outbound?: ChannelOutboundAdapter }) => ChannelPlugin;

let createIMessageTestPluginCache: CreateIMessageTestPlugin | undefined;

function getCreateIMessageTestPlugin(): CreateIMessageTestPlugin {
  if (!createIMessageTestPluginCache) {
    ({ createIMessageTestPlugin: createIMessageTestPluginCache } = loadBundledPluginTestApiSync<{
      createIMessageTestPlugin: CreateIMessageTestPlugin;
    }>("imessage"));
  }
  return createIMessageTestPluginCache;
}

export const createIMessageTestPlugin: CreateIMessageTestPlugin = (...args) =>
  getCreateIMessageTestPlugin()(...args);
