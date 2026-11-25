import type { EnclawedConfig } from "../../config/types.enclawed.js";

export function createPerSenderSessionConfig(
  overrides: Partial<NonNullable<EnclawedConfig["session"]>> = {},
): NonNullable<EnclawedConfig["session"]> {
  return {
    mainKey: "main",
    scope: "per-sender",
    ...overrides,
  };
}
