import type { EnclawedConfig } from "../../config/types.enclawed.js";
import { buildProviderAuthDoctorHintWithPlugin } from "../../plugins/provider-runtime.runtime.js";
import { normalizeProviderId } from "../provider-id.js";
import type { AuthProfileStore } from "./types.js";

export async function formatAuthDoctorHint(params: {
  cfg?: EnclawedConfig;
  store: AuthProfileStore;
  provider: string;
  profileId?: string;
}): Promise<string> {
  const normalizedProvider = normalizeProviderId(params.provider);

  const pluginHint = await buildProviderAuthDoctorHintWithPlugin({
    provider: normalizedProvider,
    context: {
      config: params.cfg,
      store: params.store,
      provider: normalizedProvider,
      profileId: params.profileId,
    },
  });
  if (typeof pluginHint === "string" && pluginHint.trim()) {
    return pluginHint;
  }
  return "";
}
