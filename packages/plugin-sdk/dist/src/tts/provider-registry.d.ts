import type { EnclawedConfig } from "../config/types.js";
import type { SpeechProviderPlugin } from "../plugins/types.js";
import type { SpeechProviderId } from "./provider-types.js";
export declare function normalizeSpeechProviderId(providerId: string | undefined): SpeechProviderId | undefined;
export declare function listSpeechProviders(cfg?: EnclawedConfig): SpeechProviderPlugin[];
export declare function getSpeechProvider(providerId: string | undefined, cfg?: EnclawedConfig): SpeechProviderPlugin | undefined;
export declare function canonicalizeSpeechProviderId(providerId: string | undefined, cfg?: EnclawedConfig): SpeechProviderId | undefined;
