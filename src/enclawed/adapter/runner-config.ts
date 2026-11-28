// enclawed adapter kit: where the package runners keep what they installed,
// and which package index a Python runner reads, as the runners themselves
// resolve it: a command-line option, then the environment, then their config
// files (project, user, system), then the platform default (Linux, macOS and
// Windows layouts). Config files are only read.
//
// A location only says where to LOOK: whatever is found there is measured by
// content and must match the signed pin, and the launcher starts the measured
// tree. So every candidate is kept, in the runner's precedence order, and the
// first one that holds the install is measured (a wrong guess can only fail
// to find an install, never admit one).
//
//   npm        --cache, npm_config_cache, <project>/.npmrc, user .npmrc
//              (npm_config_userconfig), global npmrc, ~/.npm | %LOCALAPPDATA%\npm-cache
//   pnpm       --cache-dir, npm_config_cache_dir, pnpm-workspace.yaml
//              cacheDir, <project>/.npmrc cache-dir, pnpm's global rc, user
//              .npmrc, ~/.cache/pnpm | ~/Library/Caches/pnpm | %LOCALAPPDATA%\pnpm-cache
//   bun        BUN_INSTALL_CACHE_DIR, ./bunfig.toml and the global
//              .bunfig.toml [install.cache] dir, $BUN_INSTALL/install/cache
//   yarn       YARN_CACHE_FOLDER / YARN_GLOBAL_FOLDER, .yarnrc.yml
//              cacheFolder / globalFolder (every one from the project up),
//              ~/.yarn/berry | %LOCALAPPDATA%\Yarn\Berry (yarn dlx keeps no
//              tree there; it is measured through npx's)
//   uv         --cache-dir, UV_CACHE_DIR, uv.toml / pyproject.toml [tool.uv]
//              cache-dir (project, except for uvx / uv tool run, which read
//              no project configuration; then user, then system; --no-config and
//              UV_NO_CONFIG skip them, --config-file / UV_CONFIG_FILE names
//              one), ~/.cache/uv | %LOCALAPPDATA%\uv\cache
//   pipx       PIPX_HOME's .cache and pipx's user cache directory
//   deno       DENO_DIR, ~/.cache/deno | ~/Library/Caches/deno | %LOCALAPPDATA%\deno
//   indexes    uvx / uv tool run: --index-url / --default-index / --index /
//              --extra-index-url, UV_DEFAULT_INDEX / UV_INDEX_URL / UV_INDEX /
//              UV_EXTRA_INDEX_URL, uv.toml index-url / extra-index-url /
//              [[index]]; pipx run: --index-url, PIP_INDEX_URL /
//              PIP_EXTRA_INDEX_URL, pip.conf / pip.ini [install] then [global]

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import YAML from "yaml";

/** Where the package runners keep what they installed, each list in the runner's precedence order. */
export type RunnerCaches = Readonly<{
  npm: readonly string[];
  pnpm: readonly string[];
  bun: readonly string[];
  yarn: readonly string[];
  uv: readonly string[];
  pipx: readonly string[];
  deno: string;
  uid: number;
}>;

type Env = Readonly<Record<string, string | undefined>>;

export type RunnerConfigOptions = Readonly<{
  /** The server's working directory (project config files are found from it). */
  cwd?: string;
  /** The definition (its runner options name caches and indexes). */
  def?: Readonly<{ command?: unknown; args?: readonly unknown[] }>;
}>;

const readText = (p: string): string | null => {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return null;
  }
};

/** `${VAR}` from the environment, as npm and pnpm expand config values. */
const expandVars = (v: string, env: Env) =>
  v.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, k: string) => env[k] ?? "");

/** An npmrc / pip.conf style file: `key = value` per section ("" before any section). */
export function parseIni(text: string): Map<string, Map<string, string>> {
  const out = new Map<string, Map<string, string>>([["", new Map()]]);
  let section = out.get("")!;
  let last: string | null = null;
  for (const raw of text.split(/\r?\n/)) {
    if (/^\s*[#;]/.test(raw) || !raw.trim()) {
      last = raw.trim() ? last : null;
      continue;
    }
    // pip.conf continuation lines (an indented value under the previous key).
    if (/^\s+\S/.test(raw) && last !== null && !raw.includes("=")) {
      section.set(last, `${section.get(last) ?? ""}\n${raw.trim()}`);
      continue;
    }
    const sec = /^\s*\[([^\]]+)\]\s*$/.exec(raw);
    if (sec) {
      const name = sec[1].trim().toLowerCase();
      section = out.get(name) ?? new Map();
      out.set(name, section);
      last = null;
      continue;
    }
    const kv = /^\s*([^=]+?)\s*[=:]\s*(.*?)\s*$/.exec(raw);
    if (kv) {
      let v = kv[2];
      if (/^"(.*)"$/.test(v) || /^'(.*)'$/.test(v)) {
        v = v.slice(1, -1);
      }
      last = kv[1].toLowerCase().replace(/_/g, "-");
      section.set(last, v);
    }
  }
  return out;
}

function tomlString(v: string): string | null {
  const t = v.trim();
  if (t.startsWith('"')) {
    const m = /^"((?:[^"\\]|\\.)*)"/.exec(t);
    return m
      ? m[1].replace(/\\(["\\/bfnrt])/g, (_, c: string) =>
          c === "n" ? "\n" : c === "t" ? "\t" : c === "b" || c === "f" || c === "r" ? "" : c,
        )
      : null;
  }
  if (t.startsWith("'")) {
    const m = /^'([^']*)'/.exec(t);
    return m ? m[1] : null;
  }
  return null;
}

/**
 * The string and boolean values of a TOML document by dotted key (tables,
 * dotted keys, one-line inline tables); `[[name]]` tables come back as
 * `name[i].key`. Enough for the runners' config files, which are only read.
 */
export function parseTomlStrings(text: string): Map<string, string | boolean> {
  const out = new Map<string, string | boolean>();
  const counts = new Map<string, number>();
  let prefix = "";
  const put = (key: string, value: string) => {
    const s = tomlString(value);
    if (s !== null) {
      out.set(key, s);
      return;
    }
    const t = value.trim();
    if (t === "true" || t === "false") {
      out.set(key, t === "true");
      return;
    }
    const inline = /^\{(.*)\}\s*(#.*)?$/.exec(t);
    if (inline) {
      for (const part of inline[1].split(/,(?=(?:[^"']*["'][^"']*["'])*[^"']*$)/)) {
        const kv = /^\s*([A-Za-z0-9_.-]+)\s*=\s*(.+?)\s*$/.exec(part);
        if (kv) {
          put(`${key}.${kv[1]}`, kv[2]);
        }
      }
    }
  };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const arr = /^\[\[\s*([A-Za-z0-9_.-]+)\s*\]\]/.exec(line);
    if (arr) {
      const n = counts.get(arr[1]) ?? 0;
      counts.set(arr[1], n + 1);
      prefix = `${arr[1]}[${n}].`;
      continue;
    }
    const tbl = /^\[\s*([A-Za-z0-9_."-]+)\s*\]/.exec(line);
    if (tbl) {
      prefix = `${tbl[1].replace(/"/g, "")}.`;
      continue;
    }
    const kv = /^([A-Za-z0-9_."-]+)\s*=\s*(.+)$/.exec(line);
    if (kv) {
      put(`${prefix}${kv[1].replace(/"/g, "")}`, kv[2]);
    }
  }
  return out;
}

/** A runner option's value in the definition's arguments (`--opt X` or `--opt=X`). */
function optionValue(args: readonly string[], names: readonly string[]): string | null {
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--") {
      break;
    }
    for (const n of names) {
      if (a === n && args[i + 1] !== undefined) {
        return args[i + 1];
      }
      if (a.startsWith(`${n}=`)) {
        return a.slice(n.length + 1);
      }
    }
  }
  return null;
}

function optionValues(args: readonly string[], names: readonly string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--") {
      break;
    }
    for (const n of names) {
      if (a === n && args[i + 1] !== undefined) {
        out.push(args[i + 1]);
      } else if (a.startsWith(`${n}=`)) {
        out.push(a.slice(n.length + 1));
      }
    }
  }
  return out;
}

/** The directories from `dir` up to the filesystem root. */
function upward(dir: string, p: typeof path.posix): string[] {
  const out: string[] = [];
  let d = p.resolve(dir);
  for (;;) {
    out.push(d);
    const up = p.dirname(d);
    if (up === d) {
      return out;
    }
    d = up;
  }
}

type Platform = NodeJS.Platform;

/** The platform's base directories (Windows: %LOCALAPPDATA% / %APPDATA%; macOS: ~/Library). */
function baseDirs(env: Env, home: string, platform: Platform) {
  const p = platform === "win32" ? path.win32 : path.posix;
  const localAppData = env.LOCALAPPDATA || p.join(home, "AppData", "Local");
  const appData = env.APPDATA || p.join(home, "AppData", "Roaming");
  const xdgCache = env.XDG_CACHE_HOME || p.join(home, ".cache");
  const xdgConfig = env.XDG_CONFIG_HOME || p.join(home, ".config");
  const xdgData = env.XDG_DATA_HOME || p.join(home, ".local", "share");
  return { p, localAppData, appData, xdgCache, xdgConfig, xdgData };
}

const uniq = (xs: readonly (string | null | undefined)[]) => [
  ...new Set(xs.filter((x): x is string => typeof x === "string" && x !== "")),
];

/** A config value naming a directory: `~` is home, `${VAR}` expands, a relative path is against `rel`. */
function dirValue(
  v: string | null | undefined,
  env: Env,
  home: string,
  rel: string,
  p: typeof path.posix,
) {
  if (typeof v !== "string" || !v.trim()) {
    return null;
  }
  const x = expandVars(v.trim(), env);
  if (x === "~" || x.startsWith("~/") || x.startsWith("~\\")) {
    return p.join(home, x.slice(1));
  }
  return p.resolve(rel, x);
}

// ─── npm and pnpm ───────────────────────────────────────────────────────

/** npm's project directory: the nearest directory up from cwd with a package.json or node_modules. */
function npmLocalPrefix(cwd: string, p: typeof path.posix): string {
  for (const d of upward(cwd, p)) {
    if (fs.existsSync(p.join(d, "package.json")) || fs.existsSync(p.join(d, "node_modules"))) {
      return d;
    }
  }
  return cwd;
}

function npmrcValue(file: string | null, key: string): string | null {
  if (!file) {
    return null;
  }
  const t = readText(file);
  return t === null ? null : (parseIni(t).get("")?.get(key) ?? null);
}

function envAny(env: Env, ...names: string[]): string | null {
  for (const n of names) {
    const v = env[n];
    if (typeof v === "string" && v !== "") {
      return v;
    }
  }
  // npm reads its variables case-insensitively.
  const lower = new Set(names.map((n) => n.toLowerCase()));
  for (const [k, v] of Object.entries(env).toSorted(([a], [b]) => (a < b ? -1 : 1))) {
    if (lower.has(k.toLowerCase()) && typeof v === "string" && v !== "") {
      return v;
    }
  }
  return null;
}

function npmCaches(
  env: Env,
  home: string,
  platform: Platform,
  cwd: string,
  args: readonly string[],
) {
  const { p, localAppData } = baseDirs(env, home, platform);
  const prefix = npmLocalPrefix(cwd, p);
  const userrc =
    envAny(env, "npm_config_userconfig", "NPM_CONFIG_USERCONFIG") ?? p.join(home, ".npmrc");
  const globalPrefix =
    envAny(env, "npm_config_prefix", "NPM_CONFIG_PREFIX") ??
    (platform === "win32" ? p.dirname(process.execPath) : p.dirname(p.dirname(process.execPath)));
  const globalrc =
    envAny(env, "npm_config_globalconfig", "NPM_CONFIG_GLOBALCONFIG") ??
    p.join(globalPrefix, "etc", "npmrc");
  const files = [p.join(prefix, ".npmrc"), userrc, globalrc];
  return {
    p,
    prefix,
    files,
    dirs: uniq([
      dirValue(optionValue(args, ["--cache"]), env, home, cwd, p),
      dirValue(envAny(env, "npm_config_cache", "NPM_CONFIG_CACHE"), env, home, cwd, p),
      ...files.map((f) => dirValue(npmrcValue(f, "cache"), env, home, cwd, p)),
      platform === "win32" ? p.join(localAppData, "npm-cache") : p.join(home, ".npm"),
    ]),
  };
}

function pnpmCaches(
  env: Env,
  home: string,
  platform: Platform,
  cwd: string,
  args: readonly string[],
) {
  const { p, localAppData, xdgCache, xdgConfig } = baseDirs(env, home, platform);
  const npm = npmCaches(env, home, platform, cwd, []);
  let workspace: string | null = null;
  for (const d of upward(cwd, p)) {
    const f = p.join(d, "pnpm-workspace.yaml");
    const t = readText(f);
    if (t !== null) {
      try {
        const y = YAML.parse(t) as { cacheDir?: unknown } | null;
        workspace = dirValue(typeof y?.cacheDir === "string" ? y.cacheDir : null, env, home, d, p);
      } catch {
        // An unreadable workspace file names no cache.
      }
      break;
    }
  }
  const globalRc =
    platform === "win32"
      ? p.join(localAppData, "pnpm", "config", "rc")
      : platform === "darwin"
        ? p.join(home, "Library", "Preferences", "pnpm", "rc")
        : p.join(xdgConfig, "pnpm", "rc");
  return uniq([
    dirValue(optionValue(args, ["--cache-dir"]), env, home, cwd, p),
    dirValue(
      envAny(
        env,
        "pnpm_config_cache_dir",
        "npm_config_cache_dir",
        "NPM_CONFIG_CACHE_DIR",
        "PNPM_CACHE_DIR",
      ),
      env,
      home,
      cwd,
      p,
    ),
    workspace,
    dirValue(npmrcValue(npm.files[0], "cache-dir"), env, home, cwd, p),
    dirValue(npmrcValue(globalRc, "cache-dir"), env, home, cwd, p),
    dirValue(npmrcValue(npm.files[1], "cache-dir"), env, home, cwd, p),
    platform === "win32"
      ? p.join(localAppData, "pnpm-cache")
      : platform === "darwin"
        ? p.join(home, "Library", "Caches", "pnpm")
        : p.join(xdgCache, "pnpm"),
  ]);
}

// ─── bun and yarn ───────────────────────────────────────────────────────

function bunfigCacheDir(file: string, env: Env, home: string, p: typeof path.posix): string | null {
  const t = readText(file);
  if (t === null) {
    return null;
  }
  const v = parseTomlStrings(t);
  const dir = v.get("install.cache.dir") ?? v.get("install.cache");
  return typeof dir === "string" ? dirValue(dir, env, home, p.dirname(file), p) : null;
}

function bunCaches(env: Env, home: string, platform: Platform, cwd: string) {
  const { p, xdgCache } = baseDirs(env, home, platform);
  const bunInstall = env.BUN_INSTALL || p.join(home, ".bun");
  const tmp =
    env.TMPDIR || env.TEMP || env.TMP || (platform === process.platform ? os.tmpdir() : null);
  return uniq([
    dirValue(env.BUN_INSTALL_CACHE_DIR, env, home, cwd, p),
    bunfigCacheDir(p.join(cwd, "bunfig.toml"), env, home, p),
    bunfigCacheDir(p.join(env.XDG_CONFIG_HOME || home, ".bunfig.toml"), env, home, p),
    p.join(bunInstall, "install", "cache"),
    p.join(xdgCache, ".bun", "install", "cache"),
    tmp,
  ]);
}

function yarnCaches(env: Env, home: string, platform: Platform, cwd: string) {
  const { p, localAppData } = baseDirs(env, home, platform);
  const fromFiles: (string | null)[] = [];
  let globalFolder: string | null = null;
  // Yarn reads every .yarnrc.yml from the project up, and the home one; the nearest wins.
  for (const d of uniq([...upward(cwd, p), home])) {
    const t = readText(p.join(d, ".yarnrc.yml"));
    if (t === null) {
      continue;
    }
    try {
      const y = YAML.parse(t) as { cacheFolder?: unknown; globalFolder?: unknown } | null;
      fromFiles.push(
        dirValue(typeof y?.cacheFolder === "string" ? y.cacheFolder : null, env, home, d, p),
      );
      globalFolder ??= dirValue(
        typeof y?.globalFolder === "string" ? y.globalFolder : null,
        env,
        home,
        d,
        p,
      );
    } catch {
      // An unreadable file names no cache.
    }
  }
  const global =
    dirValue(env.YARN_GLOBAL_FOLDER, env, home, cwd, p) ??
    globalFolder ??
    (platform === "win32" ? p.join(localAppData, "Yarn", "Berry") : p.join(home, ".yarn", "berry"));
  return uniq([
    dirValue(env.YARN_CACHE_FOLDER, env, home, cwd, p),
    ...fromFiles,
    p.join(global, "cache"),
  ]);
}

// ─── uv and pipx ────────────────────────────────────────────────────────

/** A uv tool run (uvx, uv tool run): uv reads no project configuration for it. */
function isUvTool(def: RunnerConfigOptions["def"]): boolean {
  const cmd =
    typeof def?.command === "string"
      ? (def.command.split(/[\\/]/).pop() ?? "").replace(/\.(cmd|exe|bat)$/i, "")
      : "";
  const a = (def?.args ?? []).map(String);
  return cmd === "uvx" || (cmd === "uv" && a[0] === "tool" && a[1] === "run");
}

/** uv's config files in its precedence order (project, unless a tool run; user; system), unless switched off. */
function uvConfigFiles(
  env: Env,
  home: string,
  platform: Platform,
  cwd: string,
  args: readonly string[],
  tool: boolean,
) {
  const { p, appData, xdgConfig } = baseDirs(env, home, platform);
  if (args.includes("--no-config") || /^(1|true)$/i.test(env.UV_NO_CONFIG ?? "")) {
    return [];
  }
  const named = optionValue(args, ["--config-file"]) ?? env.UV_CONFIG_FILE;
  if (named) {
    return [{ file: p.resolve(cwd, named), table: "" }];
  }
  const out: { file: string; table: string }[] = [];
  for (const d of tool ? [] : upward(cwd, p)) {
    if (fs.existsSync(p.join(d, "uv.toml"))) {
      out.push({ file: p.join(d, "uv.toml"), table: "" });
      break;
    }
    const py = readText(p.join(d, "pyproject.toml"));
    if (py !== null && /^\s*\[tool\.uv(\.|\])/m.test(py)) {
      out.push({ file: p.join(d, "pyproject.toml"), table: "tool.uv." });
      break;
    }
  }
  out.push({
    file:
      platform === "win32" ? p.join(appData, "uv", "uv.toml") : p.join(xdgConfig, "uv", "uv.toml"),
    table: "",
  });
  if (platform === "win32") {
    out.push({ file: p.join(env.PROGRAMDATA || "C:\\ProgramData", "uv", "uv.toml"), table: "" });
  } else {
    for (const d of (env.XDG_CONFIG_DIRS || "/etc/xdg").split(":").filter(Boolean)) {
      out.push({ file: p.join(d, "uv", "uv.toml"), table: "" });
    }
    out.push({ file: "/etc/uv/uv.toml", table: "" });
  }
  return out;
}

function tomlOf(file: string) {
  const t = readText(file);
  return t === null ? null : parseTomlStrings(t);
}

function uvCaches(
  env: Env,
  home: string,
  platform: Platform,
  cwd: string,
  args: readonly string[],
  tool: boolean,
) {
  const { p, localAppData, xdgCache } = baseDirs(env, home, platform);
  const fromFiles = uvConfigFiles(env, home, platform, cwd, args, tool).map(({ file, table }) => {
    const v = tomlOf(file)?.get(`${table}cache-dir`);
    return typeof v === "string" ? dirValue(v, env, home, p.dirname(file), p) : null;
  });
  return uniq([
    dirValue(optionValue(args, ["--cache-dir"]), env, home, cwd, p),
    dirValue(env.UV_CACHE_DIR, env, home, cwd, p),
    ...fromFiles,
    platform === "win32" ? p.join(localAppData, "uv", "cache") : p.join(xdgCache, "uv"),
  ]);
}

function pipxCaches(env: Env, home: string, platform: Platform) {
  const { p, localAppData, xdgCache, xdgData } = baseDirs(env, home, platform);
  const homes = env.PIPX_HOME
    ? [env.PIPX_HOME]
    : platform === "win32"
      ? [p.join(home, "pipx"), p.join(localAppData, "pipx", "pipx")]
      : platform === "darwin"
        ? [p.join(home, ".local", "pipx"), p.join(home, "Library", "Application Support", "pipx")]
        : [p.join(home, ".local", "pipx"), p.join(xdgData, "pipx")];
  const userCache =
    platform === "win32"
      ? p.join(localAppData, "pipx", "pipx", "Cache")
      : platform === "darwin"
        ? p.join(home, "Library", "Caches", "pipx")
        : p.join(xdgCache, "pipx");
  return uniq([userCache, ...homes.map((h) => p.join(h, ".cache"))]);
}

function denoDir(env: Env, home: string, platform: Platform, cwd: string): string {
  const { p, localAppData, xdgCache } = baseDirs(env, home, platform);
  return (
    dirValue(env.DENO_DIR, env, home, cwd, p) ??
    (platform === "win32"
      ? p.join(localAppData, "deno")
      : platform === "darwin"
        ? p.join(home, "Library", "Caches", "deno")
        : p.join(xdgCache, "deno"))
  );
}

const argsOf = (o: RunnerConfigOptions) => (o.def?.args ?? []).map(String);

/** The runners' cache directories for a server, from its environment, its options and the runners' config files. */
export function runnerCacheDirs(
  env: Env,
  home: string,
  platform: Platform = process.platform,
  o: RunnerConfigOptions = {},
): RunnerCaches {
  const p = platform === "win32" ? path.win32 : path.posix;
  const cwd = o.cwd ? p.resolve(o.cwd) : home;
  const args = argsOf(o);
  return {
    npm: npmCaches(env, home, platform, cwd, args).dirs,
    pnpm: pnpmCaches(env, home, platform, cwd, args),
    bun: bunCaches(env, home, platform, cwd),
    yarn: yarnCaches(env, home, platform, cwd),
    uv: uvCaches(env, home, platform, cwd, args, isUvTool(o.def)),
    pipx: pipxCaches(env, home, platform),
    deno: denoDir(env, home, platform, cwd),
    uid: typeof process.getuid === "function" ? process.getuid() : 0,
  };
}

// ─── Python indexes ─────────────────────────────────────────────────────

const PYPI = "https://pypi.org/simple/";

/** pip's config files, lowest precedence first (global, user, site, PIP_CONFIG_FILE). */
function pipConfigFiles(env: Env, home: string, platform: Platform): string[] {
  const { p, appData, xdgConfig } = baseDirs(env, home, platform);
  if (env.PIP_CONFIG_FILE && /^(os\.devnull|nul|\/dev\/null)$/i.test(env.PIP_CONFIG_FILE)) {
    return [];
  }
  const global =
    platform === "win32"
      ? [p.join(env.PROGRAMDATA || "C:\\ProgramData", "pip", "pip.ini")]
      : platform === "darwin"
        ? ["/Library/Application Support/pip/pip.conf", "/etc/pip.conf"]
        : [
            ...(env.XDG_CONFIG_DIRS || "/etc/xdg")
              .split(":")
              .filter(Boolean)
              .map((d) => p.join(d, "pip", "pip.conf")),
            "/etc/pip.conf",
          ];
  const user =
    platform === "win32"
      ? [p.join(home, "pip", "pip.ini"), p.join(appData, "pip", "pip.ini")]
      : platform === "darwin"
        ? [
            p.join(home, ".pip", "pip.conf"),
            p.join(home, "Library", "Application Support", "pip", "pip.conf"),
            p.join(xdgConfig, "pip", "pip.conf"),
          ]
        : [p.join(home, ".pip", "pip.conf"), p.join(xdgConfig, "pip", "pip.conf")];
  const site = env.VIRTUAL_ENV
    ? [p.join(env.VIRTUAL_ENV, platform === "win32" ? "pip.ini" : "pip.conf")]
    : [];
  return [...global, ...user, ...site, ...(env.PIP_CONFIG_FILE ? [env.PIP_CONFIG_FILE] : [])];
}

const asIndex = (u: string) => u.trim().replace(/\/?$/, "/");

/**
 * The package indexes a Python runner would read for a definition, most
 * preferred first (uv's extra indexes come before its default one; pip
 * merges all, so any one may serve the release). The adapter reads them at
 * pin time only.
 */
export function pythonIndexUrls(
  def: Readonly<{ command?: unknown; args?: readonly unknown[] }>,
  env: Env,
  home: string,
  platform: Platform = process.platform,
  o: Readonly<{ cwd?: string }> = {},
): string[] {
  const args = (def.args ?? []).map(String);
  const cmd =
    typeof def.command === "string"
      ? (def.command.split(/[\\/]/).pop() ?? "").replace(/\.(cmd|exe|bat)$/i, "")
      : "";
  const p = platform === "win32" ? path.win32 : path.posix;
  const cwd = o.cwd ? p.resolve(o.cwd) : home;
  const split = (v: string | undefined | null) => (v ?? "").split(/\s+/).filter(Boolean);
  if (cmd === "pipx") {
    let index = optionValue(args, ["--index-url", "-i"]) ?? env.PIP_INDEX_URL ?? null;
    let extras = [...optionValues(args, ["--extra-index-url"]), ...split(env.PIP_EXTRA_INDEX_URL)];
    if (!index || extras.length === 0) {
      let fileIndex: string | null = null;
      let fileExtras: string[] = [];
      for (const f of pipConfigFiles(env, home, platform)) {
        const t = readText(f);
        if (t === null) {
          continue;
        }
        const ini = parseIni(t);
        for (const sec of ["global", "install"]) {
          const s = ini.get(sec);
          fileIndex = s?.get("index-url") ?? fileIndex;
          fileExtras = s?.has("extra-index-url") ? split(s.get("extra-index-url")) : fileExtras;
        }
      }
      index ??= fileIndex;
      extras = extras.length ? extras : fileExtras;
    }
    return uniq([asIndex(index ?? PYPI), ...extras.map(asIndex)]);
  }
  // uvx / uv tool run (uv's "first index" order: named and extra indexes, then the default).
  const cliDefault = optionValue(args, ["--default-index", "--index-url", "-i"]);
  const cliExtra = [
    ...optionValues(args, ["--index"]),
    ...optionValues(args, ["--extra-index-url"]),
  ];
  const envDefault = env.UV_DEFAULT_INDEX || env.UV_INDEX_URL || null;
  const envExtra = [...split(env.UV_INDEX), ...split(env.UV_EXTRA_INDEX_URL)].map((x) =>
    x.includes("=") && !/^[a-z]+:/i.test(x) ? x.slice(x.indexOf("=") + 1) : x,
  );
  let fileDefault: string | null = null;
  const fileExtra: string[] = [];
  for (const { file, table } of uvConfigFiles(env, home, platform, cwd, args, true)) {
    const v = tomlOf(file);
    if (!v) {
      continue;
    }
    const idx = v.get(`${table}index-url`);
    if (typeof idx === "string") {
      fileDefault ??= idx;
    }
    const extra = v.get(`${table}extra-index-url`);
    if (typeof extra === "string") {
      fileExtra.push(extra);
    }
    for (let i = 0; v.has(`${table}index[${i}].url`); i++) {
      const url = v.get(`${table}index[${i}].url`);
      if (typeof url === "string") {
        if (v.get(`${table}index[${i}].default`) === true) {
          fileDefault ??= url;
        } else {
          fileExtra.push(url);
        }
      }
    }
  }
  return uniq(
    [...cliExtra, ...envExtra, ...fileExtra, cliDefault ?? envDefault ?? fileDefault ?? PYPI].map(
      asIndex,
    ),
  );
}
