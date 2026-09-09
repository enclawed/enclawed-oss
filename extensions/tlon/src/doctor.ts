import type { ChannelDoctorAdapter } from "@enclawed/plugin-sdk/channel-contract";
import {
  legacyConfigRules as TLON_LEGACY_CONFIG_RULES,
  normalizeCompatibilityConfig as normalizeTlonCompatibilityConfig,
} from "./doctor-contract.js";

export const tlonDoctor: ChannelDoctorAdapter = {
  legacyConfigRules: TLON_LEGACY_CONFIG_RULES,
  normalizeCompatibilityConfig: normalizeTlonCompatibilityConfig,
};
