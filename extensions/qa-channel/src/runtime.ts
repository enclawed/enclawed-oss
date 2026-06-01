import { createPluginRuntimeStore } from "@enclawed/plugin-sdk/runtime-store";
import type { PluginRuntime } from "./runtime-api.js";

const { setRuntime: setQaChannelRuntime, getRuntime: getQaChannelRuntime } =
  createPluginRuntimeStore<PluginRuntime>({
    pluginId: "qa-channel",
    errorMessage: "QA channel runtime not initialized",
  });

export { getQaChannelRuntime, setQaChannelRuntime };
