import type { ModelApi } from "../provider-onboard.js";
import type { EnclawedConfig } from "../config-types.js";
import { createLegacyProviderConfig } from "./onboard-config.js";
export declare function expectProviderOnboardAllowlistAlias(params: {
    applyProviderConfig: (config: EnclawedConfig) => EnclawedConfig;
    modelRef: string;
    alias: string;
}): void;
export declare function expectProviderOnboardPrimaryAndFallbacks(params: {
    applyConfig: (config: EnclawedConfig) => EnclawedConfig;
    modelRef: string;
}): void;
export declare function expectProviderOnboardPrimaryModel(params: {
    applyConfig: (config: EnclawedConfig) => EnclawedConfig;
    modelRef: string;
}): void;
export declare function expectProviderOnboardPreservesPrimary(params: {
    applyProviderConfig: (config: EnclawedConfig) => EnclawedConfig;
    primaryModelRef: string;
}): void;
export declare function expectProviderOnboardMergedLegacyConfig(params: {
    applyProviderConfig: (config: EnclawedConfig) => EnclawedConfig;
    providerId: string;
    providerApi: ModelApi;
    baseUrl: string;
    legacyApi: Parameters<typeof createLegacyProviderConfig>[0]["api"];
    legacyModelId?: string;
    legacyModelName?: string;
    legacyBaseUrl?: string;
    legacyApiKey?: string;
}): import("../provider-onboard.js").ModelProviderConfig | undefined;
