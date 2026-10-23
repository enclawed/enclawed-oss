import type { EnclawedConfig } from "../config/types.js";
import type { TtsAutoMode, TtsProvider } from "../config/types.tts.js";
type TtsStatusSnapshot = {
    autoMode: TtsAutoMode;
    provider: TtsProvider;
    maxLength: number;
    summarize: boolean;
};
export declare function resolveStatusTtsSnapshot(params: {
    cfg: EnclawedConfig;
    sessionAuto?: string;
}): TtsStatusSnapshot | null;
export {};
