import type { EnclawedConfig } from "../config/types.js";
import type { VideoGenerationProviderPlugin } from "../plugins/types.js";
export declare function listVideoGenerationProviders(cfg?: EnclawedConfig): VideoGenerationProviderPlugin[];
export declare function getVideoGenerationProvider(providerId: string | undefined, cfg?: EnclawedConfig): VideoGenerationProviderPlugin | undefined;
