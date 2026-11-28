import {
  defineLegacyConfigMigration,
  getRecord,
  type LegacyConfigMigrationSpec,
  type LegacyConfigRule,
} from "../../../config/legacy.shared.js";

// The diagnostics-otel plugin (OpenTelemetry export) was removed; `diagnostics.otel`
// configured only that plugin and is no longer part of the config contract.
const DIAGNOSTICS_OTEL_RULE: LegacyConfigRule = {
  path: ["diagnostics", "otel"],
  message:
    'diagnostics.otel is no longer supported (the OpenTelemetry export plugin was removed). Run "enclawed doctor --fix" to remove it.',
};

export const LEGACY_CONFIG_MIGRATIONS_RUNTIME_DIAGNOSTICS: LegacyConfigMigrationSpec[] = [
  defineLegacyConfigMigration({
    id: "diagnostics.otel-removed",
    describe: "Remove diagnostics.otel (the OpenTelemetry export plugin was removed)",
    legacyRules: [DIAGNOSTICS_OTEL_RULE],
    apply: (raw, changes) => {
      const diagnostics = getRecord(raw.diagnostics);
      if (!diagnostics || !("otel" in diagnostics)) {
        return;
      }
      delete diagnostics.otel;
      changes.push("Removed diagnostics.otel (the OpenTelemetry export plugin was removed).");
    },
  }),
];
