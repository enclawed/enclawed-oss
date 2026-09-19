import type { EnclawedConfig } from "../config/types.js";
import type { TtsMode } from "../config/types.tts.js";
export { normalizeTtsAutoMode } from "./tts-auto-mode.js";
export declare function resolveConfiguredTtsMode(cfg: EnclawedConfig): TtsMode;
export declare function shouldAttemptTtsPayload(params: {
    cfg: EnclawedConfig;
    ttsAuto?: string;
}): boolean;
