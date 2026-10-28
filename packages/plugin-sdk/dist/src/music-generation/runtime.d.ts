import type { EnclawedConfig } from "../config/types.enclawed.js";
import type { GenerateMusicParams, GenerateMusicRuntimeResult } from "./runtime-types.js";
export type { GenerateMusicParams, GenerateMusicRuntimeResult } from "./runtime-types.js";
export declare function listRuntimeMusicGenerationProviders(params?: {
    config?: EnclawedConfig;
}): import("./types.js").MusicGenerationProvider[];
export declare function generateMusic(params: GenerateMusicParams): Promise<GenerateMusicRuntimeResult>;
