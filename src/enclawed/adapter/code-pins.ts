// enclawed adapter kit: pinning local code by content (M2).
//
// An MCP definition's digest and its executable's SHA-256 pin `node` or
// `python`, not the code they run. So when a definition runs local code, the
// code itself is pinned by a tree digest, measured by the launcher with this
// module and signed into the admission record:
//
//   node server.js, python srv.py, deno run x.ts, bun x.ts, sh run.sh, ...
//       the tree of the script's package (the nearest directory above it with
//       a package.json, pyproject.toml, setup.py, deno.json or go.mod; else
//       the script's own directory);
//   python -m module
//       the module's package directory (or file) as the interpreter resolves
//       it from the server's working directory, plus every file of the
//       installed distribution that provides it (the files its RECORD lists,
//       hashed here, not taken from RECORD);
//   an installed executable that is a script (`mcp-server-foo` on PATH)
//       a Node package's bin: the package's tree; a Python console script:
//       the module it imports, as above.
//
// A tree digest covers every regular file (path, size, SHA-256) and every
// symlink (its target) below the root, except VCS directories and bytecode
// caches (regenerated, so never stable). A tree too large to measure cannot be
// pinned, and the server does not start.
//
// HostAdmission pins the host agent CLI the same way: its executable's real
// file, or, for a CLI that is a script inside a package, the package's tree.
// A host whose measured code is not in a signed pin does not start.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  denoLockOf,
  denoLockedNpm,
  denoLockedRemote,
  sitePackagesIn,
  uvEnvironmentSynced,
  verifySitePackages,
} from "./python-env.js";
import {
  SKIP_DIRS,
  cachedSha256,
  filesDigest,
  sha256File,
  treeDigest,
  type TreeHashCache,
} from "./tree-digest.js";

export { filesDigest, treeDigest, type TreeDigest } from "./tree-digest.js";

const PACKAGE_MARKERS = ["package.json", "pyproject.toml", "setup.py", "deno.json", "go.mod"];
export const TREE_INTEGRITY_PREFIX = "sha256-tree:";
/** The parts of an MCP server definition that say what code it runs (./mcp.ts McpServerDefinition fits). */
export type LocalCodeDefinition = Readonly<{
  command?: string | null;
  args?: readonly unknown[];
  env?: Readonly<Record<string, unknown>>;
}>;

/**
 * The nearest directory at or above `dir` that marks a package; else `dir`.
 * The search stays inside `stop` when `dir` is inside it (the server's working
 * directory), goes up at most `maxUp` levels otherwise, and never takes the
 * home directory or a filesystem root (a stray marker there would pin a whole
 * home).
 */
export function packageRootOf(
  dir: string,
  o: { stop?: string | null; maxUp?: number } = {},
): string {
  const home = os.homedir();
  const inside = (d: string) => !o.stop || d === o.stop || d.startsWith(`${o.stop}${path.sep}`);
  const bounded = o.stop ? inside(dir) : false;
  let d = dir;
  for (let i = 0; i <= (bounded ? 64 : (o.maxUp ?? 3)); i++) {
    if (d === home || path.parse(d).root === d || (bounded && !inside(d))) {
      break;
    }
    if (PACKAGE_MARKERS.some((m) => fs.existsSync(path.join(d, m)))) {
      return d;
    }
    const up = path.dirname(d);
    if (up === d) {
      break;
    }
    d = up;
  }
  return dir;
}

/** May a directory be pinned as a whole (not the home directory, not a filesystem root)? */
function wholeDirectory(d: string): boolean {
  return d !== os.homedir() && path.parse(d).root !== d;
}

const SCRIPT_INTERPRETERS: ReadonlySet<string> = new Set([
  "node",
  "nodejs",
  "deno",
  "bun",
  "tsx",
  "ts-node",
  "python",
  "python2",
  "python3",
  "ruby",
  "perl",
  "php",
  "sh",
  "bash",
  "zsh",
  "dash",
]);
const PYTHON = /^python[0-9.]*$/;
// Options of the interpreters above that take a value (so the value is not the script).
const VALUE_OPTS: ReadonlySet<string> = new Set([
  "-r",
  "--require",
  "--import",
  "--loader",
  "--experimental-loader",
  "--env-file",
  "-W",
  "-X",
  "--config",
  "-c",
  "-e",
  "--eval",
]);

/** What local code a definition runs, beyond its executable. */
export type LocalCode =
  | Readonly<{ kind: "tree"; root: string; entry: string; runner?: "uv-run" | "deno" }>
  | Readonly<{ kind: "python-module"; interpreter: string; module: string }>
  | Readonly<{ kind: "inline" }>;

function isScriptFile(p: string): string | null {
  try {
    const fd = fs.openSync(p, "r");
    try {
      const buf = Buffer.alloc(256);
      const n = fs.readSync(fd, buf, 0, 256, 0);
      const head = buf.subarray(0, n).toString("latin1");
      return head.startsWith("#!") ? (head.split("\n")[0] ?? "") : null;
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return null;
  }
}

/** Find `name` on a PATH; a name with a slash is resolved against `cwd`. */
export function resolveCommand(name: string, cwd: string, pathVar: string): string | null {
  const tryOne = (p: string) => {
    try {
      fs.accessSync(p, fs.constants.X_OK);
      return fs.statSync(p).isFile() ? p : null;
    } catch {
      return null;
    }
  };
  if (name.includes("/")) {
    return tryOne(path.resolve(cwd, name));
  }
  for (const d of pathVar.split(path.delimiter)) {
    if (d && path.isAbsolute(d)) {
      const hit = tryOne(path.join(d, name));
      if (hit) {
        return hit;
      }
    }
  }
  return null;
}

/**
 * The local code a stdio definition runs, or null when its executable is all
 * there is (a compiled binary; the executable's SHA-256 pins it).
 */
export function localCodeOf(
  def: LocalCodeDefinition,
  o: { cwd: string; pathVar: string },
): LocalCode | null {
  if (typeof def.command !== "string" || def.command === "") {
    return null;
  }
  const prog = path.basename(def.command).replace(/\.(exe|cmd)$/i, "");
  const args = (def.args ?? []).map((a) => (typeof a === "string" ? a : (JSON.stringify(a) ?? "")));
  if (prog === "uv" && args[0] === "run") {
    return uvRunCode(args.slice(1), o.cwd);
  }
  if (SCRIPT_INTERPRETERS.has(prog)) {
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (PYTHON.test(prog) && a === "-m") {
        const mod = args[i + 1];
        return mod ? { kind: "python-module", interpreter: def.command, module: mod } : null;
      }
      if (a === "-c" || a === "-e" || a === "--eval") {
        // The code is in the definition, which its digest covers.
        return { kind: "inline" };
      }
      if (a === "run" && prog === "deno") {
        continue;
      }
      if (a.startsWith("-")) {
        if (VALUE_OPTS.has(a)) {
          i++;
        }
        continue;
      }
      const entry = path.resolve(o.cwd, a);
      const real = fs.existsSync(entry) ? fs.realpathSync(entry) : entry;
      const root = packageRootOf(path.dirname(real), {
        stop: fs.existsSync(o.cwd) ? fs.realpathSync(o.cwd) : o.cwd,
      });
      // A script loose in the home directory or a filesystem root: the script itself.
      return {
        kind: "tree",
        root: wholeDirectory(root) ? root : real,
        entry,
        ...(prog === "deno" ? { runner: "deno" as const } : {}),
      };
    }
    return null;
  }
  // An installed executable: a script is pinned through what it runs.
  const exe = resolveCommand(def.command, o.cwd, o.pathVar);
  if (!exe) {
    return null;
  }
  const real = fs.realpathSync(exe);
  const shebang = isScriptFile(real);
  if (shebang === null) {
    return null;
  }
  const interp = shebang.slice(2).trim().split(/\s+/);
  const shellProg = path.basename(
    interp[0] === "/usr/bin/env" || interp[0] === "env" ? (interp[1] ?? "") : (interp[0] ?? ""),
  );
  if (PYTHON.test(shellProg)) {
    // A console-script wrapper: `from module import main`.
    const text = fs.readFileSync(real, "utf8").slice(0, 8192);
    const m = /^\s*from\s+([A-Za-z_][\w.]*)\s+import\s/m.exec(text);
    const pyExe = interp[0] === "/usr/bin/env" || interp[0] === "env" ? shellProg : interp[0];
    if (m) {
      return { kind: "python-module", interpreter: pyExe, module: m[1] };
    }
  }
  const root = packageRootOf(path.dirname(real));
  return { kind: "tree", root: wholeDirectory(root) ? root : real, entry: real };
}

// uv run options that take a value, and those that resolve packages at launch.
const UV_RUN_VALUE = new Set([
  "--directory",
  "--project",
  "--python",
  "-p",
  "--package",
  "--env-file",
  "--index",
  "--default-index",
  "--index-url",
  "--extra-index-url",
  "--find-links",
  "-f",
  "--group",
  "--extra",
  "--only-group",
  "--no-group",
]);
const UV_RUN_EPHEMERAL =
  /^--(with|with-editable|with-requirements|script|isolated|no-project|refresh|refresh-package|upgrade|upgrade-package|reinstall)(=|$)|^-U$/;

type UvRun = Readonly<{
  /** The project (its uv.lock and environment). */
  root: string;
  /** The directory the program runs in (--directory, else the server's). */
  runDir: string;
  /** The program and its arguments (after uv's options). */
  argv: readonly string[];
  /** -m / --module: the program is a module. */
  module: boolean;
  envFiles: readonly string[];
}>;

/** `uv run`'s options, the project and the program it starts. Throws for runs that resolve packages at launch. */
function parseUvRun(args: readonly string[], cwd: string): UvRun {
  let runDir = cwd;
  let project: string | null = null;
  let module = false;
  let noEnvFile = false;
  const envFiles: string[] = [];
  let i = 0;
  for (; i < args.length; i++) {
    const a = args[i];
    if (UV_RUN_EPHEMERAL.test(a)) {
      throw new Error(
        `uv run ${a.split("=")[0]} resolves packages at every launch; add them to the project's dependencies (uv.lock) instead`,
      );
    }
    if (a === "--") {
      i++;
      break;
    }
    if (!a.startsWith("-")) {
      break;
    }
    const eq = a.indexOf("=");
    const name = eq > 0 ? a.slice(0, eq) : a;
    const value = eq > 0 ? a.slice(eq + 1) : UV_RUN_VALUE.has(a) ? (args[++i] ?? "") : null;
    if (name === "--directory") {
      runDir = path.resolve(cwd, value ?? "");
    } else if (name === "--project") {
      project = value ?? "";
    } else if (name === "--env-file") {
      envFiles.push(value ?? "");
    } else if (name === "-m" || name === "--module") {
      module = true;
    } else if (name === "--no-env-file") {
      noEnvFile = true;
    }
  }
  const dir = project !== null ? path.resolve(runDir, project) : runDir;
  const root = fs.existsSync(dir) ? fs.realpathSync(dir) : dir;
  return {
    root,
    runDir,
    argv: args.slice(i),
    module,
    envFiles: noEnvFile ? [] : envFiles.map((f) => path.resolve(runDir, f)),
  };
}

/**
 * `uv run`: a run inside a uv project, whose dependencies uv.lock pins. The
 * project's tree (its .venv included) is the code. Packages resolved for this
 * run only (--with, a script's inline metadata, --isolated, upgrades) and a
 * project with no uv.lock are resolved at launch: refused (thrown).
 */
function uvRunCode(args: readonly string[], cwd: string): LocalCode {
  const { root } = parseUvRun(args, cwd);
  if (!fs.existsSync(path.join(root, "uv.lock"))) {
    throw new Error(
      `uv run resolves the project's dependencies at launch: ${root} has no uv.lock (run uv lock)`,
    );
  }
  return { kind: "tree", root, entry: root, runner: "uv-run" };
}

/** A uv project's environment (UV_PROJECT_ENVIRONMENT, else .venv). */
function uvProjectEnvironment(def: LocalCodeDefinition, root: string): string {
  const v = def.env?.UV_PROJECT_ENVIRONMENT;
  return path.resolve(root, typeof v === "string" && v ? v : ".venv");
}

const venvBin = (venv: string) =>
  fs.existsSync(path.join(venv, "bin")) ? path.join(venv, "bin") : path.join(venv, "Scripts");

/** An environment's Python (bin/python3, bin/python, Scripts\python.exe), or null. */
function venvPython(venv: string): string | null {
  const bin = venvBin(venv);
  return (
    ["python3", "python", "python.exe"]
      .map((n) => path.join(bin, n))
      .find((p) => fs.existsSync(p)) ?? null
  );
}

/** A dotenv file's variables, as uv run loads them (KEY=VALUE, `export`, quotes, comments). */
export function parseEnvFile(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_.]*)\s*=\s*(.*)$/.exec(line);
    if (!m) {
      throw new Error(`the env file line ${JSON.stringify(line.slice(0, 60))} is not KEY=VALUE`);
    }
    let v = m[2];
    if (/^'[^']*'$/.test(v)) {
      v = v.slice(1, -1);
    } else if (/^"(?:[^"\\]|\\.)*"$/.test(v)) {
      v = v
        .slice(1, -1)
        .replace(/\\(["\\nt$])/g, (_, c: string) => (c === "n" ? "\n" : c === "t" ? "\t" : c));
    } else if (/["'`]|\$\{?[A-Za-z_]/.test(v)) {
      // Expansion and multi-line values are not replayed: refused, not guessed.
      throw new Error(
        `the env file value of ${m[1]} uses quoting or expansion that is not supported`,
      );
    } else {
      v = v.replace(/\s+#.*$/, "");
    }
    out[m[1]] = v;
  }
  return out;
}

/** How the launcher starts local code without its runner (uv run), or with its cache locked (deno). */
export type LocalLaunch = Readonly<{
  dir: string;
  command: string;
  args: readonly string[];
  /** Variables set for the program (they override the definition's). */
  env: Readonly<Record<string, string>>;
  /** Variables set only when the definition does not set them (an env file's). */
  envDefaults: Readonly<Record<string, string>>;
}>;

const DENO_LAUNCH_FLAGS = ["--frozen", "--cached-only", "--no-code-cache"] as const;

/**
 * The launch of a definition whose local code a runner would resolve:
 *
 *   uv run   (after the project was measured: synced to uv.lock, every file
 *            against RECORD) the project's own environment interpreter and
 *            entry, started directly; uv never runs (no sync, no resolution).
 *            A program that is not in the environment (PATH) is refused.
 *   deno     deno itself, but with its lock frozen, its module cache only
 *            (nothing is fetched), no V8 code cache and no transpile cache,
 *            so only the measured modules load.
 *
 * null: the definition runs as written. Throws when uv run cannot be replayed.
 */
export function localCodeLaunch(
  def: LocalCodeDefinition,
  o: { cwd: string; pathVar: string },
): LocalLaunch | null {
  if (typeof def.command !== "string" || def.command === "") {
    return null;
  }
  const prog = path.basename(def.command).replace(/\.(exe|cmd)$/i, "");
  const args = (def.args ?? []).map((a) => (typeof a === "string" ? a : (JSON.stringify(a) ?? "")));
  if (prog === "deno") {
    // `deno run|serve [flags] entry` or `deno [flags] entry` (an implicit run).
    const at =
      args[0] === "run" || args[0] === "serve"
        ? 1
        : args[0]?.startsWith("-") || (args[0] && /\.(m?[jt]sx?|c[jt]s)$/.test(args[0]))
          ? 0
          : -1;
    if (at < 0) {
      return null;
    }
    const add = DENO_LAUNCH_FLAGS.filter(
      (f) => !args.some((a) => a === f || a.startsWith(`${f}=`)),
    );
    return {
      dir: o.cwd,
      command: def.command,
      args: [...args.slice(0, at), ...add, ...args.slice(at)],
      env: { DENO_EMIT_CACHE_MODE: "disable" },
      envDefaults: {},
    };
  }
  if (prog !== "uv" || args[0] !== "run") {
    return null;
  }
  const run = parseUvRun(args.slice(1), o.cwd);
  const venv = uvProjectEnvironment(def, run.root);
  const python = venvPython(venv);
  if (!python) {
    throw new Error(`the uv project's environment ${venv} has no Python interpreter (run uv sync)`);
  }
  const bin = venvBin(venv);
  const [program, ...rest] = run.argv;
  if (!program) {
    throw new Error("uv run names no program");
  }
  let command = python;
  let argv: string[];
  if (run.module) {
    argv = ["-m", program, ...rest];
  } else if (/^python[0-9.]*(\.exe)?$/.test(program)) {
    argv = rest;
  } else if (/\.pyw?$/.test(program)) {
    // Absolute: the program runs from wherever the containment starts it.
    argv = [path.resolve(run.runDir, program), ...rest];
  } else {
    const inEnv = path.join(bin, program);
    if (program.includes("/") || program.includes("\\") || !fs.existsSync(inEnv)) {
      throw new Error(
        `uv run would start ${JSON.stringify(program)} from outside the project's environment (PATH), which nothing pins; name that program directly in the definition`,
      );
    }
    const head = fs.readFileSync(inEnv).subarray(0, 256).toString("latin1");
    if (head.startsWith("#!") && /python/.test(head.split("\n")[0] ?? "")) {
      argv = [inEnv, ...rest];
    } else {
      command = inEnv;
      argv = rest;
    }
  }
  const envDefaults: Record<string, string> = {};
  const files = [
    ...(typeof def.env?.UV_ENV_FILE === "string"
      ? [path.resolve(run.runDir, def.env.UV_ENV_FILE)]
      : []),
    ...run.envFiles,
  ];
  for (const f of files) {
    Object.assign(envDefaults, parseEnvFile(fs.readFileSync(f, "utf8")));
  }
  return {
    dir: run.runDir,
    command,
    args: argv,
    env: { VIRTUAL_ENV: venv, PATH: [bin, o.pathVar].filter(Boolean).join(path.delimiter) },
    envDefaults,
  };
}

const PY_PROBE = [
  "import sys, json, importlib.util",
  "top = sys.argv[1].split('.')[0]",
  "spec = importlib.util.find_spec(top)",
  "out = {'origin': None, 'locations': [], 'files': [], 'hashed': []}",
  "if spec is not None:",
  "    out['origin'] = spec.origin",
  "    out['locations'] = list(spec.submodule_search_locations or [])",
  "try:",
  "    import importlib.metadata as md",
  "    for d in md.packages_distributions().get(top, []):",
  "        dist = md.distribution(d)",
  "        for f in (dist.files or []):",
  "            out['files'].append(str(dist.locate_file(f)))",
  "            if f.hash is not None:",
  "                out['hashed'].append([str(dist.locate_file(f)), f.hash.mode, f.hash.value])",
  "except Exception:",
  "    pass",
  "print(json.dumps(out))",
].join("\n");

/**
 * The files of a Python module as the interpreter resolves it from `cwd`
 * (only the top-level package is located, so no package code runs), with the
 * files of the distributions that provide it.
 */
export function pythonModuleFiles(
  interpreter: string,
  module: string,
  o: { cwd: string; env: Readonly<Record<string, string>> },
): string[] {
  if (!/^[A-Za-z_][\w.]*$/.test(module)) {
    throw new Error(`${JSON.stringify(module)} is not a module name`);
  }
  const r = spawnSync(interpreter, ["-c", PY_PROBE, module], {
    cwd: o.cwd,
    env: o.env,
    encoding: "utf8",
    timeout: 20_000,
    windowsHide: true,
  });
  if (r.status !== 0 || typeof r.stdout !== "string") {
    throw new Error(`could not locate the module ${module} with ${interpreter}`);
  }
  const out = JSON.parse(r.stdout) as {
    origin: string | null;
    locations: string[];
    files: string[];
    hashed?: [string, string, string][];
  };
  // The installed distribution's files must be the ones its RECORD lists
  // (changed after the install: not what was installed).
  for (const [file, mode, value] of out.hashed ?? []) {
    if (!["sha256", "sha384", "sha512"].includes(mode)) {
      throw new Error(`${file} is recorded with the hash ${mode}, which is not accepted`);
    }
    let buf: Buffer;
    try {
      buf = fs.readFileSync(file);
    } catch {
      throw new Error(`${file}, which its distribution's RECORD lists, is missing`);
    }
    const got = createHash(mode)
      .update(buf)
      .digest("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    if (got !== value) {
      throw new Error(
        `${file} is not the installed file (its hash differs from its distribution's RECORD)`,
      );
    }
  }
  if (!out.origin && out.locations.length === 0) {
    throw new Error(`the module ${module} is not installed for ${interpreter}`);
  }
  if (out.origin === "built-in" || out.origin === "frozen") {
    return [];
  }
  const files: string[] = [];
  const walk = (p: string) => {
    let st: fs.Stats;
    try {
      st = fs.lstatSync(p);
    } catch {
      return;
    }
    if (st.isDirectory()) {
      for (const n of fs.readdirSync(p)) {
        if (!SKIP_DIRS.has(n)) {
          walk(path.join(p, n));
        }
      }
    } else if (st.isFile()) {
      files.push(p);
    }
  };
  for (const l of out.locations) {
    walk(l);
  }
  if (out.locations.length === 0 && out.origin) {
    files.push(out.origin);
  }
  files.push(...out.files);
  return files;
}

/** A measurement of a definition's local code, as the admission record pins it. */
export type LocalCodePin = Readonly<{
  kind: "tree";
  /** What was measured (a root directory, or `python -m <module>`). */
  name: string;
  version: "";
  integrity: string;
}>;

/** Measure a definition's local code (the launcher does this before admission). null: nothing beyond the executable. */
export function measureLocalCode(
  def: LocalCodeDefinition,
  o: {
    cwd: string;
    pathVar: string;
    env?: Readonly<Record<string, string>>;
    /** deno's cache directory (runner-pins runnerCacheDirs().deno). */
    denoDir?: string;
    /** The jsr registry deno reads (JSR_URL), for the jsr packages of a deno.lock. */
    jsrUrl?: string;
    /** The adapter's file-hash cache (./tree-digest.ts treeHashCache; refreshed at pin time). */
    hashCache?: TreeHashCache;
  },
): LocalCodePin | null {
  const code = localCodeOf(def, o);
  if (!code || code.kind === "inline") {
    return null;
  }
  const cache = o.hashCache;
  if (code.kind === "tree") {
    let tree = treeDigest(code.root, { cache }).digest;
    if (code.runner === "uv-run") {
      // The project environment: every distribution is what was installed,
      // synced to uv.lock, and the interpreter the environment runs.
      const venv = uvProjectEnvironment(def, code.root);
      const site = fs.existsSync(venv) ? sitePackagesIn(venv) : null;
      if (!site) {
        throw new Error(`the uv project ${code.root} has no environment yet (run uv sync)`);
      }
      const dists = verifySitePackages(site, cache);
      uvEnvironmentSynced(dists, path.join(code.root, "uv.lock"));
      const py = venvPython(venv);
      if (!py) {
        throw new Error(`the uv project's environment ${venv} has no Python interpreter`);
      }
      const interp = cachedSha256(fs.realpathSync(py), cache);
      tree = createHash("sha256")
        .update(`${tree}\n${path.relative(code.root, venv)}\n${interp}`)
        .digest("hex");
    }
    if (code.runner === "deno") {
      const lock = denoLockOf(def, code.root, o.cwd);
      if (lock === null) {
        throw new Error(
          "deno resolves its imports at launch: use a lock file (deno.lock or --lock), or switch remote imports off (--no-remote --no-npm)",
        );
      }
      if (lock !== "off") {
        const denoDir = o.denoDir ?? path.join(os.homedir(), ".cache", "deno");
        const npm = denoLockedNpm(lock, denoDir, cache);
        // Remote (https:) and jsr: modules, measured in deno's cache against
        // the lock without relying on deno's own check.
        const remote = denoLockedRemote(lock, denoDir, o.jsrUrl);
        const parts =
          remote.modules > 0 ? [tree, npm.lockDigest, remote.remoteDigest] : [tree, npm.lockDigest];
        return {
          kind: "tree",
          name: code.root,
          version: "",
          integrity: `${TREE_INTEGRITY_PREFIX}${createHash("sha256").update(parts.join("\n")).digest("hex")}`,
        };
      }
    }
    return {
      kind: "tree",
      name: code.root,
      version: "",
      integrity: `${TREE_INTEGRITY_PREFIX}${tree}`,
    };
  }
  const env: Record<string, string> = { PATH: o.pathVar };
  const pp = def.env?.PYTHONPATH;
  if (typeof pp === "string") {
    env.PYTHONPATH = pp;
  }
  const files = pythonModuleFiles(code.interpreter, code.module, {
    cwd: o.cwd,
    env: { ...env, ...o.env },
  });
  return {
    kind: "tree",
    name: `python -m ${code.module}`,
    version: "",
    integrity: `${TREE_INTEGRITY_PREFIX}${filesDigest(files, { cache }).digest}`,
  };
}

/**
 * The admission decision for a definition's local code: null when it may
 * start. `code`: localCodeOf. The record's pin and the launcher's measurement
 * must both be tree pins of the same code.
 */
export function localCodeProblem(
  code: LocalCode | null,
  recordPin: Readonly<{ kind: string; name: string; integrity: string }> | null | undefined,
  measured: Readonly<{ kind: string; name: string; integrity: string }> | null | undefined,
): string | null {
  if (!code || code.kind === "inline") {
    return null;
  }
  const what =
    code.kind === "tree" ? `the code under ${code.root}` : `the Python module ${code.module}`;
  if (
    !recordPin ||
    recordPin.kind !== "tree" ||
    !recordPin.integrity.startsWith(TREE_INTEGRITY_PREFIX)
  ) {
    return `it runs ${what}, which its admission record does not pin by content; pin it again so the record carries its tree digest`;
  }
  if (!measured || measured.kind !== "tree") {
    return `the launcher did not measure ${what} it would start`;
  }
  if (measured.name !== recordPin.name || measured.integrity !== recordPin.integrity) {
    return `${what} is not the code the admission record pins (its tree digest differs)`;
  }
  return null;
}

// ─── Host admission ─────────────────────────────────────────────────────

export type HostPin = Readonly<{ host: string; integrity: string; version?: string | null }>;

export type HostMeasurement = Readonly<{
  /** The executable as found on PATH, and its real file. */
  executable: string;
  real: string;
  /** "file": the real file's SHA-256; "tree": a script's package. */
  kind: "file" | "tree";
  root: string;
  integrity: string;
}>;

/** Measure the host agent CLI: a compiled executable by its file, a script by its package's tree. */
export function measureHostBinary(executable: string): HostMeasurement {
  const real = fs.realpathSync(executable);
  if (isScriptFile(real) !== null || /\.(c?m?js|py)$/.test(real)) {
    const pkg = packageRootOf(path.dirname(real));
    const root = wholeDirectory(pkg) ? pkg : real;
    return {
      executable,
      real,
      kind: "tree",
      root,
      integrity: `${TREE_INTEGRITY_PREFIX}${treeDigest(root).digest}`,
    };
  }
  return { executable, real, kind: "file", root: real, integrity: `sha256:${sha256File(real)}` };
}

export type HostAdmission =
  | Readonly<{ ok: true; pin: HostPin }>
  | Readonly<{ ok: false; code: "host-not-pinned"; message: string }>;

/**
 * May this host CLI start? Only when its measured code is in a verified pin
 * for this host (the adapter loads pins with verifyRecord; an unverified pin
 * is never passed here). An update of the CLI needs a new pin.
 */
export function admitHost(
  host: string,
  measured: HostMeasurement,
  pins: readonly HostPin[],
): HostAdmission {
  const pin = pins.find((p) => p.host === host && p.integrity === measured.integrity);
  if (pin) {
    return { ok: true, pin };
  }
  return {
    ok: false,
    code: "host-not-pinned",
    message: `Not starting: the ${host} executable ${measured.real} (${measured.kind === "tree" ? `the package ${measured.root}` : "its file"}, ${measured.integrity}) is not pinned. Review the installed version, then pin it (a changed or updated ${host} needs a new pin).`,
  };
}
