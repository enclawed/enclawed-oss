import type { ChannelDoctorConfigMutation } from "@enclawed/plugin-sdk/channel-contract";
import type { EnclawedConfig } from "@enclawed/plugin-sdk/config-types";
import { normalizeCompatibilityConfig as normalizeCompatibilityConfigImpl } from "./doctor.js";

export function normalizeCompatibilityConfig({
  cfg,
}: {
  cfg: EnclawedConfig;
}): ChannelDoctorConfigMutation {
  return normalizeCompatibilityConfigImpl({ cfg });
}
