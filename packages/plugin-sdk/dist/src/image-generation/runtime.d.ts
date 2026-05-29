import type { EnclawedConfig } from "../config/types.enclawed.js";
import type { GenerateImageParams, GenerateImageRuntimeResult } from "./runtime-types.js";
export type { GenerateImageParams, GenerateImageRuntimeResult } from "./runtime-types.js";
export declare function listRuntimeImageGenerationProviders(params?: {
    config?: EnclawedConfig;
}): import("./types.js").ImageGenerationProvider[];
export declare function generateImage(params: GenerateImageParams): Promise<GenerateImageRuntimeResult>;
