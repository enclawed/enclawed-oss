import type { EnclawedConfig } from "@enclawed/plugin-sdk/config-types";

export type WhatsAppAccountConfig = NonNullable<
  NonNullable<NonNullable<EnclawedConfig["channels"]>["whatsapp"]>["accounts"]
>[string];
