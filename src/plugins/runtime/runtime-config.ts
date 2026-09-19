import { loadConfig, writeConfigFile } from "../../config/config.js";
import { getRuntimeConfig } from "../../config/io.js";
import { mutateConfigFile, replaceConfigFile } from "../../config/mutate.js";
import type { PluginRuntime } from "./types.js";

export function createRuntimeConfig(): PluginRuntime["config"] {
  return {
    loadConfig,
    writeConfigFile,
    current: getRuntimeConfig,
    mutateConfigFile,
    replaceConfigFile,
  };
}
