import type { EnclawedConfig } from "../config/types.js";
import type { MusicGenerationProviderPlugin } from "../plugins/types.js";
export declare function listMusicGenerationProviders(cfg?: EnclawedConfig): MusicGenerationProviderPlugin[];
export declare function getMusicGenerationProvider(providerId: string | undefined, cfg?: EnclawedConfig): MusicGenerationProviderPlugin | undefined;
