import type { EnclawedConfig } from "../config/types.enclawed.js";
import { resolvePluginCapabilityProviders } from "../plugins/capability-provider-runtime.js";
import {
  buildCapabilityProviderMaps,
  normalizeCapabilityProviderId,
} from "../plugins/provider-registry-shared.js";
import type { RealtimeVoiceProviderPlugin } from "../plugins/types.js";
import type { RealtimeVoiceProviderId } from "./provider-types.js";

export function normalizeRealtimeVoiceProviderId(
  providerId: string | undefined,
): RealtimeVoiceProviderId | undefined {
  return normalizeCapabilityProviderId(providerId);
}

function resolveRealtimeVoiceProviderEntries(cfg?: EnclawedConfig): RealtimeVoiceProviderPlugin[] {
  return resolvePluginCapabilityProviders({
    key: "realtimeVoiceProviders",
    cfg,
  });
}

function buildProviderMaps(cfg?: EnclawedConfig): {
  canonical: Map<string, RealtimeVoiceProviderPlugin>;
  aliases: Map<string, RealtimeVoiceProviderPlugin>;
} {
  return buildCapabilityProviderMaps(resolveRealtimeVoiceProviderEntries(cfg));
}

export function listRealtimeVoiceProviders(cfg?: EnclawedConfig): RealtimeVoiceProviderPlugin[] {
  return [...buildProviderMaps(cfg).canonical.values()];
}

export function getRealtimeVoiceProvider(
  providerId: string | undefined,
  cfg?: EnclawedConfig,
): RealtimeVoiceProviderPlugin | undefined {
  const normalized = normalizeRealtimeVoiceProviderId(providerId);
  if (!normalized) {
    return undefined;
  }
  return buildProviderMaps(cfg).aliases.get(normalized);
}

export function canonicalizeRealtimeVoiceProviderId(
  providerId: string | undefined,
  cfg?: EnclawedConfig,
): RealtimeVoiceProviderId | undefined {
  const normalized = normalizeRealtimeVoiceProviderId(providerId);
  if (!normalized) {
    return undefined;
  }
  return getRealtimeVoiceProvider(normalized, cfg)?.id ?? normalized;
}
