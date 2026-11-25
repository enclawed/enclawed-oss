#!/usr/bin/env node
// Pinned, integrity-checked dependencies for the published tarball.
//
//   node scripts/npm-shrinkwrap.mjs prepack   (run by the `prepack` script)
//   node scripts/npm-shrinkwrap.mjs postpack  (run by the `postpack` script)
//   node scripts/npm-shrinkwrap.mjs check     (validate the current files)
//
// prepack:
//   1. backs up package.json to package.json.prepack-orig;
//   2. writes the publish manifest: devDependencies dropped, and the runtime
//      dependencies replaced by exact pins for the root package plus every
//      bundled plugin under dist/extensions/ (see
//      scripts/lib/publish-dependency-pins.mjs), so the tarball install has
//      nothing left for the postinstall to fetch;
//   3. resolves that manifest with `npm install --package-lock-only
//      --ignore-scripts` in a scratch directory (network at PACK time only)
//      and ships the result as npm-shrinkwrap.json, which npm honors on
//      install and whose sha512 integrity hashes npm verifies for every
//      package it downloads;
//   4. audits that resolved tree with `npm audit --omit=dev` -- the tree exactly
//      as consumers install it, with no overrides (npm never applies a
//      dependency's overrides) -- and fails the pack on any finding of any
//      severity, or when the audit cannot run; also refuses any deprecated
//      package and any OpenTelemetry package other than the inert API;
//   5. validates the shrinkwrap and fails the pack on any missing entry,
//      non-exact version or missing integrity.
// postpack restores package.json and removes the generated shrinkwrap.

import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  computePublishDependencyPins,
  validateShrinkwrap,
} from "./lib/publish-dependency-pins.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const SHRINKWRAP_FILE = "npm-shrinkwrap.json";
export const MANIFEST_BACKUP_FILE = "package.json.prepack-orig";

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

/** Plugin ids whose dist directory the `files` list excludes from the tarball. */
export function excludedDistPluginIds(files = []) {
  const ids = new Set();
  for (const entry of files) {
    const m = /^!dist\/extensions\/([^/*]+)\/\*\*$/u.exec(entry);
    if (m) {
      ids.add(m[1]);
    }
  }
  return ids;
}

export function collectShippedPlugins(repoRoot, rootPackageJson) {
  const distDir = join(repoRoot, "dist", "extensions");
  if (!existsSync(distDir)) {
    throw new Error("dist/extensions is missing; build before packing");
  }
  const excluded = excludedDistPluginIds(rootPackageJson.files);
  const plugins = [];
  for (const entry of readdirSync(distDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || excluded.has(entry.name)) {
      continue;
    }
    const packageJsonPath = join(distDir, entry.name, "package.json");
    if (!existsSync(packageJsonPath)) {
      continue;
    }
    plugins.push({
      id: entry.name,
      importer: `extensions/${entry.name}`,
      packageJson: readJson(packageJsonPath),
    });
  }
  return plugins;
}

/**
 * Dependencies the published package declares itself, as npm aliases to
 * Enclawed's own replacement packages, because the registry package of that
 * name is deprecated and something in the tree we cannot change requires it.
 * Declared at the top level, the alias is hoisted next to its dependents and
 * satisfies their range, so npm never fetches the deprecated package -- in a
 * project install, a global install and as a nested dependency alike (a
 * bundled copy would stay inside node_modules/enclawed, out of reach of the
 * hoisted dependents).
 *
 * node-domexception@1.0.0: every google-auth-library release reaches it through
 * gaxios -> node-fetch@3 -> fetch-blob (google-auth-library is a hard
 * dependency of @google/genai, which the agent runtime pins). The registry
 * package is deprecated ("Use your platform's native DOMException instead");
 * @enclawed/node-domexception (packages/node-domexception) is exactly that:
 * `module.exports = globalThis.DOMException`.
 */
export const ALIASED_REPLACEMENTS = Object.freeze({
  "node-domexception": "npm:@enclawed/node-domexception@1.0.0",
});

export function buildPublishManifest(rootPackageJson, pins) {
  const manifest = { ...rootPackageJson };
  delete manifest.devDependencies;
  // npm applies `overrides` only from the root project of an install, so a consumer
  // installing this package never receives them. Shipping none keeps the resolution
  // below identical to what every consumer gets.
  delete manifest.overrides;
  manifest.dependencies = { ...pins.dependencies };
  for (const [name, spec] of Object.entries(ALIASED_REPLACEMENTS)) {
    manifest.dependencies[name] = spec;
  }
  manifest.dependencies = Object.fromEntries(
    Object.entries(manifest.dependencies).toSorted(([a], [b]) => a.localeCompare(b)),
  );
  if (Object.keys(pins.optionalDependencies).length > 0) {
    manifest.optionalDependencies = pins.optionalDependencies;
  } else {
    delete manifest.optionalDependencies;
  }
  return manifest;
}

/**
 * The publish manifest for the tree as it stands: the root package's runtime
 * dependencies plus every shipped bundled plugin's, pinned from pnpm-lock.yaml.
 */
export function computePublishManifest(repoRoot = REPO_ROOT) {
  const rootPackageJson = readJson(join(repoRoot, "package.json"));
  const pins = computePublishDependencyPins({
    rootPackageJson,
    lockText: readFileSync(join(repoRoot, "pnpm-lock.yaml"), "utf8"),
    plugins: collectShippedPlugins(repoRoot, rootPackageJson),
  });
  if (pins.errors.length > 0) {
    throw new Error(`cannot pin the published dependencies:\n  ${pins.errors.join("\n  ")}`);
  }
  return { manifest: buildPublishManifest(rootPackageJson, pins), warnings: pins.warnings };
}

/**
 * `npm audit --omit=dev` of a resolved scratch tree: the tree exactly as consumers
 * install it. Returns { status: "clean" | "findings" | "unavailable", ... }; callers
 * decide, and everything that ships treats anything but "clean" as a refusal.
 */
export function auditResolvedTree(npm, scratch) {
  const result = spawnSync(npm.cmd, [...npm.args, "audit", "--omit=dev", "--json"], {
    cwd: scratch,
    encoding: "utf8",
    shell: process.platform === "win32",
    maxBuffer: 64 * 1024 * 1024,
  });
  let report;
  try {
    report = JSON.parse(result.stdout);
  } catch {
    return {
      status: "unavailable",
      detail: `npm audit produced no parseable report (exit ${String(result.status)})`,
    };
  }
  const totals = report?.metadata?.vulnerabilities;
  if (!totals || typeof totals.total !== "number") {
    return { status: "unavailable", detail: "npm audit report has no vulnerability totals" };
  }
  if (totals.total > 0) {
    const findings = Object.values(report.vulnerabilities ?? {})
      .map((v) => `${String(v.severity)} ${String(v.name)} ${String(v.range)}`)
      .toSorted();
    return { status: "findings", totals, findings };
  }
  return { status: "clean", totals };
}

/**
 * OpenTelemetry may ship only as `@opentelemetry/api`: an inert API facade that
 * the Microsoft Teams SDK (@microsoft/teams.api / teams.apps >= 2.1.0) depends
 * on and that does nothing without an SDK. No OpenTelemetry SDK, exporter,
 * instrumentation or plugin may reach the shipped tree. Returns the offending
 * package names (sorted, unique).
 */
export function findForbiddenTelemetryPackages(lock) {
  const names = new Set();
  for (const [path, entry] of Object.entries(lock?.packages ?? {})) {
    if (path === "") {
      continue;
    }
    const name =
      entry?.name ?? path.slice(path.lastIndexOf("node_modules/") + "node_modules/".length);
    if (name.startsWith("@opentelemetry/") && name !== "@opentelemetry/api") {
      names.add(name);
    }
  }
  return [...names].toSorted((a, b) => a.localeCompare(b));
}

/** Throw when the shipped tree carries an OpenTelemetry package other than the inert API. */
export function assertNoTelemetryPackages(lock) {
  const forbidden = findForbiddenTelemetryPackages(lock);
  if (forbidden.length > 0) {
    throw new Error(
      `the shipped tree carries OpenTelemetry packages other than the inert @opentelemetry/api: ${forbidden.join(", ")}`,
    );
  }
}

function lockEntryName(path, entry) {
  return entry?.name ?? path.slice(path.lastIndexOf("node_modules/") + "node_modules/".length);
}

/**
 * Packages in the resolved tree that their publisher deprecated. npm records the
 * registry's deprecation message on each lockfile entry it resolves (`deprecated`),
 * so the lockfile is authoritative; a lockfile without a `packages` map cannot be
 * judged and throws (fail closed). There are no exceptions. Returns
 * "name@version: message" (sorted, unique).
 */
export function findDeprecatedPackages(lock) {
  if (!lock || typeof lock.packages !== "object" || lock.packages === null) {
    throw new Error("the resolved lockfile has no packages map; deprecation status is unknown");
  }
  const found = new Set();
  for (const [path, entry] of Object.entries(lock.packages)) {
    if (path === "" || typeof entry?.deprecated !== "string" || entry.deprecated.length === 0) {
      continue;
    }
    found.add(`${lockEntryName(path, entry)}@${String(entry.version)}: ${entry.deprecated}`);
  }
  return [...found].toSorted((a, b) => a.localeCompare(b));
}

/** Throw when the shipped tree carries any deprecated package. */
export function assertNoDeprecatedPackages(lock) {
  const deprecated = findDeprecatedPackages(lock);
  if (deprecated.length > 0) {
    throw new Error(
      `the shipped tree carries ${deprecated.length} deprecated package(s):\n  ${deprecated.join("\n  ")}`,
    );
  }
}

/** Throw unless an audit result is clean: nothing unaudited or vulnerable ships. */
export function assertAuditClean(audit) {
  if (audit.status === "clean") {
    return;
  }
  if (audit.status === "unavailable") {
    throw new Error(
      `audit of the shipped tree could not run (${audit.detail}); nothing is known, so the pack stops`,
    );
  }
  throw new Error(
    `audit of the shipped tree: ${String(audit.totals.total)} vulnerable package(s) ${JSON.stringify(audit.totals)}:\n  ${audit.findings.join("\n  ")}`,
  );
}

/**
 * The npm that resolves and audits the shipped tree: the one running this pack
 * (npm_execpath), else `npm` on PATH.
 */
export function packNpm(env = process.env) {
  const execPath = env.npm_execpath;
  return execPath?.endsWith("npm-cli.js")
    ? { cmd: process.execPath, args: [execPath] }
    : { cmd: process.platform === "win32" ? "npm.cmd" : "npm", args: [] };
}

/** The environment for the scratch resolution: the caller's, minus npm settings that would change it. */
export function consumerResolutionEnv(env) {
  const out = { ...env, npm_config_dry_run: "false", npm_config_global: "false" };
  for (const key of Object.keys(out)) {
    if (/^npm_config_(omit|include|overrides|legacy_peer_deps|force)$/iu.test(key)) {
      delete out[key];
    }
  }
  return out;
}

/**
 * Resolve `manifest` with plain npm in a scratch directory -- no overrides, nothing
 * from the pnpm workspace -- exactly as a consumer's npm resolves the package, then
 * audit that tree. Returns { lock, audit }. Throws when npm cannot resolve.
 */
export function resolveConsumerTree(manifest, npm = packNpm()) {
  const scratch = mkdtempSync(join(tmpdir(), "enclawed-shrinkwrap-"));
  try {
    const stub = {
      name: manifest.name,
      version: manifest.version,
      dependencies: manifest.dependencies,
      ...(manifest.optionalDependencies
        ? { optionalDependencies: manifest.optionalDependencies }
        : {}),
    };
    writeFileSync(join(scratch, "package.json"), `${JSON.stringify(stub, null, 2)}\n`);
    const result = spawnSync(
      npm.cmd,
      [
        ...npm.args,
        "install",
        "--package-lock-only",
        "--ignore-scripts",
        "--no-audit",
        "--no-fund",
      ],
      {
        cwd: scratch,
        stdio: ["ignore", "inherit", "inherit"],
        shell: process.platform === "win32",
        // npm passes its own config to lifecycle scripts as npm_config_* variables. Under
        // `npm pack --dry-run` that includes dry-run=true, which would make this install
        // write no lock at all; the lock is always needed here. Inherited settings that
        // change resolution (global, omit, legacy-peer-deps, ...) are dropped so the
        // tree is the one a consumer's default npm resolves.
        env: consumerResolutionEnv(process.env),
      },
    );
    if (result.status !== 0) {
      throw new Error(
        `npm could not resolve the pinned dependency set (exit ${String(result.status)})`,
      );
    }
    const lock = readJson(join(scratch, "package-lock.json"));
    // The root entry describes the stub; make it describe the real package.
    lock.name = manifest.name;
    lock.version = manifest.version;
    if (lock.packages?.[""]) {
      lock.packages[""] = { ...lock.packages[""], name: manifest.name, version: manifest.version };
    }
    fillMissingIntegrity(lock, (resolved) => registryIntegrity(npm, resolved, scratch));
    return { lock, audit: auditResolvedTree(npm, scratch) };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

export function resolveShrinkwrap(manifest) {
  const { lock, audit } = resolveConsumerTree(manifest);
  assertAuditClean(audit);
  assertNoTelemetryPackages(lock);
  assertNoDeprecatedPackages(lock);
  console.error("[shrinkwrap] audit of the shipped tree: 0 known vulnerabilities");
  return lock;
}

/**
 * npm sometimes writes an aliased package nested under another package
 * without its integrity. Copy the hash from another entry for the same
 * tarball URL; otherwise ask the registry (pack time only). An entry that
 * still has no integrity fails validation.
 */
export function fillMissingIntegrity(lock, lookup) {
  const byResolved = new Map();
  for (const entry of Object.values(lock.packages ?? {})) {
    if (entry?.resolved && entry.integrity) {
      byResolved.set(entry.resolved, entry.integrity);
    }
  }
  for (const [path, entry] of Object.entries(lock.packages ?? {})) {
    if (path === "" || entry?.link === true || entry?.integrity || !entry?.resolved) {
      continue;
    }
    const integrity = byResolved.get(entry.resolved) ?? lookup?.(entry.resolved) ?? null;
    if (integrity) {
      entry.integrity = integrity;
    }
  }
  return lock;
}

function registryIntegrity(npm, resolved, cwd) {
  // https://registry.npmjs.org/<name>/-/<file>-<version>.tgz
  const m = /^https:\/\/registry\.npmjs\.org\/(.+)\/-\/[^/]+-(\d[^/]*)\.tgz$/u.exec(resolved);
  if (!m) {
    return null;
  }
  const result = spawnSync(npm.cmd, [...npm.args, "view", `${m[1]}@${m[2]}`, "dist.integrity"], {
    cwd,
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  const out = result.status === 0 ? result.stdout.trim() : "";
  return out.startsWith("sha512-") ? out : null;
}

export function checkShrinkwrapFiles(repoRoot = REPO_ROOT) {
  const shrinkwrapPath = join(repoRoot, SHRINKWRAP_FILE);
  if (!existsSync(shrinkwrapPath)) {
    return [`${SHRINKWRAP_FILE} is missing`];
  }
  return validateShrinkwrap(readJson(join(repoRoot, "package.json")), readJson(shrinkwrapPath));
}

export function prepack(repoRoot = REPO_ROOT) {
  const manifestPath = join(repoRoot, "package.json");
  const backupPath = join(repoRoot, MANIFEST_BACKUP_FILE);
  if (existsSync(backupPath)) {
    throw new Error(
      `${MANIFEST_BACKUP_FILE} exists: a previous pack did not finish. Restore it with ` +
        "`node scripts/npm-shrinkwrap.mjs postpack` and retry.",
    );
  }
  const { manifest, warnings } = computePublishManifest(repoRoot);
  for (const warning of warnings) {
    console.error(`[shrinkwrap] note: ${warning}`);
  }
  const shrinkwrap = resolveShrinkwrap(manifest);
  const errors = validateShrinkwrap(manifest, shrinkwrap);
  if (errors.length > 0) {
    throw new Error(`generated ${SHRINKWRAP_FILE} is incomplete:\n  ${errors.join("\n  ")}`);
  }
  copyFileSync(manifestPath, backupPath);
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(join(repoRoot, SHRINKWRAP_FILE), `${JSON.stringify(shrinkwrap, null, 2)}\n`);
  console.error(
    `[shrinkwrap] pinned ${Object.keys(manifest.dependencies).length} dependencies; ` +
      `${Object.keys(shrinkwrap.packages ?? {}).length - 1} packages with integrity in ${SHRINKWRAP_FILE}`,
  );
}

export function postpack(repoRoot = REPO_ROOT) {
  const backupPath = join(repoRoot, MANIFEST_BACKUP_FILE);
  if (existsSync(backupPath)) {
    renameSync(backupPath, join(repoRoot, "package.json"));
  }
  rmSync(join(repoRoot, SHRINKWRAP_FILE), { force: true });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const mode = process.argv[2];
  try {
    if (mode === "prepack") {
      prepack();
    } else if (mode === "postpack") {
      postpack();
    } else if (mode === "check") {
      const errors = checkShrinkwrapFiles();
      if (errors.length > 0) {
        throw new Error(errors.join("\n  "));
      }
      console.error(`[shrinkwrap] ${SHRINKWRAP_FILE} is complete`);
    } else {
      console.error("usage: node scripts/npm-shrinkwrap.mjs prepack|postpack|check");
      process.exit(2);
    }
  } catch (err) {
    console.error(`[shrinkwrap] ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}
