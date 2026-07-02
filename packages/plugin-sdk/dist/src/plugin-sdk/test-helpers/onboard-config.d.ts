import type { ModelApi } from "../provider-model-shared.js";
import type { EnclawedConfig } from "../config-types.js";
export declare const EXPECTED_FALLBACKS: readonly ["anthropic/claude-opus-4-5"];
export declare function createLegacyProviderConfig(params: {
    providerId: string;
    api: ModelApi;
    modelId?: string;
    modelName?: string;
    baseUrl?: string;
    apiKey?: string;
}): EnclawedConfig;
export declare function createConfigWithFallbacks(): EnclawedConfig;
