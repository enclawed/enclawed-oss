import type { EnclawedConfig } from "../config/types.enclawed.js";
import type { ImageGenerationProviderPlugin } from "../plugins/types.js";
export declare function listImageGenerationProviders(cfg?: EnclawedConfig): ImageGenerationProviderPlugin[];
export declare function getImageGenerationProvider(providerId: string | undefined, cfg?: EnclawedConfig): ImageGenerationProviderPlugin | undefined;
