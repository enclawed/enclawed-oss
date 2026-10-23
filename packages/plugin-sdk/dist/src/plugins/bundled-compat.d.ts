import type { EnclawedConfig } from "../config/types.enclawed.js";
export declare function withBundledPluginAllowlistCompat(params: {
    config: EnclawedConfig | undefined;
    pluginIds: readonly string[];
}): EnclawedConfig | undefined;
export declare function withBundledPluginEnablementCompat(params: {
    config: EnclawedConfig | undefined;
    pluginIds: readonly string[];
}): EnclawedConfig | undefined;
export declare function withBundledPluginVitestCompat(params: {
    config: EnclawedConfig | undefined;
    pluginIds: readonly string[];
    env?: NodeJS.ProcessEnv;
}): EnclawedConfig | undefined;
