// Brand env-var alias mirror.
//
// Historical/upstream env vars use the prefix `OPENCLAW_`. The enclawed fork
// adds matching `ENCLAWED_` aliases. To avoid touching every call site and to
// keep existing extensions working, this helper mirrors the two prefixes at
// boot time:
//
//   - For every `OPENCLAW_<rest>` in process.env, set `ENCLAWED_<rest>` if
//     and only if `ENCLAWED_<rest>` is not already set.
//   - For every `ENCLAWED_<rest>` in process.env, set `OPENCLAW_<rest>` if
//     and only if `OPENCLAW_<rest>` is not already set.
//
// When both are set with different values, `ENCLAWED_<rest>` wins: its value
// is preserved and `OPENCLAW_<rest>` is overwritten to match. This is
// implemented implicitly because the ENCLAWED-first pass runs second and any
// pre-existing ENCLAWED value blocks the OPENCLAW value from leaking into it,
// while the ENCLAWED -> OPENCLAW pass at the end overwrites OPENCLAW to align.
//
// Edge cases:
//   - Bare `OPENCLAW` and `ENCLAWED` (no suffix, no underscore) are skipped.
//   - The helper is idempotent: a second call is a no-op because by then
//     either both aliases exist with the same value, or both are absent.
//   - Filesystem-pointing vars in security harnesses (`OPENCLAW_PATH`,
//     `OPENCLAW_NODE`) name the upstream OpenClaw install, not enclawed brand
//     state. They still get mirrored to `ENCLAWED_PATH`/`ENCLAWED_NODE`
//     because the helper is purely syntactic; consumers that care about the
//     upstream-install location continue to read the `OPENCLAW_` names.
//
// User-data directory conventions (`~/.openclaw`, `.openclaw` state dirs) are
// path strings inside values and are deliberately left untouched.

const OPENCLAW_PREFIX = "OPENCLAW_";
const ENCLAWED_PREFIX = "ENCLAWED_";

function mirrorPrefix(
  env: NodeJS.ProcessEnv,
  sourcePrefix: string,
  targetPrefix: string,
  options: { overwrite: boolean },
): void {
  // Snapshot keys before mutating, so we never re-process freshly-set entries.
  const sourceKeys = Object.keys(env).filter((key) => key.startsWith(sourcePrefix));
  for (const sourceKey of sourceKeys) {
    // Skip the bare prefix-with-underscore-but-no-suffix case.
    const suffix = sourceKey.slice(sourcePrefix.length);
    if (suffix.length === 0) {
      continue;
    }
    const value = env[sourceKey];
    if (value === undefined) {
      continue;
    }
    const targetKey = `${targetPrefix}${suffix}`;
    if (options.overwrite || env[targetKey] === undefined) {
      env[targetKey] = value;
    }
  }
}

/**
 * Mirror `OPENCLAW_*` and `ENCLAWED_*` env vars in both directions so that
 * existing code reading either prefix continues to work, while `ENCLAWED_*`
 * wins on conflict.
 *
 * Call this exactly once, before any extension or plugin loads.
 *
 * @param env - The env object to mutate. Defaults to `process.env`.
 */
export function mirrorBrandEnv(env: NodeJS.ProcessEnv = process.env): void {
  // Skip bare-name env vars without an underscore suffix; only the
  // prefix-based aliases participate in the mirror.
  // (`OPENCLAW` and `ENCLAWED` on their own are not touched.)

  // First pass: fill missing ENCLAWED_* from OPENCLAW_*. Do NOT overwrite
  // existing ENCLAWED_* values; that is what makes ENCLAWED_* "win".
  mirrorPrefix(env, OPENCLAW_PREFIX, ENCLAWED_PREFIX, { overwrite: false });

  // Second pass: align OPENCLAW_* with the now-authoritative ENCLAWED_*
  // values. Overwrite is safe here: either OPENCLAW_* was unset (we fill it),
  // or it matched ENCLAWED_* (no-op), or it disagreed (ENCLAWED_* wins and
  // OPENCLAW_* is realigned).
  mirrorPrefix(env, ENCLAWED_PREFIX, OPENCLAW_PREFIX, { overwrite: true });
}
