// enclawed adapter kit: MCP server CODE pinned by content.
//
// An admission that measures only the definition and the executable it
// names pins `npx`, `uvx` or `docker`, not the server: `npx postmark-mcp`
// runs whatever version the registry serves at launch, so a backdoored
// release runs with no change anywhere Enclawed looked. So:
//
//   - A definition that resolves its code at launch is refused at admission
//     ("mcp-server-unpinned-code") unless it names the code exactly AND the
//     admission record pins its content:
//       npm runners (npx, pnpm dlx, bunx, yarn dlx, npm exec)   name@<exact version>,
//                                         record pins the tarball's integrity (sha512)
//       Python runners (uvx, pipx run)      name==<exact version>, record pins the
//                                         distribution's hashes
//       containers (docker, podman run)   image@sha256:<digest>: the digest is the pin
//   - The launcher measures the code it will start (the integrity of the
//     package it fetched, the hashes of the wheel) and the kit compares that
//     with the record; a mismatch is refused.
//
// The message says how to pin, in plain words.

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { McpServerDefinition } from "./contracts.js";
import { treeDigest, type TreeHashCache } from "./tree-digest.js";

/** What a record pins about a server's code, and what a launcher measured. */
export type McpCodePin = Readonly<{
  /** tree: local code measured by ./code-pins.ts (a script's package, a Python module). */
  kind: "npm" | "pypi" | "oci" | "tree";
  name: string;
  version: string;
  /** npm: the tarball's `integrity` (sha512-...); pypi: sorted "sha256:..." hashes joined by ","; oci: the image digest. */
  integrity: string;
  /**
   * npm, measured in the package runner's cache (measureNpxPackage): a digest
   * over every package's version, integrity and source in the lockfile, the
   * tree digest of the installed node_modules, and the bin file that runs.
   * When either the record or the measurement carries them, both must, equal.
   */
  lockDigest?: string;
  treeDigest?: string;
  bin?: string;
}>;

export type CodeResolution =
  | Readonly<{ kind: "static" }>
  | Readonly<{ kind: "pinned-form"; expected: Pick<McpCodePin, "kind" | "name" | "version"> }>
  | Readonly<{ kind: "unpinned"; reason: string; howToPin: string }>;

const EXACT_SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const EXACT_PEP440 = /^\d+(?:\.\d+)*(?:(?:a|b|rc)\d+)?(?:\.post\d+)?(?:\.dev\d+)?$/;

function firstOperand(args: readonly string[], valueOpts: ReadonlySet<string>): string | null {
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--") {
      return args[i + 1] ?? null;
    }
    if (a.startsWith("-")) {
      if (valueOpts.has(a)) {
        i++;
      }
      continue;
    }
    return a;
  }
  return null;
}

function npmSpec(spec: string | null): CodeResolution {
  const how =
    "name the exact version (npx -y name@1.2.3) and pin the package's integrity in the admission record";
  if (!spec) {
    return { kind: "unpinned", reason: "the package runner names no package", howToPin: how };
  }
  const m = /^(@[^/@]+\/[^@]+|[^@]+)@(.+)$/.exec(spec);
  if (!m || !EXACT_SEMVER.test(m[2])) {
    return {
      kind: "unpinned",
      reason: `the package ${JSON.stringify(spec)} is resolved by the registry at every launch (no exact version)`,
      howToPin: how,
    };
  }
  return { kind: "pinned-form", expected: { kind: "npm", name: m[1], version: m[2] } };
}

function pypiSpec(spec: string | null, at = false): CodeResolution {
  const how =
    "name the exact version (uvx name==1.2.3, or uvx --from name==1.2.3 command) and pin the distribution's hashes in the admission record";
  if (!spec) {
    return { kind: "unpinned", reason: "the package runner names no package", howToPin: how };
  }
  // name==X or name[extras]==X; uvx also takes name@X.
  const m =
    /^([A-Za-z0-9][A-Za-z0-9._-]*)(?:\[[A-Za-z0-9._,\s-]*\])?==(.+)$/.exec(spec) ??
    (at ? /^([A-Za-z0-9][A-Za-z0-9._-]*)(?:\[[A-Za-z0-9._,\s-]*\])?@(.+)$/.exec(spec) : null);
  if (!m || !EXACT_PEP440.test(m[2])) {
    return {
      kind: "unpinned",
      reason: `the package ${JSON.stringify(spec)} is resolved by the index at every launch (no exact version)`,
      howToPin: how,
    };
  }
  return {
    kind: "pinned-form",
    expected: { kind: "pypi", name: m[1].toLowerCase(), version: m[2] },
  };
}

// The options of uvx / uv tool run and pipx run that take a value.
const UVX_VALUE: ReadonlySet<string> = new Set([
  "--from",
  "--with",
  "--with-editable",
  "--with-requirements",
  "--python",
  "-p",
  "--index",
  "--default-index",
  "--index-url",
  "-i",
  "--extra-index-url",
  "--find-links",
  "-f",
  "--cache-dir",
  "--config-file",
  "--directory",
  "--project",
  "--constraints",
  "-c",
  "--overrides",
  "--build-constraints",
  "-b",
  "--index-strategy",
  "--keyring-provider",
  "--resolution",
  "--prerelease",
  "--exclude-newer",
  "--link-mode",
  "--color",
  "--env-file",
]);
const PIPX_VALUE: ReadonlySet<string> = new Set([
  "--spec",
  "--python",
  "--index-url",
  "-i",
  "--pip-args",
  "--backend",
]);

/**
 * A Python runner's package and command: `uvx [--from SPEC] NAME_OR_SPEC
 * ARGS`, `uv tool run ...` the same, `pipx run [--spec SPEC] NAME_OR_SPEC
 * ARGS`. `spec`: what is installed; `command`: the console script that runs;
 * `rest`: the index in `args` after the command. null: not a Python runner.
 */
export function pythonRunnerForm(def: McpServerDefinition): {
  spec: string | null;
  command: string | null;
  rest: number;
  at: boolean;
} | null {
  const cmd =
    typeof def.command === "string"
      ? (def.command.split(/[\\/]/).pop() ?? "").replace(/\.(cmd|exe|bat)$/i, "")
      : "";
  const args = (def.args ?? []).map(String);
  let start: number;
  let fromOpt: string;
  let values: ReadonlySet<string>;
  if (cmd === "uvx") {
    [start, fromOpt, values] = [0, "--from", UVX_VALUE];
  } else if (cmd === "uv" && args[0] === "tool" && args[1] === "run") {
    [start, fromOpt, values] = [2, "--from", UVX_VALUE];
  } else if (cmd === "pipx" && args[0] === "run") {
    [start, fromOpt, values] = [1, "--spec", PIPX_VALUE];
  } else {
    return null;
  }
  let from: string | null = null;
  for (let i = start; i < args.length; i++) {
    const a = args[i];
    if (a === "--") {
      const operand = args[i + 1] ?? null;
      return { spec: from ?? operand, command: operand, rest: i + 2, at: cmd !== "pipx" };
    }
    if (a === fromOpt) {
      from = args[i + 1] ?? null;
      i++;
      continue;
    }
    if (a.startsWith(`${fromOpt}=`)) {
      from = a.slice(fromOpt.length + 1);
      continue;
    }
    if (a.startsWith("-")) {
      if (values.has(a)) {
        i++;
      }
      continue;
    }
    return { spec: from ?? a, command: a, rest: i + 1, at: cmd !== "pipx" };
  }
  return { spec: from, command: null, rest: args.length, at: cmd !== "pipx" };
}

/** How a definition gets its code: fixed files, an exact package form, or resolved at launch. */
export function codeResolution(def: McpServerDefinition): CodeResolution {
  // Windows launchers (C:\\...\\npx.cmd, uvx.exe) are the same runners.
  const cmd =
    typeof def.command === "string"
      ? (def.command.split(/[\\/]/).pop() ?? "").replace(/\.(cmd|exe|bat)$/i, "")
      : "";
  const args = (def.args ?? []).map(String);
  switch (cmd) {
    case "npx":
    case "bunx":
    case "pnpx":
      return npmSpec(firstOperand(args, new Set(["-p", "--package", "-c", "--call"])));
    case "bun":
      return args[0] === "x"
        ? npmSpec(firstOperand(args.slice(1), new Set(["-p", "--package"])))
        : { kind: "static" };
    case "pnpm":
    case "yarn":
      return args[0] === "dlx"
        ? npmSpec(firstOperand(args.slice(1), new Set()))
        : { kind: "static" };
    case "npm":
      return args[0] === "exec" || args[0] === "x"
        ? npmSpec(firstOperand(args.slice(1), new Set(["-p", "--package", "-c", "--call"])))
        : { kind: "static" };
    case "uvx":
    case "pipx":
    case "uv": {
      const form = pythonRunnerForm(def);
      if (!form) {
        return { kind: "static" };
      }
      // `--from SPEC` with no command after it runs nothing nameable.
      return form.command === null && form.spec !== null
        ? {
            kind: "unpinned",
            reason: "the package runner names no command to run",
            howToPin: "name the command after the package (uvx --from name==1.2.3 command)",
          }
        : pypiSpec(form.spec, form.at);
    }
    case "docker":
    case "podman":
    case "nerdctl": {
      if (args[0] !== "run" && !(args[0] === "container" && args[1] === "run")) {
        return { kind: "static" };
      }
      const rest = args.slice(args[0] === "run" ? 1 : 2);
      const image = firstOperand(
        rest,
        new Set([
          "-e",
          "--env",
          "-v",
          "--volume",
          "--name",
          "--network",
          "-p",
          "--publish",
          "-w",
          "--workdir",
          "-u",
          "--user",
          "--entrypoint",
          "--env-file",
          "--mount",
          "--platform",
          "-l",
          "--label",
        ]),
      );
      const m = image ? /^(.+)@sha256:([0-9a-f]{64})$/.exec(image) : null;
      if (!m) {
        return {
          kind: "unpinned",
          reason: `the image ${JSON.stringify(image ?? "")} is resolved by its tag at every launch`,
          howToPin: "name the image by digest (image@sha256:<digest>)",
        };
      }
      return { kind: "static" };
    }
    case "deno": {
      // deno run fetches code from a URL, npm: or jsr: at every launch.
      // Any remote specifier counts, whatever the subcommand or its place
      // (deno run, deno serve, deno -A <url>, an --import-map URL, ...).
      const entry = args.find((a) => /^(https?:|npm:|jsr:)/i.test(a)) ?? null;
      if (entry) {
        return {
          kind: "unpinned",
          reason: `deno runs ${JSON.stringify(entry)}, fetched at every launch`,
          howToPin:
            "vendor the code into a local file (deno vendor / a local entry) and pin its tree",
        };
      }
      return { kind: "static" };
    }
    default:
      return { kind: "static" };
  }
}

/**
 * The admission's code decision for one candidate: null when it may start,
 * else why not (the record's pin, the launcher's measurement and the
 * definition must all name the same code).
 */
export function codePinProblem(
  def: McpServerDefinition,
  recordPin: McpCodePin | null | undefined,
  measured: McpCodePin | null | undefined,
): string | null {
  const r = codeResolution(def);
  if (r.kind === "static") {
    return null;
  }
  if (r.kind === "unpinned") {
    return `${r.reason}, so a changed release would run unseen; to pin it, ${r.howToPin}`;
  }
  const e = r.expected;
  if (!recordPin || !recordPin.integrity) {
    return `its admission record pins no content for ${e.name}@${e.version}; pin the package's integrity at admission`;
  }
  if (recordPin.kind !== e.kind || recordPin.name !== e.name || recordPin.version !== e.version) {
    return `its definition runs ${e.name}@${e.version}, but the admission record pins ${recordPin.name}@${recordPin.version}`;
  }
  if (!measured) {
    return `the launcher did not measure the code of ${e.name}@${e.version} it would start`;
  }
  if (
    measured.kind !== recordPin.kind ||
    measured.name !== recordPin.name ||
    measured.version !== recordPin.version ||
    measured.integrity !== recordPin.integrity
  ) {
    return `the code of ${e.name}@${e.version} the launcher fetched is not the code the admission record pins (its integrity differs)`;
  }
  return installedTreeProblem(e, recordPin, measured);
}

// The installed-tree part of an npm pin: all-or-nothing on both sides, so a
// record that pins only the tarball integrity does not admit a cached tree
// whose files were changed after the install (same version, same integrity).
function installedTreeProblem(
  e: Pick<McpCodePin, "name" | "version">,
  recordPin: McpCodePin,
  measured: McpCodePin,
): string | null {
  const fields = ["lockDigest", "treeDigest", "bin"] as const;
  const pinsTree = fields.some((f) => recordPin[f] !== undefined);
  const measuredTree = fields.some((f) => measured[f] !== undefined);
  if (!pinsTree && !measuredTree) {
    return null;
  }
  if (!pinsTree) {
    return `its admission record pins only the integrity of ${e.name}@${e.version}, not the installed tree the launcher would start; pin it again`;
  }
  if (!measuredTree) {
    return `the launcher did not measure the installed tree of ${e.name}@${e.version} the admission record pins`;
  }
  for (const f of fields) {
    if (typeof recordPin[f] !== "string" || recordPin[f] !== measured[f]) {
      return `the installed ${e.name}@${e.version} is not the tree the admission record pins (its ${f === "lockDigest" ? "lockfile" : f === "treeDigest" ? "files" : "bin"} differ${f === "bin" ? "s" : ""})`;
    }
  }
  return null;
}

// ─── The npx cache: what a package runner installed ─────────────────────

const NPM_NAME = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/;

/** npm's cache directory: `npm_config_cache` / `NPM_CONFIG_CACHE`, else `<home>/.npm`. */
export function npmCacheDir(
  env: Readonly<Record<string, string | undefined>>,
  home: string,
): string {
  const c = env.npm_config_cache || env.NPM_CONFIG_CACHE;
  return c ? path.resolve(c) : path.join(home, ".npm");
}

/** Stable JSON (sorted keys). */
function canonical(v: unknown): string {
  if (Array.isArray(v)) {
    return `[${v.map(canonical).join(",")}]`;
  }
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .toSorted()
      .map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v ?? null);
}

function readJson(p: string): Record<string, unknown> | null {
  try {
    const v: unknown = JSON.parse(fs.readFileSync(p, "utf8"));
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** The bin file npx would run for a package (package.json `bin`), relative to the package, or null. */
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

/** One cache entry (`<cache>/_npx/<hash>/`) that installed exactly NAME@VERSION, measured. */
export type NpxInstall = Readonly<{
  dir: string;
  integrity: string;
  lockDigest: string;
  treeDigest: string;
  bin: string;
}>;

/**
 * The entries of npm's npx cache that hold exactly `name@version`: their
 * package.json depends on the package, their lockfile installs exactly that version
 * with an integrity, and the package names a bin inside its own directory.
 * Each is measured (lockfile digest, tree digest of node_modules).
 */
export function npxInstalls(
  name: string,
  version: string,
  cacheDir: string,
  cache?: TreeHashCache,
): NpxInstall[] {
  const root = path.join(cacheDir, "_npx");
  let dirs: string[];
  try {
    dirs = fs.readdirSync(root).toSorted();
  } catch {
    return [];
  }
  const out: NpxInstall[] = [];
  for (const d of dirs) {
    const dir = path.join(root, d);
    const pj = readJson(path.join(dir, "package.json"));
    const deps = pj?.dependencies as Record<string, unknown> | undefined;
    // npx saves the spec as a range (^X.Y.Z); the lockfile says what was installed.
    if (!deps || typeof deps[name] !== "string") {
      continue;
    }
    const lock = readJson(path.join(dir, "package-lock.json"));
    const pkgs = lock?.packages as Record<string, Record<string, unknown> | null> | undefined;
    const entry = pkgs?.[`node_modules/${name}`];
    if (!pkgs || entry?.version !== version || typeof entry.integrity !== "string") {
      continue;
    }
    const pkgDir = path.join(dir, "node_modules", name);
    const bin = npmBin(pkgDir, name);
    // The bin must stay inside the package: `../../x` would run code the tree pin names elsewhere.
    if (!bin || path.relative(pkgDir, path.resolve(pkgDir, bin)).startsWith("..")) {
      continue;
    }
    const lockView = Object.fromEntries(
      Object.entries(pkgs).map(([k, v]) => [
        k,
        {
          version: v?.version ?? null,
          integrity: v?.integrity ?? null,
          resolved: v?.resolved ?? null,
        },
      ]),
    );
    let tree: string;
    try {
      tree = treeDigest(path.join(dir, "node_modules"), { cache }).digest;
    } catch {
      continue;
    }
    out.push({
      dir,
      integrity: entry.integrity,
      lockDigest: createHash("sha256").update(canonical(lockView)).digest("hex"),
      treeDigest: tree,
      bin,
    });
  }
  return out;
}

/**
 * Several cached copies of one release: at launch, the copy the record pins
 * is the one measured (the others are never started); at pin time they must
 * all be the same.
 */
export function pinnedCopy<
  T extends Readonly<{ integrity: string; lockDigest: string; treeDigest: string; bin: string }>,
>(installs: readonly T[], pinned: McpCodePin | null | undefined): T[] {
  if (!pinned || installs.length < 2) {
    return [...installs];
  }
  const same = installs.filter(
    (i) =>
      i.integrity === pinned.integrity &&
      i.lockDigest === pinned.lockDigest &&
      i.treeDigest === pinned.treeDigest &&
      i.bin === pinned.bin,
  );
  return same.length > 0 ? same.slice(0, 1) : [...installs];
}

export type NpxMeasurement =
  | Readonly<{
      ok: true;
      pin: McpCodePin;
      /** What to start instead of the runner: the verified tree's bin, with Node (the runner never resolves anything). */
      launch: Readonly<{ dir: string; script: string; args: readonly string[] }>;
    }>
  | Readonly<{
      ok: false;
      code: "not-npx" | "unpinned-form" | "not-installed" | "inconsistent-copies";
      reason: string;
    }>;

/**
 * Measure what an `npx -y NAME@X.Y.Z` definition would run, from npm's cache
 * (the launcher runs this at pin time and before every launch; codePinProblem
 * compares it with the record). Every cached copy of NAME@VERSION must be the
 * same tree; the measurement names the first.
 */
export function measureNpxPackage(
  def: McpServerDefinition,
  cacheDir: string | readonly string[],
  o: Readonly<{ pinned?: McpCodePin | null; hashCache?: TreeHashCache }> = {},
): NpxMeasurement {
  const cmd =
    typeof def.command === "string" ? path.basename(def.command).replace(/\.(exe|cmd)$/i, "") : "";
  if (cmd !== "npx") {
    return { ok: false, code: "not-npx", reason: "the definition is not started with npx" };
  }
  const r = codeResolution(def);
  if (r.kind !== "pinned-form" || r.expected.kind !== "npm") {
    return {
      ok: false,
      code: "unpinned-form",
      reason:
        r.kind === "unpinned" ? `${r.reason}; to pin it, ${r.howToPin}` : "npx names no package",
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
  // The first cache (in npm's precedence) that holds the package.
  let installs: NpxInstall[] = [];
  for (const dir of typeof cacheDir === "string" ? [cacheDir] : cacheDir) {
    installs = npxInstalls(name, version, dir, o.hashCache);
    if (installs.length > 0) {
      break;
    }
  }
  installs = pinnedCopy(installs, o.pinned);
  if (installs.length === 0) {
    return {
      ok: false,
      code: "not-installed",
      reason: `${name}@${version} is not installed in npx's cache, so what would run cannot be checked`,
    };
  }
  if (
    new Set(installs.map((i) => `${i.integrity} ${i.lockDigest} ${i.treeDigest} ${i.bin}`)).size > 1
  ) {
    return {
      ok: false,
      code: "inconsistent-copies",
      reason: `npx's cache holds different copies of ${name}@${version}; clear them and pin again`,
    };
  }
  const i = installs[0];
  const args = (def.args ?? []).map(String);
  const spec = args.findIndex((a) => a === `${name}@${version}`);
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
      script: path.join(i.dir, "node_modules", name, i.bin),
      args: spec >= 0 ? args.slice(spec + 1) : [],
    },
  };
}
