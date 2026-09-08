import type { PluginManifestRegistry } from "../plugins/manifest-registry.js";
import type { PluginAutoEnableCandidate } from "./plugin-auto-enable.types.js";
import type { EnclawedConfig } from "./types.enclawed.js";
export declare function shouldSkipPreferredPluginAutoEnable(params: {
    config: EnclawedConfig;
    entry: PluginAutoEnableCandidate;
    configured: readonly PluginAutoEnableCandidate[];
    env: NodeJS.ProcessEnv;
    registry: PluginManifestRegistry;
    isPluginDenied: (config: EnclawedConfig, pluginId: string) => boolean;
    isPluginExplicitlyDisabled: (config: EnclawedConfig, pluginId: string) => boolean;
    preferOverCache: Map<string, string[]>;
}): boolean;
