import type { EnclawedConfig } from "../../config/types.enclawed.js";
import { type ImageModelConfig } from "./image-tool.helpers.js";
export declare function resolvePdfModelConfigForTool(params: {
    cfg?: EnclawedConfig;
    agentDir: string;
}): ImageModelConfig | null;
