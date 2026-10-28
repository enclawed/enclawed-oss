// Every reference app that declares a skill manifest must be formally
// contained in it.
//
// Setup refuses to start an app that is not (enclawed-apps/install.mjs,
// runFormalVerificationSetup), so without this test the first place a
// containment break shows up is an operator's failed update. It caught the
// original one: three web tools made network requests while telling the gate
// they were local file reads, so the audit log misdescribed outbound traffic.

import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  produceFormalBundle,
  readFormalBundle,
  verifyFormalBundle,
  writeFormalBundle,
} from "../src/skill-formal-bundle.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const APPS_DIR = join(REPO_ROOT, "enclawed-apps");

const apps = readdirSync(APPS_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(join(APPS_DIR, d.name, "skill.manifest.json")))
  .map((d) => d.name);

test("at least one app ships a skill manifest", () => {
  // Guards the loop below from passing vacuously if the manifest is renamed.
  assert.ok(apps.includes("executive-assistant"), `apps with manifests: ${apps.join(", ")}`);
});

for (const app of apps) {
  const appDir = join(APPS_DIR, app);
  const manifest = JSON.parse(readFileSync(join(appDir, "skill.manifest.json"), "utf8"));
  const skillDir = join(appDir, "src");

  test(`${app}: code is contained in its declared capabilities`, () => {
    const bundle = produceFormalBundle({ skillDir, manifest, bound: 8 });
    const a = bundle.evidence.static;
    const top = Object.entries(a.perScript)
      .filter(([, r]) => r.top)
      .map(([f, r]) => `${f}: ${r.reason}`);
    assert.deepEqual(top, [], "files the analyser cannot reason about taint the whole app");
    assert.deepEqual(a.escapingCapabilities, [], "capabilities reached but not declared");
    assert.equal(bundle.evidence.types.contained, true, "Method B");
    assert.equal(bundle.evidence.smt_unsat.contained, true, "Method C");
    assert.equal(bundle.attestation.contained, true);
  });

  test(`${app}: evidence written by setup re-verifies at FORMAL`, () => {
    const dir = mkdtempSync(join(tmpdir(), `formal-${app}-`));
    try {
      writeFormalBundle(produceFormalBundle({ skillDir, manifest, bound: 8 }), dir);
      const v = verifyFormalBundle({ skillDir, manifest, bundle: readFormalBundle(dir) });
      assert.equal(v.verificationLevel, "formal", v.reasons.join("; "));
      // Locally produced evidence is unsigned; the runtime re-derives every
      // proof, so that is the only note a clean bundle may carry.
      assert.deepEqual(v.reasons, ["attestation-unsigned-warning-only"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test(`${app}: every dispatch site uses the manifest's skill id`, () => {
    // The gate looks a call's skill up by id; a tool dispatching under any
    // other id is simply denied, and would be silently outside the proof.
    const ids = new Set();
    const walk = (dir) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) {
          walk(p);
        } else if (e.name.endsWith(".ts")) {
          for (const m of readFileSync(p, "utf8").matchAll(/_SKILL_ID\s*=\s*"([^"]+)"/g)) {
            ids.add(m[1]);
          }
        }
      }
    };
    walk(skillDir);
    assert.deepEqual([...ids], [manifest.id]);
  });
}
