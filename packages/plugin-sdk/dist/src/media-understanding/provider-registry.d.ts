import type { EnclawedConfig } from "../config/types.js";
import type { MediaUnderstandingProvider } from "./types.js";
export { normalizeMediaProviderId } from "./provider-id.js";
export declare function buildMediaUnderstandingRegistry(overrides?: Record<string, MediaUnderstandingProvider>, cfg?: EnclawedConfig): Map<string, MediaUnderstandingProvider>;
export declare function getMediaUnderstandingProvider(id: string, registry: Map<string, MediaUnderstandingProvider>): MediaUnderstandingProvider | undefined;
