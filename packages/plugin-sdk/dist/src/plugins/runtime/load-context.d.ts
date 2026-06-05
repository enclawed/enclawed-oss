import type { EnclawedConfig } from "../../config/types.enclawed.js";
import type { PluginLoadOptions } from "../loader.js";
import type { PluginLogger } from "../types.js";
export type PluginRuntimeLoadContext = {
    rawConfig: EnclawedConfig;
    config: EnclawedConfig;
    activationSourceConfig: EnclawedConfig;
    autoEnabledReasons: Readonly<Record<string, string[]>>;
    workspaceDir: string | undefined;
    env: NodeJS.ProcessEnv;
    logger: PluginLogger;
};
export type PluginRuntimeResolvedLoadValues = Pick<PluginLoadOptions, "config" | "activationSourceConfig" | "autoEnabledReasons" | "workspaceDir" | "env" | "logger">;
export type PluginRuntimeLoadContextOptions = {
    config?: EnclawedConfig;
    activationSourceConfig?: EnclawedConfig;
    env?: NodeJS.ProcessEnv;
    workspaceDir?: string;
    logger?: PluginLogger;
};
export declare function createPluginRuntimeLoaderLogger(): PluginLogger;
export declare function resolvePluginRuntimeLoadContext(options?: PluginRuntimeLoadContextOptions): PluginRuntimeLoadContext;
export declare function buildPluginRuntimeLoadOptions(context: PluginRuntimeLoadContext, overrides?: Partial<PluginLoadOptions>): PluginLoadOptions;
export declare function buildPluginRuntimeLoadOptionsFromValues(values: PluginRuntimeResolvedLoadValues, overrides?: Partial<PluginLoadOptions>): PluginLoadOptions;
