import type { EnclawedConfig } from "../config/types.enclawed.js";
import { type NormalizedPluginsConfig, type PluginActivationConfigSource } from "./config-state.js";
export type PluginActivationCompatConfig = {
    allowlistPluginIds?: readonly string[];
    enablementPluginIds?: readonly string[];
    vitestPluginIds?: readonly string[];
};
export type PluginActivationBundledCompatMode = {
    allowlist?: boolean;
    enablement?: "always" | "allowlist";
    vitest?: boolean;
};
export type PluginActivationInputs = {
    rawConfig?: EnclawedConfig;
    config?: EnclawedConfig;
    normalized: NormalizedPluginsConfig;
    activationSourceConfig?: EnclawedConfig;
    activationSource: PluginActivationConfigSource;
    autoEnabledReasons: Record<string, string[]>;
};
export type PluginActivationSnapshot = Pick<PluginActivationInputs, "rawConfig" | "config" | "normalized" | "activationSourceConfig" | "activationSource" | "autoEnabledReasons">;
export type BundledPluginCompatibleActivationInputs = PluginActivationInputs & {
    compatPluginIds: string[];
};
export type BundledPluginCompatibleLoadValues = Pick<BundledPluginCompatibleActivationInputs, "rawConfig" | "config" | "activationSourceConfig" | "autoEnabledReasons" | "compatPluginIds">;
export declare function withActivatedPluginIds(params: {
    config?: EnclawedConfig;
    pluginIds: readonly string[];
    overrideGlobalDisable?: boolean;
    overrideExplicitDisable?: boolean;
}): EnclawedConfig | undefined;
export declare function applyPluginCompatibilityOverrides(params: {
    config?: EnclawedConfig;
    compat?: PluginActivationCompatConfig;
    env: NodeJS.ProcessEnv;
}): EnclawedConfig | undefined;
export declare function resolvePluginActivationSnapshot(params: {
    rawConfig?: EnclawedConfig;
    resolvedConfig?: EnclawedConfig;
    autoEnabledReasons?: Record<string, string[]>;
    env?: NodeJS.ProcessEnv;
    applyAutoEnable?: boolean;
}): PluginActivationSnapshot;
export declare function resolvePluginActivationInputs(params: {
    rawConfig?: EnclawedConfig;
    resolvedConfig?: EnclawedConfig;
    autoEnabledReasons?: Record<string, string[]>;
    env?: NodeJS.ProcessEnv;
    compat?: PluginActivationCompatConfig;
    applyAutoEnable?: boolean;
}): PluginActivationInputs;
export declare function resolveBundledPluginCompatibleActivationInputs(params: {
    rawConfig?: EnclawedConfig;
    resolvedConfig?: EnclawedConfig;
    autoEnabledReasons?: Record<string, string[]>;
    env?: NodeJS.ProcessEnv;
    workspaceDir?: string;
    onlyPluginIds?: readonly string[];
    applyAutoEnable?: boolean;
    compatMode: PluginActivationBundledCompatMode;
    resolveCompatPluginIds: (params: {
        config?: EnclawedConfig;
        workspaceDir?: string;
        env?: NodeJS.ProcessEnv;
        onlyPluginIds?: readonly string[];
    }) => string[];
}): BundledPluginCompatibleActivationInputs;
export declare function resolveBundledPluginCompatibleLoadValues(params: {
    rawConfig?: EnclawedConfig;
    resolvedConfig?: EnclawedConfig;
    autoEnabledReasons?: Record<string, string[]>;
    env?: NodeJS.ProcessEnv;
    workspaceDir?: string;
    onlyPluginIds?: readonly string[];
    applyAutoEnable?: boolean;
    compatMode: PluginActivationBundledCompatMode;
    resolveCompatPluginIds: (params: {
        config?: EnclawedConfig;
        workspaceDir?: string;
        env?: NodeJS.ProcessEnv;
        onlyPluginIds?: readonly string[];
    }) => string[];
}): BundledPluginCompatibleLoadValues;
