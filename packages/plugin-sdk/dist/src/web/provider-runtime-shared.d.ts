import type { EnclawedConfig } from "../config/types.enclawed.js";
type RuntimeWebProviderMetadata = {
    providerConfigured?: string;
    selectedProvider?: string;
};
type ProviderWithCredential = {
    envVars: string[];
    requiresCredential?: boolean;
};
export declare function resolveWebProviderConfig<TKind extends "search" | "fetch", TConfig extends Record<string, unknown>>(cfg: EnclawedConfig | undefined, kind: TKind): TConfig | undefined;
export declare function readWebProviderEnvValue(envVars: string[], processEnv?: NodeJS.ProcessEnv): string | undefined;
export declare function providerRequiresCredential(provider: Pick<ProviderWithCredential, "requiresCredential">): boolean;
export declare function hasWebProviderEntryCredential<TProvider extends ProviderWithCredential, TConfig extends Record<string, unknown> | undefined>(params: {
    provider: TProvider;
    config: EnclawedConfig | undefined;
    toolConfig: TConfig;
    resolveRawValue: (params: {
        provider: TProvider;
        config: EnclawedConfig | undefined;
        toolConfig: TConfig;
    }) => unknown;
    resolveEnvValue: (params: {
        provider: TProvider;
        configuredEnvVarId?: string;
    }) => string | undefined;
}): boolean;
export declare function resolveWebProviderDefinition<TProvider extends {
    id: string;
}, TConfig extends Record<string, unknown> | undefined, TRuntimeMetadata extends RuntimeWebProviderMetadata, TDefinition>(params: {
    config: EnclawedConfig | undefined;
    toolConfig: TConfig;
    runtimeMetadata: TRuntimeMetadata | undefined;
    sandboxed?: boolean;
    providerId?: string;
    providers: TProvider[];
    resolveEnabled: (params: {
        toolConfig: TConfig;
        sandboxed?: boolean;
    }) => boolean;
    resolveAutoProviderId: (params: {
        config: EnclawedConfig | undefined;
        toolConfig: TConfig;
        providers: TProvider[];
    }) => string;
    resolveFallbackProviderId?: (params: {
        config: EnclawedConfig | undefined;
        toolConfig: TConfig;
        providers: TProvider[];
        providerId: string;
    }) => string | undefined;
    createTool: (params: {
        provider: TProvider;
        config: EnclawedConfig | undefined;
        toolConfig: TConfig;
        runtimeMetadata: TRuntimeMetadata | undefined;
    }) => TDefinition | null;
}): {
    provider: TProvider;
    definition: TDefinition;
} | null;
export {};
