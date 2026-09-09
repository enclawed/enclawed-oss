import type { PluginRuntime } from "@enclawed/plugin-sdk/core";
import { createPluginRuntimeStore } from "@enclawed/plugin-sdk/runtime-store";

const { setRuntime: setIMessageRuntime } = createPluginRuntimeStore<PluginRuntime>({
  pluginId: "imessage",
  errorMessage: "iMessage runtime not initialized",
});
export { setIMessageRuntime };
