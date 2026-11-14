import type { EnclawedConfig } from "@enclawed/plugin-sdk/config-types";

export function createWhatsAppPollFixture() {
  const cfg = { marker: "resolved-cfg" } as EnclawedConfig;
  const poll = {
    question: "Lunch?",
    options: ["Pizza", "Sushi"],
    maxSelections: 1,
  };
  return {
    cfg,
    poll,
    to: "+1555",
    accountId: "work",
  };
}
