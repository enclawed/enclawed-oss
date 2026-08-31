import type { EnclawedConfig } from "../config/types.enclawed.js";
import type { HookInstallRecord } from "../config/types.hooks.js";
export type HookInstallUpdate = HookInstallRecord & {
    hookId: string;
};
export declare function recordHookInstall(cfg: EnclawedConfig, update: HookInstallUpdate): EnclawedConfig;
