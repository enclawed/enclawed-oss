// enclawed adapter kit: MCP servers started through a package runner other
// than npx, measured by content (M2). Every runner below resolves its code at
// launch, so a definition starts only in an exact form whose content the
// signed record pins, and the launcher never runs the runner itself: it starts
// the measured tree (the runner never resolves anything).
//
//   npm exec / npm x           npm's npx cache, as for npx
//   pnpm dlx / pnpx            pnpm's dlx cache: pnpm-lock.yaml's integrity of
//                              the package, a digest of every locked package,
//                              the installed node_modules tree
//   bunx                       bun's bunx cache: bun.lock, the same way
//   yarn dlx                   yarn keeps no installed tree (its dlx project is
//                              removed after the run): the same release is
//                              installed through npx at pin time (no install
//                              scripts; yarnDlxInstallCommand), measured and
//                              started
//   uvx / uv tool run /        the tool environment the runner made (uv's
//   pipx run                   archive cache; pipx's own cache): every
//                              distribution's installed files against its
//                              RECORD hashes (and no unlisted file that Python
//                              would load), the environment's tree and
//                              interpreter. At pin time the integrity is the
//                              wheel hashes the index lists for NAME==VERSION
//                              and the wheels are checked against them and the
//                              installed RECORD; at launch the record's hashes
//                              stand (no index is read). `--from` / `--spec`
//                              with an exact version name the release
//   uv run                     a project run (./code-pins.ts): uv.lock must
//                              exist; the project tree (its .venv included) is
//                              pinned, synced to uv.lock, every distribution
//                              checked against RECORD; started directly
//   deno (local entry)         a lock file (deno.lock or --lock) is required,
//                              or remote imports switched off; its cached npm
//                              packages, remote and jsr modules are measured
//                              against the lock (./python-env.ts), and deno
//                              runs from that cache only
//   docker / podman            by image digest (./mcp-package-pins.ts)

import fs from "node:fs";
import path from "node:path";
import { inflateRawSync } from "node:zlib";
import YAML from "yaml";
import type { McpServerDefinition } from "./contracts.js";
import {
  codeResolution,
  npxInstalls,
  pinnedCopy,
  pythonRunnerForm,
  type McpCodePin,
} from "./mcp-package-pins.js";
import {
  canonical,
  normName,
  parseRecord,
  readJson,
  sha256,
  sitePackagesIn,
  verifySitePackages,
} from "./python-env.js";
import type { RunnerCaches } from "./runner-config.js";
import { cachedSha256, treeDigest, type TreeHashCache } from "./tree-digest.js";

export { denoLockOf, denoLockedNpm, sitePackagesIn, verifySitePackages } from "./python-env.js";

export {
  pythonIndexUrls,
  runnerCacheDirs,
  parseIni,
  parseTomlStrings,
  type RunnerCaches,
} from "./runner-config.js";

/** What a measurement may use besides the caches. */
export type RunnerMeasureOptions = Readonly<{
  /** Pin time (Python runners): the index page and the downloaded wheels. */
  index?: PythonIndex | null;
  /** Launch time: the record's pin (a Python release's hashes come from it; no index is read). */
  pinned?: McpCodePin | null;
  /** The adapter's file-hash cache (./tree-digest.ts treeHashCache; refreshed at pin time). */
  hashCache?: TreeHashCache;
}>;

/** How the launcher starts the measured code instead of the runner. */
export type RunnerLaunch = Readonly<{
  dir: string;
  /** node: Node (the adapter's own); bun: the definition's bun; python: `interpreter`. */
  runtime: "node" | "bun" | "python";
  interpreter?: string;
  script: string;
  args: readonly string[];
  /** Variables the runner would have set for the program (uv run's VIRTUAL_ENV and PATH). */
  env?: Readonly<Record<string, string>>;
}>;

export type RunnerMeasurement =
  | Readonly<{ ok: true; pin: McpCodePin; launch: RunnerLaunch }>
  | Readonly<{
      ok: false;
      code:
        | "not-a-runner"
        | "unpinned-form"
        | "not-installed"
        | "inconsistent-copies"
        | "tree-changed"
        | "index-mismatch";
      reason: string;
    }>;

const runnerOf = (def: McpServerDefinition) =>
  typeof def.command === "string"
    ? (def.command.split(/[\\/]/).pop() ?? "").replace(/\.(cmd|exe|bat)$/i, "")
    : "";

const argsOf = (def: McpServerDefinition) => (def.args ?? []).map(String);

// ─── npm-registry runners ───────────────────────────────────────────────

/** The bin a package names for `name` (package.json `bin`), relative to the package. */
function npmBin(pkgDir: string, name: string): string | null {
  const bin = readJson(path.join(pkgDir, "package.json"))?.bin;
  if (typeof bin === "string") {
    return bin;
  }
  if (bin && typeof bin === "object" && !Array.isArray(bin)) {
    const b = bin as Record<string, unknown>;
    const keys = Object.keys(b);
    const short = name.replace(/^@[^/]+\//, "");
    const v = keys.length === 1 ? b[keys[0]] : Object.hasOwn(b, short) ? b[short] : null;
    return typeof v === "string" ? v : null;
  }
  return null;
}

type Install = Readonly<{
  dir: string;
  pkgDir: string;
  integrity: string;
  lockDigest: string;
  treeDigest: string;
  bin: string;
}>;

// pnpm's state files under node_modules record times and paths of the
// install, not code; Node never reads them.
const PNPM_STATE: ReadonlySet<string> = new Set([".modules.yaml", ".pnpm-workspace-state-v1.json"]);

function measuredInstall(
  dir: string,
  name: string,
  integrity: string,
  lockView: unknown,
  skipState = false,
  cache?: TreeHashCache,
): Install | null {
  let pkgDir: string;
  try {
    pkgDir = fs.realpathSync(path.join(dir, "node_modules", name));
  } catch {
    return null;
  }
  const bin = npmBin(pkgDir, name);
  // The bin must stay inside the package.
  if (!bin || path.relative(pkgDir, path.resolve(pkgDir, bin)).startsWith("..")) {
    return null;
  }
  let tree: string;
  try {
    tree = treeDigest(path.join(dir, "node_modules"), {
      cache,
      ...(skipState ? { skip: (rel: string) => PNPM_STATE.has(rel) } : {}),
    }).digest;
  } catch {
    return null;
  }
  return { dir, pkgDir, integrity, lockDigest: sha256(canonical(lockView)), treeDigest: tree, bin };
}

/** pnpm dlx installs of exactly name@version (each `dlx/<hash>/pkg`). */
export function pnpmDlxInstalls(
  name: string,
  version: string,
  cacheDir: string,
  cache?: TreeHashCache,
): Install[] {
  const root = path.join(cacheDir, "dlx");
  let hashes: string[];
  try {
    hashes = fs.readdirSync(root).toSorted();
  } catch {
    return [];
  }
  const out: Install[] = [];
  for (const h of hashes) {
    let dir: string;
    try {
      dir = fs.realpathSync(path.join(root, h, "pkg"));
    } catch {
      continue;
    }
    const deps = readJson(path.join(dir, "package.json"))?.dependencies as
      | Record<string, unknown>
      | undefined;
    // The runner saves the spec it was given; its lockfile says what was installed.
    if (!deps || typeof deps[name] !== "string") {
      continue;
    }
    let lock: Record<string, unknown>;
    try {
      lock = YAML.parse(fs.readFileSync(path.join(dir, "pnpm-lock.yaml"), "utf8")) as Record<
        string,
        unknown
      >;
    } catch {
      continue;
    }
    const pkgs = (lock?.packages ?? {}) as Record<
      string,
      { resolution?: { integrity?: unknown; tarball?: unknown } }
    >;
    const entry = pkgs[`${name}@${version}`];
    const importer = (
      lock.importers as
        | Record<string, { dependencies?: Record<string, { version?: unknown }> }>
        | undefined
    )?.["."];
    if (
      typeof entry?.resolution?.integrity !== "string" ||
      importer?.dependencies?.[name]?.version !== version
    ) {
      continue;
    }
    const view = Object.fromEntries(
      Object.entries(pkgs).map(([k, v]) => [
        k,
        { integrity: v?.resolution?.integrity ?? null, tarball: v?.resolution?.tarball ?? null },
      ]),
    );
    const m = measuredInstall(
      dir,
      name,
      entry.resolution.integrity,
      { snapshots: lock.snapshots ?? null, packages: view },
      true,
      cache,
    );
    if (m) {
      out.push(m);
    }
  }
  return out;
}

/** bunx installs of exactly name@version (bun's `.bunx-<uid>/<spec>`, or the older `<tmp>/bunx-<uid>-<spec>`). */
export function bunxInstalls(
  name: string,
  version: string,
  roots: readonly string[],
  uid: number,
  cache?: TreeHashCache,
): Install[] {
  const spec = `${name}@${version}`;
  const dirs = roots.flatMap((r) => [
    path.join(r, `.bunx-${uid}`, spec),
    path.join(r, `bunx-${uid}-${spec}`),
  ]);
  const out: Install[] = [];
  for (const dir of new Set(dirs)) {
    const deps = readJson(path.join(dir, "package.json"))?.dependencies as
      | Record<string, unknown>
      | undefined;
    // The runner saves the spec it was given; its lockfile says what was installed.
    if (!deps || typeof deps[name] !== "string") {
      continue;
    }
    const pkgs = readJson(path.join(dir, "bun.lock"), true)?.packages as
      | Record<string, unknown[]>
      | undefined;
    const entry = pkgs?.[name];
    if (!Array.isArray(entry) || entry[0] !== spec || typeof entry[3] !== "string") {
      continue;
    }
    const view = Object.fromEntries(
      Object.entries(pkgs ?? {}).map(([k, v]) => [
        k,
        Array.isArray(v) ? [v[0] ?? null, v[1] ?? null, v[3] ?? null] : null,
      ]),
    );
    const m = measuredInstall(dir, name, entry[3], view, false, cache);
    if (m) {
      out.push(m);
    }
  }
  return out;
}

function npmRunner(def: McpServerDefinition): "npx" | "pnpm" | "bun" | "yarn" | null {
  const cmd = runnerOf(def);
  const a = argsOf(def);
  if (cmd === "npx" || (cmd === "npm" && (a[0] === "exec" || a[0] === "x"))) {
    return "npx";
  }
  if (cmd === "pnpx" || (cmd === "pnpm" && a[0] === "dlx")) {
    return "pnpm";
  }
  if (cmd === "bunx" || (cmd === "bun" && a[0] === "x")) {
    return "bun";
  }
  return cmd === "yarn" && a[0] === "dlx" ? "yarn" : null;
}

const NPM_NAME = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/;

/** The first cache (in the runner's precedence) holding the release, each install measured. */
function firstInstalls(dirs: readonly string[], find: (dir: string) => Install[]): Install[] {
  for (const d of dirs) {
    const found = find(d);
    if (found.length > 0) {
      return found;
    }
  }
  return [];
}

function measureNpm(
  def: McpServerDefinition,
  caches: RunnerCaches,
  o: RunnerMeasureOptions,
): RunnerMeasurement {
  const runner = npmRunner(def);
  const r = codeResolution(def);
  if (!runner || r.kind !== "pinned-form" || r.expected.kind !== "npm") {
    return {
      ok: false,
      code: "unpinned-form",
      reason:
        r.kind === "unpinned"
          ? `${r.reason}; to pin it, ${r.howToPin}`
          : "the runner names no exact package",
    };
  }
  const { name, version } = r.expected;
  if (!NPM_NAME.test(name)) {
    return {
      ok: false,
      code: "unpinned-form",
      reason: `${JSON.stringify(name)} is not a registry package name`,
    };
  }
  const cache = o.hashCache;
  const found: Install[] =
    runner === "pnpm"
      ? firstInstalls(caches.pnpm, (d) => pnpmDlxInstalls(name, version, d, cache))
      : runner === "bun"
        ? bunxInstalls(name, version, caches.bun, caches.uid, cache)
        : firstInstalls(caches.npm, (d) =>
            npxInstalls(name, version, d, cache).map((i) => ({
              ...i,
              pkgDir: path.join(i.dir, "node_modules", name),
            })),
          );
  const installs = pinnedCopy(found, o.pinned);
  const where =
    runner === "pnpm" ? "pnpm's dlx cache" : runner === "bun" ? "bunx's cache" : "npx's cache";
  if (installs.length === 0) {
    return {
      ok: false,
      code: "not-installed",
      reason: `${name}@${version} is not installed in ${where}${runner === "yarn" ? " (yarn dlx keeps no installed tree, so the same release is installed through npx at pin time: yarnDlxInstallCommand)" : ""}, so what would run cannot be checked`,
    };
  }
  if (
    new Set(installs.map((i) => `${i.integrity} ${i.lockDigest} ${i.treeDigest} ${i.bin}`)).size > 1
  ) {
    return {
      ok: false,
      code: "inconsistent-copies",
      reason: `${where} holds different copies of ${name}@${version}; clear them and pin again`,
    };
  }
  const i = installs[0];
  const args = argsOf(def);
  const at = args.indexOf(`${name}@${version}`);
  const bunRuntime = runner === "bun" && args.slice(0, Math.max(at, 0)).includes("--bun");
  return {
    ok: true,
    pin: {
      kind: "npm",
      name,
      version,
      integrity: i.integrity,
      lockDigest: i.lockDigest,
      treeDigest: i.treeDigest,
      bin: i.bin,
    },
    launch: {
      dir: i.dir,
      runtime: bunRuntime ? "bun" : "node",
      script: path.join(i.pkgDir, i.bin),
      args: at >= 0 ? args.slice(at + 1).filter((a, k) => !(k === 0 && a === "--")) : [],
    },
  };
}

/**
 * yarn dlx removes its project after every run, so the same release is
 * installed into npx's cache (and measured there): the command the adapter
 * runs once at pin time (no install scripts run; npx's cache key is the same
 * as `npx NAME@VERSION`'s). null: not a pinned yarn dlx form.
 */
export function yarnDlxInstallCommand(
  def: McpServerDefinition,
): Readonly<{ command: string; args: readonly string[] }> | null {
  const r = codeResolution(def);
  if (npmRunner(def) !== "yarn" || r.kind !== "pinned-form" || r.expected.kind !== "npm") {
    return null;
  }
  const spec = `${r.expected.name}@${r.expected.version}`;
  if (!NPM_NAME.test(r.expected.name)) {
    return null;
  }
  return {
    command: "npm",
    args: ["exec", "--yes", "--ignore-scripts", `--package=${spec}`, "--", "node", "-e", ""],
  };
}

// ─── Python environments ────────────────────────────────────────────────

/** The files of a zip archive by name (a wheel), stored or deflated; only `want` is extracted. */
export function zipEntry(
  file: string,
  want: (name: string) => boolean,
): { name: string; data: Buffer } | null {
  const buf = fs.readFileSync(file);
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) {
    throw new Error(`${path.basename(file)} is not a zip archive`);
  }
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) {
      throw new Error(`${path.basename(file)} has a malformed central directory`);
    }
    const method = buf.readUInt16LE(off + 10);
    const csize = buf.readUInt32LE(off + 20);
    const nlen = buf.readUInt16LE(off + 28);
    const elen = buf.readUInt16LE(off + 30);
    const clen = buf.readUInt16LE(off + 32);
    const local = buf.readUInt32LE(off + 42);
    const name = buf.subarray(off + 46, off + 46 + nlen).toString("utf8");
    off += 46 + nlen + elen + clen;
    if (!want(name)) {
      continue;
    }
    const lnlen = buf.readUInt16LE(local + 26);
    const lelen = buf.readUInt16LE(local + 28);
    const start = local + 30 + lnlen + lelen;
    const raw = buf.subarray(start, start + csize);
    if (method === 0) {
      return { name, data: Buffer.from(raw) };
    }
    if (method === 8) {
      return { name, data: inflateRawSync(raw) };
    }
    throw new Error(`${name} in ${path.basename(file)} uses an unsupported compression`);
  }
  return null;
}

/**
 * The sha256 hashes a simple repository index (PEP 503 HTML or PEP 691 JSON)
 * lists for the distribution files of name==version, sorted.
 */
export function simpleIndexHashes(page: string, name: string, version: string): string[] {
  const n = normName(name);
  const fileMatches = (f: string) => {
    const base = decodeURIComponent(f.split(/[?#]/)[0].split("/").pop() ?? "");
    const m = /^([A-Za-z0-9_.]+?)-([^-]+?)(?:-|\.tar\.gz$|\.zip$)/.exec(base);
    return !!m && normName(m[1]) === n && m[2] === version;
  };
  const out = new Set<string>();
  const t = page.trim();
  if (t.startsWith("{")) {
    const j = JSON.parse(t) as { files?: { filename?: string; hashes?: { sha256?: string } }[] };
    for (const f of j.files ?? []) {
      if (
        typeof f.filename === "string" &&
        fileMatches(f.filename) &&
        /^[0-9a-f]{64}$/.test(f.hashes?.sha256 ?? "")
      ) {
        out.add(`sha256:${f.hashes!.sha256}`);
      }
    }
  } else {
    for (const m of t.matchAll(/href="([^"]+)"/g)) {
      const href = m[1].replaceAll("&amp;", "&");
      const h = /#sha256=([0-9a-f]{64})/.exec(href);
      if (h && fileMatches(href)) {
        out.add(`sha256:${h[1]}`);
      }
    }
  }
  return [...out].toSorted();
}

type PyEnv = Readonly<{
  dir: string;
  site: string;
  dists: { name: string; version: string; record: string }[];
}>;

/** The runner environments (a pyvenv.cfg and site-packages) under `roots` holding exactly name==version. */
function pythonEnvs(
  name: string,
  version: string,
  roots: readonly string[],
): { dir: string; site: string; mtime: number }[] {
  const n = normName(name);
  for (const root of roots) {
    let dirs: string[];
    try {
      dirs = fs.readdirSync(root).toSorted();
    } catch {
      continue;
    }
    const out: { dir: string; site: string; mtime: number }[] = [];
    for (const d of dirs) {
      const dir = path.join(root, d);
      let mtime: number;
      try {
        mtime = fs.statSync(path.join(dir, "pyvenv.cfg")).mtimeMs;
      } catch {
        continue;
      }
      const site = sitePackagesIn(dir);
      if (
        site &&
        fs
          .readdirSync(site)
          .some((x) => x.toLowerCase() === `${n}-${version}.dist-info`.toLowerCase())
      ) {
        out.push({ dir, site, mtime });
      }
    }
    // The first root (in the runner's precedence) that holds the release.
    if (out.length > 0) {
      return out;
    }
  }
  return [];
}

/** The console script `bin/<name>` of an environment and the interpreter it runs. */
function pythonEntry(env: string, command: string): { script: string; interpreter: string } | null {
  const bin = fs.existsSync(path.join(env, "bin"))
    ? path.join(env, "bin")
    : path.join(env, "Scripts");
  const script = path.join(bin, command);
  const interpreter = ["python3", "python"]
    .map((p) => path.join(bin, p))
    .find((p) => fs.existsSync(p));
  return fs.existsSync(script) && interpreter && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(command)
    ? { script, interpreter }
    : null;
}

/** An environment's interpreter identity: its real file and SHA-256 (the venv links to it). */
export function interpreterIdentity(
  interpreter: string,
  cache?: TreeHashCache,
): { real: string; sha256: string } {
  const real = fs.realpathSync(interpreter);
  return { real, sha256: cachedSha256(real, cache) };
}

function measurePyEnv(
  e: { dir: string; site: string },
  cache?: TreeHashCache,
): PyEnv & { lockDigest: string; treeDigest: string } {
  const dists = verifySitePackages(e.site, cache);
  const entry = pythonEntry(e.dir, "python3") ?? pythonEntry(e.dir, "python");
  const interp = entry ? interpreterIdentity(entry.script, cache) : null;
  const cfg = fs.readFileSync(path.join(e.dir, "pyvenv.cfg"), "utf8");
  return {
    ...e,
    dists,
    lockDigest: sha256(canonical({ dists, interpreter: interp, pyvenv: cfg })),
    treeDigest: treeDigest(e.dir, { cache }).digest,
  };
}

export type PythonIndex = Readonly<{
  /** The index page (simple HTML or JSON) for the package, as fetched by the adapter. */
  page: string;
  /** At pin time: the downloaded wheels (their files), checked against the index and the installed RECORD. */
  wheels?: readonly string[];
}>;

/** The release's integrity: the index's hashes at pin time (wheels checked), the record's at launch. */
function pythonIntegrity(
  name: string,
  version: string,
  o: RunnerMeasureOptions,
): { ok: true; hashes: string[] } | { ok: false; reason: string } {
  const pinned =
    o.pinned &&
    o.pinned.kind === "pypi" &&
    o.pinned.name === name &&
    o.pinned.version === version &&
    /^sha256:[0-9a-f]{64}(,sha256:[0-9a-f]{64})*$/.test(o.pinned.integrity) &&
    typeof o.pinned.lockDigest === "string" &&
    typeof o.pinned.treeDigest === "string"
      ? o.pinned
      : null;
  if (o.index) {
    const hashes = simpleIndexHashes(o.index.page, name, version);
    if (hashes.length === 0) {
      return { ok: false, reason: `the index lists no hashed file of ${name}==${version}` };
    }
    if (!o.index.wheels && !pinned) {
      return {
        ok: false,
        reason: `the wheels of ${name}==${version} were not checked against the index and the installed files; pin it again`,
      };
    }
    return { ok: true, hashes };
  }
  if (pinned) {
    // Launch: no index is read; the environment must be the one the pin
    // measured, and at pin time it was chained to these wheel hashes.
    return { ok: true, hashes: pinned.integrity.split(",") };
  }
  return {
    ok: false,
    reason: `neither the index entry of ${name}==${version} (pin time) nor its admission record (launch) was given, so its release cannot be checked`,
  };
}

function measurePython(
  def: McpServerDefinition,
  caches: RunnerCaches,
  o: RunnerMeasureOptions,
): RunnerMeasurement {
  const r = codeResolution(def);
  const form = pythonRunnerForm(def);
  if (r.kind !== "pinned-form" || r.expected.kind !== "pypi" || !form?.command) {
    return {
      ok: false,
      code: "unpinned-form",
      reason:
        r.kind === "unpinned"
          ? `${r.reason}; to pin it, ${r.howToPin}`
          : "the runner names no exact package",
    };
  }
  const { name, version } = r.expected;
  // Without --from / --spec the package names the command (pkg==1.2.3 runs pkg).
  const command = form.command === form.spec ? name : form.command;
  const integrity = pythonIntegrity(name, version, o);
  if (!integrity.ok) {
    return { ok: false, code: "index-mismatch", reason: integrity.reason };
  }
  const cmd = runnerOf(def);
  const uvRoots = caches.uv.map((d) => path.join(d, "archive-v0"));
  const found = pythonEnvs(
    name,
    version,
    cmd === "pipx" ? [...caches.pipx, ...uvRoots] : [...uvRoots, ...caches.pipx],
  );
  if (found.length === 0) {
    return {
      ok: false,
      code: "not-installed",
      reason: `${name}==${version} is not installed in uv's or pipx's cache, so what would run cannot be checked (run it once with the runner, then pin)`,
    };
  }
  // Each environment measured on its own: one that is not what was installed
  // is never started (and refuses when it is the only one).
  const envs: (PyEnv & { lockDigest: string; treeDigest: string; mtime: number })[] = [];
  let broken: string | null = null;
  for (const e of found) {
    try {
      envs.push({ ...measurePyEnv(e, o.hashCache), mtime: e.mtime });
    } catch (err) {
      broken ??= (err as Error).message;
    }
  }
  if (envs.length === 0) {
    return {
      ok: false,
      code: "tree-changed",
      reason: `the installed ${name}==${version} is not what was installed: ${broken}`,
    };
  }
  // Launch: the environment the record pins. Pin time: the newest one (the
  // runner's last run of this definition), which the person reviews and pins.
  const env =
    (o.pinned &&
      envs.find(
        (e) => e.lockDigest === o.pinned!.lockDigest && e.treeDigest === o.pinned!.treeDigest,
      )) ||
    envs.toSorted((x, y) => y.mtime - x.mtime)[0];
  if (o.index?.wheels) {
    const problem = wheelChainProblem(o.index.wheels, integrity.hashes, env, name, version);
    if (problem) {
      return { ok: false, code: "index-mismatch", reason: problem };
    }
  }
  const entry =
    pythonEntry(env.dir, command) ?? pythonEntry(env.dir, normName(command).replace(/_/g, "-"));
  if (!entry) {
    return {
      ok: false,
      code: "not-installed",
      reason: `the environment of ${name}==${version} has no command ${command}`,
    };
  }
  const args = argsOf(def);
  return {
    ok: true,
    pin: {
      kind: "pypi",
      name: name.toLowerCase(),
      version,
      integrity: integrity.hashes.join(","),
      lockDigest: env.lockDigest,
      treeDigest: env.treeDigest,
      bin: path.relative(env.dir, entry.script),
    },
    launch: {
      dir: env.dir,
      runtime: "python",
      interpreter: entry.interpreter,
      script: entry.script,
      args: args.slice(form.rest).filter((a, k) => !(k === 0 && a === "--")),
    },
  };
}

/** The wheels downloaded at pin time: each listed by the index, and the top distribution's files are the installed ones. */
function wheelChainProblem(
  wheels: readonly string[],
  hashes: readonly string[],
  env: PyEnv,
  name: string,
  version: string,
): string | null {
  const n = normName(name);
  const installed = fs
    .readdirSync(env.site)
    .find((x) => x.toLowerCase() === `${n}-${version}.dist-info`.toLowerCase());
  if (!installed) {
    return `${name}==${version} is not in the environment`;
  }
  const have = new Map(
    parseRecord(fs.readFileSync(path.join(env.site, installed, "RECORD"), "utf8")).map((e) => [
      e.rel,
      e,
    ]),
  );
  let matched = false;
  for (const w of wheels) {
    const h = `sha256:${sha256(fs.readFileSync(w))}`;
    if (!hashes.includes(h)) {
      return `the wheel ${path.basename(w)} is not one the index lists for ${name}==${version}`;
    }
    const rec = zipEntry(w, (x) => /^[^/]+\.dist-info\/RECORD$/.test(x));
    if (!rec) {
      return `the wheel ${path.basename(w)} has no RECORD`;
    }
    const all = parseRecord(rec.data.toString("utf8")).filter((e) => e.hash);
    if (all.every((e) => have.get(e.rel)?.hash === e.hash && have.get(e.rel)?.algo === e.algo)) {
      matched = true;
    }
  }
  return matched
    ? null
    : `the installed ${name}==${version} is not the content of the wheel the index lists (RECORD differs)`;
}

// ─── The entry point ────────────────────────────────────────────────────

/**
 * Measure what a package-runner definition (other than docker / podman, and
 * other than npx, which measureNpxPackage still serves) would run. Pin time
 * (Python runners): `index` with the downloaded wheels. Launch: `pinned`, the
 * record's pin (no index is read, so a launch needs no network).
 */
export function measurePackageRunner(
  def: McpServerDefinition,
  caches: RunnerCaches,
  o: RunnerMeasureOptions = {},
): RunnerMeasurement {
  if (npmRunner(def)) {
    return measureNpm(def, caches, o);
  }
  if (pythonRunnerForm(def)) {
    return measurePython(def, caches, o);
  }
  return {
    ok: false,
    code: "not-a-runner",
    reason: "the definition is not started with a package runner",
  };
}
