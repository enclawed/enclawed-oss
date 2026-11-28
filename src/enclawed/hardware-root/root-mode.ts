// ENCLAWEDER_ROOT: the one strict parser every reader shares (settings audit
// #9). Only the exact lowercase words below are accepted. The old aliases
// (`1`, `true`, `0`, `false`, `off`) and any other spelling (`Required`,
// ` required`) are refused, because a near-miss used to mean "not required"
// silently.

export type HardwareRootMode = "auto" | "required" | "optional";

export class HardwareRootModeError extends Error {
  override name = "HardwareRootModeError";
  constructor(readonly value: string) {
    super(
      `ENCLAWEDER_ROOT=${JSON.stringify(value)} is not accepted: use exactly "required" or ` +
        '"optional" (lowercase), or leave it unset',
    );
  }
}

/**
 * Parse ENCLAWEDER_ROOT. Unset (or set to the empty string) is "auto": a
 * device on the bus is bound and enforced, and none means software-only.
 * Throws HardwareRootModeError for anything but the exact accepted words.
 */
export function parseHardwareRootMode(raw: string | undefined): HardwareRootMode {
  if (raw === undefined || raw === "") {
    return "auto";
  }
  if (raw === "required" || raw === "optional") {
    return raw;
  }
  throw new HardwareRootModeError(raw);
}

/** The mode from `env` (default process.env); throws on an invalid value. */
export function hardwareRootMode(env: NodeJS.ProcessEnv = process.env): HardwareRootMode {
  return parseHardwareRootMode(env.ENCLAWEDER_ROOT);
}
