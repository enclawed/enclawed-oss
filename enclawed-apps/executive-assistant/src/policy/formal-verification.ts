// Formal verification of the executive assistant against its own manifest.
//
// The app declares what it may do in skill.manifest.json. Setup (install and
// every update) produces a formal-verification bundle proving the app's code
// stays inside that declaration; this module re-checks the bundle at every
// boot. The bundle is a cache, not a trust source: each method is re-run here
// and the result must reproduce. What that catches is a change in what the
// code CAN DO -- a new capability reached since setup, or a manifest that no
// longer describes the code -- before the first action rather than after.
// It is not a byte-level integrity check: an edit that reaches no new
// capability verifies unchanged, and that is right. Byte integrity is the job
// of module signing and the audit chain.
//
// The verified implementation lives once, in enclawed/src/skill-formal-*.mjs,
// and both the installer and this module load that same file. A TypeScript
// copy would be a second implementation to keep in step, and the thing being
// verified is exactly that nothing drifts. The import is STATIC on purpose:
// Method A treats a dynamic import() as a reflective construct it cannot
// analyse, and one such file taints the whole app to TOP -- which is to say
// the module enforcing formal verification would itself make the app
// unverifiable.
//
// On a mismatch the app still starts, admitted at DECLARED rather than FORMAL,
// and says why. It never claims a level it did not just re-derive.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type FormalBundle,
  readFormalBundle,
  verifyFormalBundle,
} from "../../../../enclawed/src/skill-formal-bundle.mjs";

const APP_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** The code the proofs are about: the app's own source tree. */
export const APP_SRC_DIR = join(APP_DIR, "src");
export const APP_MANIFEST_PATH = join(APP_DIR, "skill.manifest.json");

export type AppManifestJson = Readonly<{
  v: 1;
  id: string;
  version: number;
  caps: ReadonlyArray<string>;
  label: Readonly<{
    level: number;
    compartments: ReadonlyArray<string>;
    releasability: ReadonlyArray<string>;
  }>;
  signer: string;
}>;

export type FormalVerdict = Readonly<{
  /** The level this boot re-derived. Never taken from the bundle's own claim. */
  level: "formal" | "declared";
  reasons: ReadonlyArray<string>;
  bundleDir: string;
}>;

/** Where setup writes the bundle: beside the audit log, never in the clone. */
export function formalBundleDir(stateDir: string): string {
  return join(stateDir, "formal");
}

export function readAppManifest(): AppManifestJson {
  return JSON.parse(readFileSync(APP_MANIFEST_PATH, "utf8")) as AppManifestJson;
}

/**
 * Re-derive the app's verification level from the bundle setup produced.
 * Missing or unreadable evidence is not an error: the app runs at DECLARED
 * and the reason says setup has to be re-run.
 */
export function verifyAppAtBoot(stateDir: string): FormalVerdict {
  const bundleDir = formalBundleDir(stateDir);
  if (!existsSync(join(bundleDir, "manifest.attest.json"))) {
    return {
      level: "declared",
      reasons: [`no formal-verification bundle at ${bundleDir}; re-run setup (Update-EnclawedApp)`],
      bundleDir,
    };
  }
  let bundle: FormalBundle;
  try {
    bundle = readFormalBundle(bundleDir);
  } catch (err) {
    return {
      level: "declared",
      reasons: [`formal-verification bundle unreadable: ${(err as Error).message}`],
      bundleDir,
    };
  }
  const verdict = verifyFormalBundle({
    skillDir: APP_SRC_DIR,
    manifest: readAppManifest(),
    bundle,
  });
  return {
    level: verdict.admit ? "formal" : "declared",
    reasons: verdict.reasons,
    bundleDir,
  };
}
