import type { EnclawedConfig } from "@enclawed/plugin-sdk/config-types";

export type IMessageAccountConfig = Omit<
  NonNullable<NonNullable<EnclawedConfig["channels"]>["imessage"]>,
  "accounts" | "defaultAccount"
>;
