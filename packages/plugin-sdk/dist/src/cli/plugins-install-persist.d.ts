import type { EnclawedConfig } from "../config/types.enclawed.js";
import { type HookInstallUpdate } from "../hooks/installs.js";
import { type PluginInstallUpdate } from "../plugins/installs.js";
export declare function persistPluginInstall(params: {
    config: EnclawedConfig;
    baseHash?: string;
    pluginId: string;
    install: Omit<PluginInstallUpdate, "pluginId">;
    successMessage?: string;
    warningMessage?: string;
}): Promise<EnclawedConfig>;
export declare function persistHookPackInstall(params: {
    config: EnclawedConfig;
    baseHash?: string;
    hookPackId: string;
    hooks: string[];
    install: Omit<HookInstallUpdate, "hookId" | "hooks">;
    successMessage?: string;
}): Promise<EnclawedConfig>;
