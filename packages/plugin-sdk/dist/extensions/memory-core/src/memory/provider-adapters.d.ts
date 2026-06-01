import { DEFAULT_LOCAL_MODEL, type MemoryEmbeddingProviderAdapter } from "@enclawed/plugin-sdk/memory-core-host-engine-embeddings";
export type BuiltinMemoryEmbeddingProviderDoctorMetadata = {
    providerId: string;
    authProviderId: string;
    envVars: string[];
    transport: "local" | "remote";
    autoSelectPriority?: number;
};
declare function formatLocalSetupError(err: unknown): string;
declare function canAutoSelectLocal(modelPath?: string): boolean;
export declare const builtinMemoryEmbeddingProviderAdapters: readonly [MemoryEmbeddingProviderAdapter];
export { DEFAULT_LOCAL_MODEL };
export declare function getBuiltinMemoryEmbeddingProviderAdapter(id: string): MemoryEmbeddingProviderAdapter | undefined;
export declare function registerBuiltInMemoryEmbeddingProviders(register: {
    registerMemoryEmbeddingProvider: (adapter: MemoryEmbeddingProviderAdapter) => void;
}): void;
export declare function getBuiltinMemoryEmbeddingProviderDoctorMetadata(providerId: string): BuiltinMemoryEmbeddingProviderDoctorMetadata | null;
export declare function listBuiltinAutoSelectMemoryEmbeddingProviderDoctorMetadata(): Array<BuiltinMemoryEmbeddingProviderDoctorMetadata>;
export { canAutoSelectLocal, formatLocalSetupError };
