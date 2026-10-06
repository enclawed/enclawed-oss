import type { EnclawedConfig } from "@enclawed/plugin-sdk/config-types";

export function makeQqbotSecretRefConfig(): EnclawedConfig {
  return {
    channels: {
      qqbot: {
        appId: "123456",
        clientSecret: {
          source: "env",
          provider: "default",
          id: "QQBOT_CLIENT_SECRET",
        },
      },
    },
  } as EnclawedConfig;
}

export function makeQqbotDefaultAccountConfig(): EnclawedConfig {
  return {
    channels: {
      qqbot: {
        defaultAccount: "bot2",
        accounts: {
          bot2: { appId: "123456" },
        },
      },
    },
  } as EnclawedConfig;
}
