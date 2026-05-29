import type { EnclawedConfig } from "@enclawed/plugin-sdk/config-types";
import type { CommandArgValues } from "@enclawed/plugin-sdk/native-command-registry";

export type DiscordConfig = NonNullable<EnclawedConfig["channels"]>["discord"];

export type DiscordCommandArgs = {
  raw?: string;
  values?: CommandArgValues;
};
