import type { EnclawedConfig } from "../config/types.enclawed.js";
import { loggingState } from "../logging/state.js";
import type { PluginRegistryScope } from "./plugin-registry.js";

let pluginRegistryModulePromise: Promise<typeof import("./plugin-registry.js")> | undefined;

function loadPluginRegistryModule() {
  pluginRegistryModulePromise ??= import("./plugin-registry.js");
  return pluginRegistryModulePromise;
}

export function resolvePluginRegistryScopeForCommandPath(
  commandPath: string[],
): Exclude<PluginRegistryScope, "configured-channels"> {
  return commandPath[0] === "status" || commandPath[0] === "health" ? "channels" : "all";
}

export async function ensureCliPluginRegistryLoaded(params: {
  scope: PluginRegistryScope;
  routeLogsToStderr?: boolean;
  config?: EnclawedConfig;
  activationSourceConfig?: EnclawedConfig;
}) {
  const { ensurePluginRegistryLoaded } = await loadPluginRegistryModule();
  const previousForceStderr = loggingState.forceConsoleToStderr;
  if (params.routeLogsToStderr) {
    loggingState.forceConsoleToStderr = true;
  }
  try {
    ensurePluginRegistryLoaded({
      scope: params.scope,
      ...(params.config ? { config: params.config } : {}),
      ...(params.activationSourceConfig
        ? { activationSourceConfig: params.activationSourceConfig }
        : {}),
    });
  } finally {
    loggingState.forceConsoleToStderr = previousForceStderr;
  }
}
