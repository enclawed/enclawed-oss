import type { EnclawedConfig } from "../config/types.enclawed.js";
export type PluginEnableResult = {
    config: EnclawedConfig;
    enabled: boolean;
    reason?: string;
};
export declare function enablePluginInConfig(cfg: EnclawedConfig, pluginId: string): PluginEnableResult;
