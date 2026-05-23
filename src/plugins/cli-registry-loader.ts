import { collectUniqueCommandDescriptors } from "../cli/program/command-descriptor-utils.js";
import type { EnclawedConfig } from "../config/types.enclawed.js";
import { resolveManifestActivationPluginIds } from "./activation-planner.js";
import type { PluginLoadOptions } from "./loader.js";
import { loadEnclawedPluginCliRegistry, loadEnclawedPlugins } from "./loader.js";
import type { PluginRegistry } from "./registry.js";
import {
  buildPluginRuntimeLoadOptions,
  createPluginRuntimeLoaderLogger,
  resolvePluginRuntimeLoadContext,
  type PluginRuntimeLoadContext,
} from "./runtime/load-context.js";
import type {
  EnclawedPluginCliCommandDescriptor,
  EnclawedPluginCliContext,
  PluginLogger,
} from "./types.js";

export type PluginCliLoaderOptions = Pick<PluginLoadOptions, "pluginSdkResolution">;

export type PluginCliPublicLoadParams = {
  cfg?: EnclawedConfig;
  env?: NodeJS.ProcessEnv;
  loaderOptions?: PluginCliLoaderOptions;
  logger?: PluginLogger;
  primaryCommand?: string;
};

export type PluginCliLoadContext = PluginRuntimeLoadContext;

export type PluginCliRegistryLoadResult = PluginCliLoadContext & {
  registry: PluginRegistry;
};

export type PluginCliCommandGroupEntry = {
  pluginId: string;
  placeholders: readonly EnclawedPluginCliCommandDescriptor[];
  names: readonly string[];
  register: (program: EnclawedPluginCliContext["program"]) => Promise<void>;
};

export function createPluginCliLogger(): PluginLogger {
  return createPluginRuntimeLoaderLogger();
}

function resolvePluginCliLogger(logger?: PluginLogger): PluginLogger {
  return logger ?? createPluginCliLogger();
}

function buildPluginCliLoaderParams(
  context: PluginCliLoadContext,
  params?: { primaryCommand?: string },
  loaderOptions?: PluginCliLoaderOptions,
) {
  const onlyPluginIds = resolvePrimaryCommandPluginIds(context, params?.primaryCommand);
  return buildPluginRuntimeLoadOptions(context, {
    ...loaderOptions,
    ...(onlyPluginIds.length > 0 ? { onlyPluginIds } : {}),
  });
}

function resolvePrimaryCommandPluginIds(
  context: PluginCliLoadContext,
  primaryCommand: string | undefined,
): string[] {
  const normalizedPrimary = primaryCommand?.trim();
  if (!normalizedPrimary) {
    return [];
  }
  return resolveManifestActivationPluginIds({
    trigger: {
      kind: "command",
      command: normalizedPrimary,
    },
    config: context.activationSourceConfig,
    workspaceDir: context.workspaceDir,
    env: context.env,
  });
}

export function resolvePluginCliLoadContext(params: {
  cfg?: EnclawedConfig;
  env?: NodeJS.ProcessEnv;
  logger: PluginLogger;
}): PluginCliLoadContext {
  return resolvePluginRuntimeLoadContext({
    config: params.cfg,
    env: params.env,
    logger: params.logger,
  });
}

export async function loadPluginCliMetadataRegistryWithContext(
  context: PluginCliLoadContext,
  params?: { primaryCommand?: string },
  loaderOptions?: PluginCliLoaderOptions,
): Promise<PluginCliRegistryLoadResult> {
  return {
    ...context,
    registry: await loadEnclawedPluginCliRegistry(
      buildPluginCliLoaderParams(context, params, loaderOptions),
    ),
  };
}

export async function loadPluginCliCommandRegistryWithContext(params: {
  context: PluginCliLoadContext;
  primaryCommand?: string;
  loaderOptions?: PluginCliLoaderOptions;
}): Promise<PluginCliRegistryLoadResult> {
  return {
    ...params.context,
    registry: loadEnclawedPlugins(
      buildPluginCliLoaderParams(
        params.context,
        { primaryCommand: params.primaryCommand },
        params.loaderOptions,
      ),
    ),
  };
}

function buildPluginCliCommandGroupEntries(params: {
  registry: PluginRegistry;
  config: EnclawedConfig;
  workspaceDir: string | undefined;
  logger: PluginLogger;
}): PluginCliCommandGroupEntry[] {
  return params.registry.cliRegistrars.map((entry) => ({
    pluginId: entry.pluginId,
    placeholders: entry.descriptors,
    names: entry.commands,
    register: async (program) => {
      await entry.register({
        program,
        config: params.config,
        workspaceDir: params.workspaceDir,
        logger: params.logger,
      });
    },
  }));
}

export async function loadPluginCliDescriptors(
  params: PluginCliPublicLoadParams,
): Promise<EnclawedPluginCliCommandDescriptor[]> {
  try {
    const logger = resolvePluginCliLogger(params.logger);
    const context = resolvePluginCliLoadContext({
      cfg: params.cfg,
      env: params.env,
      logger,
    });
    const { registry } = await loadPluginCliMetadataRegistryWithContext(
      context,
      { primaryCommand: params.primaryCommand },
      params.loaderOptions,
    );
    return collectUniqueCommandDescriptors(
      registry.cliRegistrars.map((entry) => entry.descriptors),
    );
  } catch {
    return [];
  }
}

export async function loadPluginCliRegistrationEntries(params: {
  cfg?: EnclawedConfig;
  env?: NodeJS.ProcessEnv;
  loaderOptions?: PluginCliLoaderOptions;
  logger?: PluginLogger;
  primaryCommand?: string;
}): Promise<PluginCliCommandGroupEntry[]> {
  const resolvedLogger = resolvePluginCliLogger(params.logger);
  const context = resolvePluginCliLoadContext({
    cfg: params.cfg,
    env: params.env,
    logger: resolvedLogger,
  });
  const { config, workspaceDir, logger, registry } = await loadPluginCliCommandRegistryWithContext({
    context,
    primaryCommand: params.primaryCommand,
    loaderOptions: params.loaderOptions,
  });
  return buildPluginCliCommandGroupEntries({
    registry,
    config,
    workspaceDir,
    logger,
  });
}

export async function loadPluginCliRegistrationEntriesWithDefaults(
  params: PluginCliPublicLoadParams,
): Promise<PluginCliCommandGroupEntry[]> {
  const logger = resolvePluginCliLogger(params.logger);
  return loadPluginCliRegistrationEntries({
    ...params,
    logger,
  });
}
