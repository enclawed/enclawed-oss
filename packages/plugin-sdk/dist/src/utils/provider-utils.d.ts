import type { EnclawedConfig } from "../config/types.enclawed.js";
import type { ProviderRuntimeModel } from "../plugins/provider-runtime-model.types.js";
/**
 * Utility functions for provider-specific logic and capabilities.
 */
export declare function resolveReasoningOutputMode(params: {
    provider: string | undefined | null;
    config?: EnclawedConfig;
    workspaceDir?: string;
    env?: NodeJS.ProcessEnv;
    modelId?: string;
    modelApi?: string | null;
    model?: ProviderRuntimeModel;
}): "native" | "tagged";
/**
 * Returns true if the provider requires reasoning to be wrapped in tags
 * (e.g. <think> and <final>) in the text stream, rather than using native
 * API fields for reasoning/thinking.
 */
export declare function isReasoningTagProvider(provider: string | undefined | null, options?: {
    config?: EnclawedConfig;
    workspaceDir?: string;
    env?: NodeJS.ProcessEnv;
    modelId?: string;
    modelApi?: string | null;
    model?: ProviderRuntimeModel;
}): boolean;
