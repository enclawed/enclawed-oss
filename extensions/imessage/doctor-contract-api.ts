import type { ChannelDoctorLegacyConfigRule } from "@enclawed/plugin-sdk/channel-contract";

// iMessage does not expose doctor legacy rules today. Keep that empty answer on
// a lightweight contract surface so doctor scans stay off the full plugin path.
export const legacyConfigRules: ChannelDoctorLegacyConfigRule[] = [];
