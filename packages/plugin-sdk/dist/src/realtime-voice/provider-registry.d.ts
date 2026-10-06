import type { EnclawedConfig } from "../config/types.enclawed.js";
import type { RealtimeVoiceProviderPlugin } from "../plugins/types.js";
import type { RealtimeVoiceProviderId } from "./provider-types.js";
export declare function normalizeRealtimeVoiceProviderId(providerId: string | undefined): RealtimeVoiceProviderId | undefined;
export declare function listRealtimeVoiceProviders(cfg?: EnclawedConfig): RealtimeVoiceProviderPlugin[];
export declare function getRealtimeVoiceProvider(providerId: string | undefined, cfg?: EnclawedConfig): RealtimeVoiceProviderPlugin | undefined;
export declare function canonicalizeRealtimeVoiceProviderId(providerId: string | undefined, cfg?: EnclawedConfig): RealtimeVoiceProviderId | undefined;
