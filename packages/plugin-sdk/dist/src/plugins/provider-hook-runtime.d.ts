import type { EnclawedConfig } from "../config/types.enclawed.js";
import type { ProviderPlugin, ProviderPrepareExtraParamsContext, ProviderWrapStreamFnContext } from "./types.js";
declare function buildHookProviderCacheKey(params: {
    config?: EnclawedConfig;
    workspaceDir?: string;
    onlyPluginIds?: string[];
    providerRefs?: string[];
    env?: NodeJS.ProcessEnv;
}): string;
export declare function clearProviderRuntimeHookCache(): void;
export declare function resetProviderRuntimeHookCacheForTest(): void;
export declare const __testing: {
    readonly buildHookProviderCacheKey: typeof buildHookProviderCacheKey;
};
export declare function resolveProviderPluginsForHooks(params: {
    config?: EnclawedConfig;
    workspaceDir?: string;
    env?: NodeJS.ProcessEnv;
    onlyPluginIds?: string[];
    providerRefs?: string[];
}): ProviderPlugin[];
export declare function resolveProviderRuntimePlugin(params: {
    provider: string;
    config?: EnclawedConfig;
    workspaceDir?: string;
    env?: NodeJS.ProcessEnv;
}): ProviderPlugin | undefined;
export declare function resolveProviderHookPlugin(params: {
    provider: string;
    config?: EnclawedConfig;
    workspaceDir?: string;
    env?: NodeJS.ProcessEnv;
}): ProviderPlugin | undefined;
export declare function prepareProviderExtraParams(params: {
    provider: string;
    config?: EnclawedConfig;
    workspaceDir?: string;
    env?: NodeJS.ProcessEnv;
    context: ProviderPrepareExtraParamsContext;
}): Record<string, unknown> | undefined;
export declare function wrapProviderStreamFn(params: {
    provider: string;
    config?: EnclawedConfig;
    workspaceDir?: string;
    env?: NodeJS.ProcessEnv;
    context: ProviderWrapStreamFnContext;
}): import("@mariozechner/pi-agent-core").StreamFn | undefined;
export {};
