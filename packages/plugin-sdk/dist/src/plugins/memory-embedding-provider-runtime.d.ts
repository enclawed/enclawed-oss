import type { EnclawedConfig } from "../config/types.enclawed.js";
import { listRegisteredMemoryEmbeddingProviders, type MemoryEmbeddingProviderAdapter } from "./memory-embedding-providers.js";
export { listRegisteredMemoryEmbeddingProviders };
export declare function listRegisteredMemoryEmbeddingProviderAdapters(): MemoryEmbeddingProviderAdapter[];
export declare function listMemoryEmbeddingProviders(cfg?: EnclawedConfig): MemoryEmbeddingProviderAdapter[];
export declare function getMemoryEmbeddingProvider(id: string, cfg?: EnclawedConfig): MemoryEmbeddingProviderAdapter | undefined;
