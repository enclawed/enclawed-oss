#!/usr/bin/env node
// The one way to publish enclawed to npm:
//
//   node scripts/release-npm.mjs           # check, publish, verify
//   node scripts/release-npm.mjs --check   # steps 1-5 only; a later run of this
//                                          # commit reuses the tarball they passed
//
// It packs the release tarball once, runs every release gate on that file,
// publishes that same file, and then checks what the real registry serves.
//
// Publishing the tarball file (not the folder) is what keeps the registry
// metadata right: `npm publish` from the folder uploads the dependency list it
// read before `prepack` rewrote package.json (npm 9 and 11 alike), so the
// registry lacked the bundled plugins' dependencies and `npm install -g
// enclawed@2.0.1` failed. Publishing a tarball uploads the package.json inside
// it. A plain `npm publish` from the folder is refused (prepublishOnly).
//
// Steps, each of which stops the release on failure:
//   1. the tree: the enclawed-oss package, on main, clean, HEAD pushed to
//      origin/main, and this version not yet on the registry;
//   2. `npm pack` (prepack builds, audits the consumer tree and writes the
//      shrinkwrap) into a release directory kept under the temp directory;
//   3. post-bundle smoke --strict on the tarball;
//   4. live-turn smoke on the tarball (real agent turns against local Ollama);
//   5. consumer installs from a stand-in registry the tarball is published to
//      with npm 9 and npm 11: registry metadata equals the tarball's
//      package.json; project, global and nested global installs; audit 0; no
//      deprecation warning;
//   6. `npm publish <tarball> --access public --tag latest` (your npm login);
//   7. once the registry serves the version: its shasum equals the tarball's,
//      and step 5 runs again against the real registry.
// A rerun after a failed publish (for example a login that timed out) reuses
// the tarball whose gates already passed and goes straight to step 6.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

function say(msg) {
  console.error(`[release-npm] ${msg}`);
}

function fail(msg) {
  say(`STOP: ${msg}`);
  process.exit(1);
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: "inherit", ...opts });
  return r.status === 0;
}

function capture(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: "utf8" });
  return { ok: r.status === 0, out: (r.stdout ?? "").trim(), err: (r.stderr ?? "").trim() };
}

function step(label, fn) {
  say(label);
  const t0 = Date.now();
  if (!fn()) {
    fail(`${label} failed`);
  }
  say(`${label}: ok (${Math.round((Date.now() - t0) / 1000)}s)`);
}

const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
const version = pkg.version;
const CHECK_ONLY = process.argv.includes("--check");
const releaseDir = join(tmpdir(), `enclawed-release-${version}`);
const marker = join(releaseDir, "gates-passed");

// 1. The tree.
step("tree: enclawed-oss package, main, clean, pushed", () => {
  if (!run(process.execPath, ["scripts/check-publish-tree.mjs"])) {
    return false;
  }
  const branch = capture("git", ["branch", "--show-current"]).out;
  if (branch !== "main") {
    fail(`on branch ${branch || "(detached)"}; release from main`);
  }
  if (capture("git", ["status", "--porcelain"]).out) {
    fail("the working tree has changes; commit or restore them first");
  }
  capture("git", ["fetch", "-q", "origin", "main"]);
  const head = capture("git", ["rev-parse", "HEAD"]).out;
  const remote = capture("git", ["rev-parse", "origin/main"]).out;
  if (head !== remote) {
    if (!CHECK_ONLY) {
      fail(`HEAD ${head.slice(0, 9)} is not origin/main ${remote.slice(0, 9)}; push main first`);
    }
    say(
      `note: HEAD ${head.slice(0, 9)} is not origin/main ${remote.slice(0, 9)}; push main before publishing`,
    );
  }
  const seen = capture(npm, ["view", `enclawed@${version}`, "version"]);
  if (seen.ok && seen.out === version) {
    fail(`enclawed@${version} is already on the registry; versions cannot be republished`);
  }
  return true;
});

const head = capture("git", ["rev-parse", "HEAD"]).out;
let tarball = null;
if (existsSync(marker)) {
  const m = JSON.parse(readFileSync(marker, "utf8"));
  const t = join(releaseDir, m.file ?? "");
  if (m.commit === head && existsSync(t) && sha1(t) === m.sha1) {
    tarball = t;
    say(`reusing ${t} (gates passed for ${head.slice(0, 9)}, sha1 ${m.sha1})`);
  }
}

if (!tarball) {
  // 2. Pack once; everything below runs on this file.
  step("npm pack (prepack builds and audits)", () => {
    rmSync(releaseDir, { recursive: true, force: true });
    mkdirSync(releaseDir, { recursive: true });
    if (!run(npm, ["pack", "--pack-destination", releaseDir])) {
      return false;
    }
    const file = readdirSync(releaseDir).find((f) => f.endsWith(".tgz"));
    if (!file) {
      return false;
    }
    tarball = join(releaseDir, file);
    // prepack rebuilds dist; the committed build stays the tree's state.
    run("git", ["restore", "--", "dist"]);
    run("git", ["clean", "-fdq", "--", "dist"]);
    return capture("git", ["status", "--porcelain"]).out === "";
  });
  step("post-bundle smoke --strict", () =>
    run(process.execPath, ["scripts/ci/post-bundle-smoke.mjs", "--strict", "--tarball", tarball]),
  );
  step("live-turn smoke (local Ollama)", () =>
    run("bash", ["scripts/ci/live-turn-smoke.sh", "--tarball", tarball]),
  );
  step("consumer installs through a stand-in registry (npm 9 and 11)", () =>
    run(process.execPath, ["scripts/ci/consumer-install-check.mjs", "--tarball", tarball]),
  );
  writeFileSync(
    marker,
    `${JSON.stringify({ commit: head, file: tarball.split(/[\\/]/u).pop(), sha1: sha1(tarball) })}\n`,
  );
}

if (CHECK_ONLY) {
  say(`every gate passed on ${tarball} (sha1 ${sha1(tarball)}); nothing was published`);
  process.exit(0);
}

// 6. Publish exactly the tested file.
const localSha1 = sha1(tarball);
say(`publishing ${tarball} (sha1 ${localSha1}); approve the npm login when asked`);
if (!run(npm, ["publish", tarball, "--access", "public", "--tag", "latest"])) {
  fail(
    "npm publish failed; nothing changed on the registry. Rerun this script to retry the publish (the tested tarball is reused).",
  );
}

// 7. What the real registry serves.
step("registry serves the published file", () => {
  for (let i = 0; i < 40; i++) {
    const r = capture(npm, ["view", `enclawed@${version}`, "dist.shasum"]);
    if (r.ok && r.out) {
      if (r.out !== localSha1) {
        fail(`the registry serves sha1 ${r.out}, the tested tarball is ${localSha1}`);
      }
      return true;
    }
    spawnSync("sleep", ["15"]);
  }
  fail(
    "the registry did not list the version within 10 minutes; rerun the live check later: node scripts/ci/consumer-install-check.mjs --live " +
      version,
  );
  return false;
});
step("consumer installs from the real registry (npm 9 and 11)", () =>
  run(process.execPath, ["scripts/ci/consumer-install-check.mjs", "--live", version]),
);
rmSync(releaseDir, { recursive: true, force: true });
say(`enclawed@${version} is published and verified from the registry`);

function sha1(file) {
  return createHash("sha1").update(readFileSync(file)).digest("hex");
}
