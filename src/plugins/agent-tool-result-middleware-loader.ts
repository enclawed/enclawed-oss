import type { EnclawedConfig } from "../config/types.enclawed.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import type {
  AgentToolResultMiddleware,
  AgentToolResultMiddlewareRuntime,
} from "./agent-tool-result-middleware-types.js";
import {
  listAgentToolResultMiddlewares,
  normalizeAgentToolResultMiddlewareRuntimeIds,
} from "./agent-tool-result-middleware.js";
import { loadEnclawedPlugins } from "./loader.js";
import { loadPluginManifestRegistry, type PluginManifestRegistry } from "./manifest-registry.js";

const log = createSubsystemLogger("plugins/agent-tool-result-middleware");

async function resolveRuntimeConfig(): Promise<EnclawedConfig> {
  const { getRuntimeConfig } = await import("../config/config.js");
  return getRuntimeConfig();
}

function listMiddlewareOwnerPluginIds(params: {
  manifestRegistry: PluginManifestRegistry;
  runtime: AgentToolResultMiddlewareRuntime;
}): string[] {
  const pluginIds: string[] = [];
  for (const record of params.manifestRegistry.plugins) {
    if (record.origin !== "bundled") {
      continue;
    }
    const runtimes = normalizeAgentToolResultMiddlewareRuntimeIds(
      record.contracts?.agentToolResultMiddleware,
    );
    if (runtimes.includes(params.runtime) && !pluginIds.includes(record.id)) {
      pluginIds.push(record.id);
    }
  }
  return pluginIds;
}

export async function loadAgentToolResultMiddlewaresForRuntime(params: {
  runtime: AgentToolResultMiddlewareRuntime;
  config?: EnclawedConfig;
  workspaceDir?: string;
  env?: NodeJS.ProcessEnv;
  manifestRegistry?: PluginManifestRegistry;
}): Promise<AgentToolResultMiddleware[]> {
  const activeHandlers = listAgentToolResultMiddlewares(params.runtime);
  if (activeHandlers.length > 0) {
    return activeHandlers;
  }

  try {
    const config = params.config ?? (await resolveRuntimeConfig());
    const env = params.env ?? process.env;
    const manifestRegistry =
      params.manifestRegistry ??
      loadPluginManifestRegistry({
        config,
        workspaceDir: params.workspaceDir,
        env,
      });
    const pluginIds = listMiddlewareOwnerPluginIds({
      manifestRegistry,
      runtime: params.runtime,
    });
    if (pluginIds.length === 0) {
      return [];
    }

    const registry = loadEnclawedPlugins({
      config,
      workspaceDir: params.workspaceDir,
      env,
      manifestRegistry,
      onlyPluginIds: pluginIds,
      activate: false,
      throwOnLoadError: false,
    });

    return (registry.agentToolResultMiddlewares ?? [])
      .filter((entry) => entry.runtimes.includes(params.runtime))
      .map((entry) => entry.handler);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    log.warn(`[${params.runtime}] failed to load tool result middleware plugins: ${detail}`);
    return listAgentToolResultMiddlewares(params.runtime);
  }
}

export const __testing = {
  listMiddlewareOwnerPluginIds,
};
