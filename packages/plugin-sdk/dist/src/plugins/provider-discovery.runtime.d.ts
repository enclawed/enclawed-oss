import type { EnclawedConfig } from "../config/types.enclawed.js";
import type { ProviderPlugin } from "./types.js";
export declare function resolvePluginDiscoveryProvidersRuntime(params: {
    config?: EnclawedConfig;
    workspaceDir?: string;
    env?: NodeJS.ProcessEnv;
    onlyPluginIds?: string[];
}): ProviderPlugin[];
