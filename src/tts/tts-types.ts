import type { EnclawedConfig } from "../config/types.enclawed.js";
import type { TtsAutoMode, TtsConfig, TtsMode, TtsProvider } from "../config/types.tts.js";
import type { SpeechModelOverridePolicy, SpeechProviderConfig } from "./provider-types.js";

export type ResolvedTtsModelOverrides = SpeechModelOverridePolicy;

export type ResolvedTtsConfig = {
  auto: TtsAutoMode;
  mode: TtsMode;
  provider: TtsProvider;
  providerSource: "config" | "default";
  summaryModel?: string;
  modelOverrides: ResolvedTtsModelOverrides;
  providerConfigs: Record<string, SpeechProviderConfig>;
  /**
   * Resolved TTS persona definitions keyed by persona id. Intentionally
   * permissive in oss; upstream binds this to a richer persona type.
   */
  personas?: Record<string, unknown>;
  prefsPath?: string;
  maxTextLength: number;
  timeoutMs: number;
  rawConfig?: TtsConfig;
  sourceConfig?: EnclawedConfig;
};
