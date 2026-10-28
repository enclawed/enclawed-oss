import type { EnclawedConfig } from "@enclawed/plugin-sdk/config-types";

export type SignalAccountConfig = Omit<
  Exclude<NonNullable<EnclawedConfig["channels"]>["signal"], undefined>,
  "accounts"
>;
