import type { EnclawedConfig } from "../config/types.enclawed.js";

const MB = 1024 * 1024;

export function resolveConfiguredMediaMaxBytes(cfg?: EnclawedConfig): number | undefined {
  const configured = cfg?.agents?.defaults?.mediaMaxMb;
  if (typeof configured === "number" && Number.isFinite(configured) && configured > 0) {
    return Math.floor(configured * MB);
  }
  return undefined;
}
