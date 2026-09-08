import type { ModelProviderConfig, EnclawedConfig } from "./types.js";
export declare function normalizeProviderConfigForConfigDefaults(params: {
    provider: string;
    providerConfig: ModelProviderConfig;
}): ModelProviderConfig;
export declare function applyProviderConfigDefaultsForConfig(params: {
    provider: string;
    config: EnclawedConfig;
    env: NodeJS.ProcessEnv;
}): EnclawedConfig;
