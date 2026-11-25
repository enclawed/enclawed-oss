import type { AssistantMessage } from "@mariozechner/pi-ai";
import type { EnclawedConfig } from "../../config/types.enclawed.js";
import { type ToolModelConfig } from "./model-config.helpers.js";
export type ImageModelConfig = ToolModelConfig;
export declare function decodeDataUrl(dataUrl: string, opts?: {
    maxBytes?: number;
}): {
    buffer: Buffer;
    mimeType: string;
    kind: "image";
};
/**
 * Returns true when the assistant message only contains reasoning/thinking
 * content (no visible assistant text). The image-description retry path uses
 * this to fall back to a "disable reasoning" request when an image model
 * silently emitted reasoning blocks instead of a descriptive answer.
 */
export declare function hasImageReasoningOnlyResponse(message: AssistantMessage): boolean;
export declare function coerceImageAssistantText(params: {
    message: AssistantMessage;
    provider: string;
    model: string;
}): string;
export declare function coerceImageModelConfig(cfg?: EnclawedConfig): ImageModelConfig;
export declare function resolveProviderVisionModelFromConfig(params: {
    cfg?: EnclawedConfig;
    provider: string;
}): string | null;
