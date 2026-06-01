import type { EnclawedConfig } from "../../config/types.enclawed.js";
import { type MediaGenerateActionResult } from "./media-generate-tool-actions-shared.js";
type VideoGenerateActionResult = MediaGenerateActionResult;
export declare function createVideoGenerateListActionResult(config?: EnclawedConfig): VideoGenerateActionResult;
export declare function createVideoGenerateStatusActionResult(sessionKey?: string): VideoGenerateActionResult;
export declare function createVideoGenerateDuplicateGuardResult(sessionKey?: string): VideoGenerateActionResult | undefined;
export {};
