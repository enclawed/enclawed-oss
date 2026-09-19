import type { EnclawedConfig } from "../config/types.js";
import type { SpeechProviderPlugin } from "../plugins/types.js";
import type { SpeechModelOverridePolicy, SpeechProviderConfig, TtsDirectiveParseResult } from "./provider-types.js";
type ParseTtsDirectiveOptions = {
    cfg?: EnclawedConfig;
    providers?: readonly SpeechProviderPlugin[];
    providerConfigs?: Record<string, SpeechProviderConfig>;
    preferredProviderId?: string;
};
export declare function parseTtsDirectives(text: string, policy: SpeechModelOverridePolicy, options?: ParseTtsDirectiveOptions): TtsDirectiveParseResult;
export {};
