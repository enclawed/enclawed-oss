import { type MemoryEmbeddingProvider, type MemoryEmbeddingProviderCreateOptions, type MemoryEmbeddingProviderRuntime } from "@enclawed/plugin-sdk/memory-core-host-engine-embeddings";
export { DEFAULT_LOCAL_MODEL } from "@enclawed/plugin-sdk/memory-core-host-engine-embeddings";
export type EmbeddingProvider = MemoryEmbeddingProvider;
export type EmbeddingProviderId = string;
export type EmbeddingProviderRequest = string;
export type EmbeddingProviderFallback = string;
export type EmbeddingProviderRuntime = MemoryEmbeddingProviderRuntime;
export type EmbeddingProviderResult = {
    provider: EmbeddingProvider | null;
    requestedProvider: EmbeddingProviderRequest;
    fallbackFrom?: string;
    fallbackReason?: string;
    providerUnavailableReason?: string;
    runtime?: EmbeddingProviderRuntime;
};
type CreateEmbeddingProviderOptions = MemoryEmbeddingProviderCreateOptions & {
    provider: EmbeddingProviderRequest;
    fallback: EmbeddingProviderFallback;
};
export declare function resolveEmbeddingProviderFallbackModel(providerId: string, fallbackSourceModel: string, config?: MemoryEmbeddingProviderCreateOptions["config"]): string;
export declare function createEmbeddingProvider(options: CreateEmbeddingProviderOptions): Promise<EmbeddingProviderResult>;
