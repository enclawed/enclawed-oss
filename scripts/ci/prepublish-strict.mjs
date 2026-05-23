#!/usr/bin/env node
/**
 * prepublish-strict.mjs
 *
 * Orchestrates the production-readiness gates that must pass before
 * `npm publish` is allowed to upload the tarball:
 *
 *   1. Tree-identity guard (`scripts/check-publish-tree.mjs`) — refuses
 *      to publish from the wrong git remote / branch / etc.
 *   2. Build freshness — runs `pnpm build` only if `dist/index.js` (or
 *      its .mjs sibling) is missing. Publishing a stale dist would
 *      defeat the smoke gate.
 *   3. Pack the candidate tarball via `npm pack --pack-destination=<tmp>`
 *      so we have a real tarball to point the smoke at.
 *   4. Post-bundle smoke `--strict --tarball <tmp.tgz>` — installs the
 *      tarball into a clean temp workspace and runs the doctor pass.
 *      `--strict` means any non-allowlisted plugin failure or
 *      diagnostic kills the publish.
 *
 * Any non-zero exit aborts the chain; the package is never uploaded.
 *
 * Intentionally a standalone Node script (not chained inline in
 * package.json) so it can grow without bloating the manifest. The
 * `prepublishOnly` package script invokes this script directly.
 *
 * Allowlist policy: today we run the smoke with NO --allow-plugin
 * entries (G1 + drift-baseline lock have driven the allowlist to 0).
 * If a peer-dep-floor allowlist re-appears, it must be added both here
 * AND in `.github/workflows/bundle-loadability.yml` so local and CI
 * gates stay in lock-step.
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(__filename), "..", "..");

function step(label, fn) {
  console.error(`[prepublish-strict] ${label}`);
  const t0 = Date.now();
  fn();
  console.error(`[prepublish-strict] ${label}: ok (${Date.now() - t0}ms)`);
}

function runOrExit(command, args, opts = {}) {
  const result = spawnSync(command, args, {
    cwd: REPO_ROOT,
    stdio: "inherit",
    env: process.env,
    ...opts,
  });
  if (result.status !== 0) {
    console.error(
      `[prepublish-strict] command failed (exit ${result.status}): ${command} ${args.join(" ")}`,
    );
    process.exit(result.status ?? 1);
  }
}

function findDistEntryFresh() {
  const dist = join(REPO_ROOT, "dist");
  if (!existsSync(dist)) {
    return false;
  }
  const candidates = ["index.js", "index.mjs"];
  return candidates.some((name) => existsSync(join(dist, name)));
}

function resolvePnpmCommand() {
  return process.platform === "win32" ? "pnpm.cmd" : "pnpm";
}

function resolveNpmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function packToTemp() {
  const dest = mkdtempSync(join(tmpdir(), "enclawed-prepublish-pack-"));
  const before = new Set(readdirSync(dest));
  // When this script runs as the `prepublishOnly` hook of `npm publish
  // --dry-run`, npm exports `npm_config_dry_run=true`. The nested `npm pack`
  // below would inherit it and then compute-but-not-write the tarball, leaving
  // `dest` empty and failing the gate spuriously. We always need a real tarball
  // here to point the smoke at; it lands in a temp dir and is removed after the
  // smoke. Strip any inherited dry-run flag for this child only — the outer
  // `npm publish` keeps its own dry-run state, so this never causes an upload.
  const packEnv = { ...process.env };
  delete packEnv.npm_config_dry_run;
  delete packEnv["npm_config_dry-run"];
  runOrExit(resolveNpmCommand(), ["pack", "--silent", "--pack-destination", dest], {
    env: packEnv,
  });
  const after = readdirSync(dest);
  const tarball = after.find((name) => !before.has(name) && name.endsWith(".tgz"));
  if (!tarball) {
    console.error(
      `[prepublish-strict] npm pack did not produce a tarball in ${dest}. Contents: ${after.join(", ")}`,
    );
    process.exit(1);
  }
  return { dir: dest, tarball: join(dest, tarball) };
}

function main() {
  let packed = null;
  try {
    step("check-publish-tree (tree-identity guard)", () => {
      runOrExit(process.execPath, ["scripts/check-publish-tree.mjs"]);
    });

    step("build (only if dist/ is missing)", () => {
      if (findDistEntryFresh()) {
        console.error("[prepublish-strict] dist/ already present — skipping rebuild");
        return;
      }
      runOrExit(resolvePnpmCommand(), ["build"]);
    });

    step("npm pack to temp", () => {
      packed = packToTemp();
      console.error(`[prepublish-strict] packed tarball at ${packed.tarball}`);
    });

    step("post-bundle smoke --strict --tarball <temp>", () => {
      runOrExit(process.execPath, [
        "scripts/ci/post-bundle-smoke.mjs",
        "--strict",
        "--tarball",
        packed.tarball,
      ]);
    });
  } finally {
    if (packed?.dir) {
      try {
        rmSync(packed.dir, { recursive: true, force: true });
      } catch {
        // best-effort cleanup
      }
    }
  }
  console.error("[prepublish-strict] all gates passed; publish may proceed");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main();
}
