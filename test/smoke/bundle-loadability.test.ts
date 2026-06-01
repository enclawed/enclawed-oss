/**
 * Bundle-loadability smoke test.
 *
 * Fast local counterpart of `scripts/ci/post-bundle-smoke.mjs`. The script
 * does the full three-layer scan (static + bundle + packaged-install). This
 * test runs only the static layer so it stays fast (no `npm pack`, no
 * `pnpm build` dependency) and gives developers immediate feedback when a
 * commit drops an SDK symbol or subpath that one of the bundled plugins
 * still imports.
 *
 * The test is allowlist-based:
 *   - `KNOWN_MISSING_SUBPATHS` and `KNOWN_MISSING_SYMBOLS` lock in the current
 *     drift between the closed-tree `src/plugin-sdk/` and the bundled
 *     extensions. New regressions surface as a diff against these sets.
 *   - When a fix lands (subpath restored, symbol re-exported), remove the
 *     corresponding entry from the allowlist in the same change.
 *
 * The intent is the opposite of the CI workflow's `--strict` mode:
 *   - CI gates merges by demanding the *packaged install* is clean (no
 *     plugin-load errors except for an explicit version-floor allowlist).
 *   - This test gates merges by demanding the *static drift* never grows.
 *
 * Together they catch the two regression shapes that slipped past the
 * existing build pipeline for 0.1.1:
 *   - Class A: source file exists but doesn't export a symbol an extension
 *     imports (manifests as `ReferenceError: X is not defined` at load).
 *   - Class B: source file doesn't exist at all (manifests as
 *     `Cannot find module .../dist/plugin-sdk/root-alias.cjs/<subpath>` at
 *     load, because Node falls through the package exports map onto the
 *     legacy root-alias file).
 *
 * G2 — drift-baseline lock:
 *   The allowlist may shrink between commits but never grow without an
 *   explicit lock-file update. `test/smoke/drift-baseline.lock` carries a
 *   SHA-256 of the canonical JSON {"subpaths":[…sorted],"symbols":[…sorted]}
 *   built from KNOWN_MISSING_SUBPATHS + KNOWN_MISSING_SYMBOLS below. The
 *   "drift baseline lock matches" test hashes the same structure at run
 *   time and fails if it differs from the lock file. To grow the allowlist,
 *   update the lock file in the SAME PR so the increase is visible in
 *   review. To shrink, regenerate the lock — the lock is the audit trail,
 *   not the source of truth (the inline sets are).
 */

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(__filename), "..", "..");
const SMOKE_SCRIPT = resolve(REPO_ROOT, "scripts", "ci", "post-bundle-smoke.mjs");

/**
 * Subpaths used by extensions but missing entirely from `src/plugin-sdk/`.
 * Each entry is a known drift between the closed-tree SDK surface and the
 * bundled extensions inherited from upstream Enclawed. Restoring an entry
 * (or removing the extension that needs it, behind the zero-trust selection
 * layer) should also delete the entry from this allowlist.
 */
const KNOWN_MISSING_SUBPATHS = new Set<string>([]);

/**
 * Value symbols imported by extensions but not exported by the matching
 * `src/plugin-sdk/<subpath>` source file. Same allowlist semantics as
 * KNOWN_MISSING_SUBPATHS above. The static scanner only flags non-type
 * symbols, so this set is the runtime-visible surface that would actually
 * throw at extension load.
 *
 * Population strategy: when this list goes out of sync, run
 *   `node scripts/ci/post-bundle-smoke.mjs --json`
 * and copy the entries from `static.missingSymbols[]` (one
 * `<subpath>::<name>` per line). Removing an entry from the allowlist is the
 * acceptance test for a "symbol restored" fix.
 */
function loadKnownMissingSymbols(): Set<string> {
  // Stored inline (not externalized as JSON) so allowlist edits show up in
  // the same review as the code change that adds or removes them.
  //
  // Regenerate after a build/source change with:
  //   node scripts/ci/post-bundle-smoke.mjs --json \
  //     | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{ \
  //         const p=JSON.parse(d);for(const e of p.static.missingSymbols) \
  //         console.log('    \"'+e.subpath+'::'+e.name+'\",');})"
  return new Set<string>([]);
}

type SmokeReport = {
  static: {
    missingSubpaths: Array<{ subpath: string; files: string[] }>;
    missingSymbols: Array<{ subpath: string; name: string; files: string[] }>;
  };
  bundle: { ran: boolean; reason?: string; missing?: Array<{ exportKey: string }> };
  packaged: { ran: boolean; reason?: string };
};

function runSmokeReport(): SmokeReport {
  // Report can grow past the default 1MB stdout cap; allow plenty of headroom
  // so a noisy regression batch doesn't trip the parser before the test sees it.
  const result = spawnSync(process.execPath, [SMOKE_SCRIPT, "--json"], {
    encoding: "utf8",
    cwd: REPO_ROOT,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`post-bundle-smoke.mjs exited with ${result.status}: ${result.stderr}`);
  }
  return JSON.parse(result.stdout) as SmokeReport;
}

function canonicalizeAllowlistsForHash(
  subpaths: Iterable<string>,
  symbols: Iterable<string>,
): string {
  return JSON.stringify({
    subpaths: [...subpaths].sort(),
    symbols: [...symbols].sort(),
  });
}

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function loadDriftBaselineLock(): { expected: string; canonical: string } {
  const lockPath = resolve(REPO_ROOT, "test", "smoke", "drift-baseline.lock");
  const raw = readFileSync(lockPath, "utf8");
  const parsed = JSON.parse(raw) as {
    expected?: unknown;
    canonical?: unknown;
  };
  if (typeof parsed.expected !== "string" || typeof parsed.canonical !== "string") {
    throw new Error(`drift-baseline.lock is malformed at ${lockPath}`);
  }
  return { expected: parsed.expected, canonical: parsed.canonical };
}

describe("plugin-sdk surface drift (static scan)", () => {
  // Cached because both assertions parse the same scan output.
  const reportPromise = (async () => runSmokeReport())();

  it("drift baseline lock matches KNOWN_MISSING_SUBPATHS + KNOWN_MISSING_SYMBOLS", () => {
    const canonical = canonicalizeAllowlistsForHash(
      KNOWN_MISSING_SUBPATHS,
      loadKnownMissingSymbols(),
    );
    const computed = sha256Hex(canonical);
    const lock = loadDriftBaselineLock();
    expect(
      computed,
      [
        "Drift baseline lock is out of date.",
        "The inline KNOWN_MISSING_SUBPATHS + KNOWN_MISSING_SYMBOLS allowlists",
        "no longer hash to the value committed to test/smoke/drift-baseline.lock.",
        "If you intentionally grew or shrunk the allowlist, update the lock file",
        "in the same PR — its `expected` field should be the new SHA-256 over",
        "the canonical JSON below.",
        `Computed canonical: ${canonical}`,
        `Computed sha256:    ${computed}`,
        `Lock-file canonical: ${lock.canonical}`,
        `Lock-file expected:  ${lock.expected}`,
      ].join("\n"),
    ).toBe(lock.expected);
  });

  it("does not grow the missing-subpath allowlist", async () => {
    const report = await reportPromise;
    const observed = new Set(report.static.missingSubpaths.map((entry) => entry.subpath));
    const unexpected = [...observed].filter((subpath) => !KNOWN_MISSING_SUBPATHS.has(subpath));
    expect(
      unexpected,
      [
        "New plugin-sdk subpaths are imported by extensions but missing from src/plugin-sdk/.",
        "Either restore the subpath source file or, if intentional, add the id to the",
        "KNOWN_MISSING_SUBPATHS allowlist in test/smoke/bundle-loadability.test.ts.",
        `New entries: ${unexpected.join(", ")}`,
      ].join("\n"),
    ).toEqual([]);
  });

  it("does not grow the missing-symbol allowlist", async () => {
    const report = await reportPromise;
    const allowlist = loadKnownMissingSymbols();
    const observed = new Set(
      report.static.missingSymbols.map((entry) => `${entry.subpath}::${entry.name}`),
    );
    const unexpected = [...observed].filter((key) => !allowlist.has(key));
    expect(
      unexpected.slice(0, 20),
      [
        "New value symbols are imported by extensions but not exported by the matching",
        "src/plugin-sdk/<subpath> source file. Either re-export the symbol or, if",
        "intentional, add the entry to loadKnownMissingSymbols() in",
        "test/smoke/bundle-loadability.test.ts.",
        `Total new entries: ${unexpected.length}. Showing first 20.`,
      ].join("\n"),
    ).toEqual([]);
  });
});
