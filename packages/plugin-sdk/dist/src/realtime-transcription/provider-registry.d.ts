import type { EnclawedConfig } from "../config/types.enclawed.js";
import type { RealtimeTranscriptionProviderPlugin } from "../plugins/types.js";
import type { RealtimeTranscriptionProviderId } from "./provider-types.js";
export declare function normalizeRealtimeTranscriptionProviderId(providerId: string | undefined): RealtimeTranscriptionProviderId | undefined;
export declare function listRealtimeTranscriptionProviders(cfg?: EnclawedConfig): RealtimeTranscriptionProviderPlugin[];
export declare function getRealtimeTranscriptionProvider(providerId: string | undefined, cfg?: EnclawedConfig): RealtimeTranscriptionProviderPlugin | undefined;
export declare function canonicalizeRealtimeTranscriptionProviderId(providerId: string | undefined, cfg?: EnclawedConfig): RealtimeTranscriptionProviderId | undefined;
