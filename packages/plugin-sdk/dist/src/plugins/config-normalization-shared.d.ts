import type { EnclawedConfig } from "../config/types.enclawed.js";
export type NormalizedPluginsConfig = {
    enabled: boolean;
    allow: string[];
    deny: string[];
    loadPaths: string[];
    slots: {
        memory?: string | null;
        contextEngine?: string | null;
    };
    entries: Record<string, {
        enabled?: boolean;
        hooks?: {
            allowPromptInjection?: boolean;
        };
        subagent?: {
            allowModelOverride?: boolean;
            allowedModels?: string[];
            hasAllowedModelsConfig?: boolean;
        };
        config?: unknown;
    }>;
};
export type NormalizePluginId = (id: string) => string;
export declare const identityNormalizePluginId: NormalizePluginId;
export declare function normalizePluginsConfigWithResolver(config?: EnclawedConfig["plugins"], normalizePluginId?: NormalizePluginId): NormalizedPluginsConfig;
export declare function hasExplicitPluginConfig(plugins?: EnclawedConfig["plugins"]): boolean;
export declare function isBundledChannelEnabledByChannelConfig(cfg: EnclawedConfig | undefined, pluginId: string): boolean;
