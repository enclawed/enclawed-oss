import { createPluginRuntimeStore } from "@enclawed/plugin-sdk/runtime-store";
import type { EnclawedConfig, PluginRuntime } from "./runtime-api.js";

const { setRuntime: setMatrixRuntime, getRuntime: getMatrixRuntime } =
  createPluginRuntimeStore<PluginRuntime>({
    pluginId: "matrix",
    errorMessage: "Matrix runtime not initialized",
  });

/**
 * Read the current runtime config, falling back to `loadConfig()` when the
 * host runtime did not populate the optional `current` accessor.
 *
 * Centralized here so Matrix command/CLI surfaces do not need to repeatedly
 * narrow `runtime.config.current`.
 */
function readMatrixRuntimeConfig(runtime?: PluginRuntime): EnclawedConfig {
  const r = runtime ?? getMatrixRuntime();
  const current = r.config.current;
  return current ? (current() as EnclawedConfig) : (r.config.loadConfig() as EnclawedConfig);
}

/**
 * Replace the runtime config file, falling back to `writeConfigFile` when the
 * host runtime did not populate the optional `replaceConfigFile` entry point.
 *
 * Centralized here so Matrix CLI/setup surfaces do not need to repeatedly
 * narrow `runtime.config.replaceConfigFile`.
 */
async function matrixReplaceConfigFile(
  params: Parameters<NonNullable<PluginRuntime["config"]["replaceConfigFile"]>>[0],
  runtime?: PluginRuntime,
): Promise<void> {
  const r = runtime ?? getMatrixRuntime();
  const replace = r.config.replaceConfigFile;
  if (replace) {
    await replace(params);
    return;
  }
  await r.config.writeConfigFile(params.nextConfig);
}

export {
  getMatrixRuntime,
  matrixReplaceConfigFile,
  readMatrixRuntimeConfig,
  setMatrixRuntime,
};
