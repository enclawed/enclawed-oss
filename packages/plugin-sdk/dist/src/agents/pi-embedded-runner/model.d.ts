import type { Api, Model } from "@mariozechner/pi-ai";
import type { ModelRegistry, ModelRuntime } from "@mariozechner/pi-coding-agent";
import type { EnclawedConfig } from "../../config/types.enclawed.js";
import { applyProviderResolvedModelCompatWithPlugins, applyProviderResolvedTransportWithPlugin, buildProviderUnknownModelHintWithPlugin, normalizeProviderTransportWithPlugin, prepareProviderDynamicModel, runProviderDynamicModel, normalizeProviderResolvedModelWithPlugin, shouldPreferProviderRuntimeResolvedModel } from "../../plugins/provider-runtime.js";
import { buildModelAliasLines } from "../model-alias-lines.js";
import type { EnclawedPiCredentialStore as AuthStorage } from "../pi-credential-store.js";
import { buildInlineProviderModels } from "./model.inline-provider.js";
type ProviderRuntimeHooks = {
    applyProviderResolvedModelCompatWithPlugins?: (params: Parameters<typeof applyProviderResolvedModelCompatWithPlugins>[0]) => unknown;
    applyProviderResolvedTransportWithPlugin?: (params: Parameters<typeof applyProviderResolvedTransportWithPlugin>[0]) => unknown;
    buildProviderUnknownModelHintWithPlugin: (params: Parameters<typeof buildProviderUnknownModelHintWithPlugin>[0]) => string | undefined;
    clearProviderRuntimeHookCache: () => void;
    prepareProviderDynamicModel: (params: Parameters<typeof prepareProviderDynamicModel>[0]) => Promise<void>;
    runProviderDynamicModel: (params: Parameters<typeof runProviderDynamicModel>[0]) => unknown;
    shouldPreferProviderRuntimeResolvedModel?: (params: Parameters<typeof shouldPreferProviderRuntimeResolvedModel>[0]) => boolean;
    normalizeProviderResolvedModelWithPlugin: (params: Parameters<typeof normalizeProviderResolvedModelWithPlugin>[0]) => unknown;
    normalizeProviderTransportWithPlugin: (params: Parameters<typeof normalizeProviderTransportWithPlugin>[0]) => unknown;
};
export { buildModelAliasLines, buildInlineProviderModels };
export declare function resolveModelWithRegistry(params: {
    provider: string;
    modelId: string;
    modelRegistry: ModelRegistry;
    cfg?: EnclawedConfig;
    agentDir?: string;
    runtimeHooks?: ProviderRuntimeHooks;
}): Model<Api> | undefined;
/**
 * Enclawed-owned pi model sources for one resolution: the credential store,
 * the pi model runtime built on it, and the Enclawed-policy registry view.
 * Callers may pass any of them in; missing ones are discovered from agentDir.
 */
type PiModelSources = {
    authStorage: AuthStorage;
    modelRuntime: ModelRuntime;
    modelRegistry: ModelRegistry;
};
export declare function resolveModel(provider: string, modelId: string, agentDir?: string, cfg?: EnclawedConfig, options?: {
    authStorage?: AuthStorage;
    modelRuntime?: ModelRuntime;
    modelRegistry?: ModelRegistry;
    runtimeHooks?: ProviderRuntimeHooks;
    skipProviderRuntimeHooks?: boolean;
}): Promise<{
    model?: Model<Api>;
    error?: string;
} & PiModelSources>;
export declare function resolveModelAsync(provider: string, modelId: string, agentDir?: string, cfg?: EnclawedConfig, options?: {
    authStorage?: AuthStorage;
    modelRuntime?: ModelRuntime;
    modelRegistry?: ModelRegistry;
    retryTransientProviderRuntimeMiss?: boolean;
    runtimeHooks?: ProviderRuntimeHooks;
    skipProviderRuntimeHooks?: boolean;
}): Promise<{
    model?: Model<Api>;
    error?: string;
} & PiModelSources>;
