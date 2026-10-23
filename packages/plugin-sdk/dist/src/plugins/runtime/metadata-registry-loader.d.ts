import type { EnclawedConfig } from "../../config/types.enclawed.js";
import type { PluginRegistry } from "../registry.js";
export declare function loadPluginMetadataRegistrySnapshot(options?: {
    config?: EnclawedConfig;
    activationSourceConfig?: EnclawedConfig;
    env?: NodeJS.ProcessEnv;
    workspaceDir?: string;
    onlyPluginIds?: string[];
    loadModules?: boolean;
}): PluginRegistry;
