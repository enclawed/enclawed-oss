import { isDeepStrictEqual } from "node:util";
import type { EnclawedConfig } from "../../../config/types.enclawed.js";
import { applyLegacyDoctorMigrations } from "./legacy-config-compat.js";
import { normalizeRuntimeCompatibilityConfigValues } from "./legacy-config-runtime-migrate.js";

export function applyRuntimeLegacyConfigMigrations(raw: unknown): {
  next: Record<string, unknown> | null;
  changes: string[];
} {
  if (!raw || typeof raw !== "object") {
    return { next: null, changes: [] };
  }

  const original = raw as Record<string, unknown>;
  const migrated = applyLegacyDoctorMigrations(original);
  const base = (migrated.next ?? original) as EnclawedConfig;
  const normalized = normalizeRuntimeCompatibilityConfigValues(base);
  const next = normalized.config as EnclawedConfig & Record<string, unknown>;
  const changes = [...migrated.changes, ...normalized.changes];

  if (changes.length === 0 || isDeepStrictEqual(next, original)) {
    return { next: null, changes: [] };
  }
  return { next, changes };
}
