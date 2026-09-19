import type { EnclawedConfig } from "../config/types.enclawed.js";
export { extractInstalledNpmHookPackageName, extractInstalledNpmPackageName, } from "./plugins-install-records.js";
export declare function resolveFileNpmSpecToLocalPath(raw: string): {
    ok: true;
    path: string;
} | {
    ok: false;
    error: string;
} | null;
export declare function applySlotSelectionForPlugin(config: EnclawedConfig, pluginId: string): {
    config: EnclawedConfig;
    warnings: string[];
};
export declare function createPluginInstallLogger(): {
    info: (msg: string) => void;
    warn: (msg: string) => void;
};
export declare function createHookPackInstallLogger(): {
    info: (msg: string) => void;
    warn: (msg: string) => void;
};
export declare function enableInternalHookEntries(config: EnclawedConfig, hookNames: string[]): EnclawedConfig;
export declare function formatPluginInstallWithHookFallbackError(pluginError: string, hookError: string): string;
export declare function logHookPackRestartHint(): void;
export declare function logSlotWarnings(warnings: string[]): void;
export declare function buildPreferredClawHubSpec(raw: string): string | null;
export declare const PREFERRED_CLAWHUB_FALLBACK_DECISION: {
    readonly FALLBACK_TO_NPM: "fallback_to_npm";
    readonly STOP: "stop";
};
export type PreferredClawHubFallbackDecision = (typeof PREFERRED_CLAWHUB_FALLBACK_DECISION)[keyof typeof PREFERRED_CLAWHUB_FALLBACK_DECISION];
export declare function decidePreferredClawHubFallback(params: {
    code?: string;
}): PreferredClawHubFallbackDecision;
