// User workspace / state directory resolver.
//
// The enclawed fork's default user-data directory is `~/.enclawed/`. For
// existing installs and upstream OpenClaw users, `~/.openclaw/` continues to
// work as a portability fallback. Resolution precedence (highest first):
//
//   1. `$ENCLAWED_STATE_DIR` (or legacy `$OPENCLAW_STATE_DIR`) env var.
//      This is the pre-existing override consulted by test harnesses and
//      explicit deployments; both names continue to work via the
//      `mirrorBrandEnv()` alias mirror.
//
//      NOTE on `ENCLAWED_WORKSPACE_DIR`: that name already designates the
//      *project* workspace dir for docker-setup and live-test scripts (see
//      `docker-compose.yml` and `scripts/test-live-*-docker.sh`), where it
//      defaults to `$HOME/.openclaw/workspace`. We deliberately do NOT
//      reuse it for the user state dir to avoid silently breaking those
//      harnesses if someone sets `ENCLAWED_WORKSPACE_DIR=/path/to/project`.
//      Use `ENCLAWED_STATE_DIR` for state-dir overrides instead.
//   2. The directory pointed to by `$ENCLAWED_CONFIG_PATH` (legacy
//      `$OPENCLAW_CONFIG_PATH`), when set explicitly.
//   3. A `agent.workspace` (or top-level `workspace`) key inside either
//      `~/.enclawed/enclawed.json` or `~/.openclaw/openclaw.json`, when set.
//   4. `~/.enclawed/` if it already exists on disk.
//   5. `~/.openclaw/` if `~/.enclawed/` does NOT exist but `~/.openclaw/` does
//      (portability fallback for existing installs).
//   6. New install: `~/.enclawed/` (the directory will be created on first
//      use by the caller).
//
// Configuration filename selection follows the same idea:
//   * `~/.enclawed/enclawed.json` is the new default;
//   * `~/.openclaw/openclaw.json` continues to work as a fallback;
//   * if both exist, prefer `~/.enclawed/enclawed.json`.
//
// Existing `OPENCLAW_*` env-var users and `~/.openclaw/` installs MUST keep
// working unchanged — no deprecation warnings, no rewrites of on-disk files.
//
// This module deliberately has no logger import to avoid bootstrap cycles
// (it is loaded extremely early). Use `formatResolutionLog()` and have the
// caller emit through the project's normal logger.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveHomeRelativePath, resolveRequiredHomeDir } from "./home-dir.js";
import { isPlainObject } from "./plain-object.js";

export const ENCLAWED_DIR_NAME = ".enclawed";
export const OPENCLAW_DIR_NAME = ".openclaw";
export const ENCLAWED_CONFIG_FILENAME = "enclawed.json";
export const OPENCLAW_CONFIG_FILENAME = "openclaw.json";

export type WorkspaceDirRule =
  | "env_state_dir"
  | "env_config_path"
  | "config_key"
  | "enclawed_exists"
  | "openclaw_fallback"
  | "new_install_default";

export interface WorkspaceDirResolution {
  /** Absolute path the runtime should use as the user workspace / state dir. */
  path: string;
  /** Which precedence rule fired. */
  rule: WorkspaceDirRule;
  /** Whether the resolver had to fall back to the legacy `~/.openclaw` dir. */
  usingLegacyDir: boolean;
}

export interface ResolveWorkspaceDirOptions {
  env?: NodeJS.ProcessEnv;
  homedir?: () => string;
  /** Filesystem probe — injected for tests. Defaults to `fs.existsSync`. */
  existsSync?: (target: string) => boolean;
  /** Slim JSON reader — injected for tests. Defaults to `fs.readFileSync`. */
  readFileSync?: (target: string, encoding: "utf8") => string;
}

function readEnv(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const value = env[key];
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function expand(value: string, env: NodeJS.ProcessEnv, homedir: () => string): string {
  return resolveHomeRelativePath(value, { env, homedir });
}

function readWorkspaceFromConfig(
  configPath: string,
  readFileSync: (target: string, encoding: "utf8") => string,
): string | undefined {
  let raw: string;
  try {
    raw = readFileSync(configPath, "utf8");
  } catch {
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!isPlainObject(parsed)) {
    return undefined;
  }
  const agent = (parsed as Record<string, unknown>).agent;
  if (isPlainObject(agent)) {
    const candidate = (agent as Record<string, unknown>).workspace;
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  const topLevel = (parsed as Record<string, unknown>).workspace;
  if (typeof topLevel === "string" && topLevel.trim()) {
    return topLevel.trim();
  }
  return undefined;
}

/**
 * Resolve the user workspace / state directory. Returns the chosen absolute
 * path together with the rule that fired, so callers can log the decision.
 *
 * This function does not create the directory; if rule `new_install_default`
 * fires, the caller is responsible for creating `~/.enclawed/` on first use.
 */
export function resolveWorkspaceDirInfo(
  options: ResolveWorkspaceDirOptions = {},
): WorkspaceDirResolution {
  const env = options.env ?? process.env;
  const homedir = options.homedir ?? os.homedir;
  const existsSync = options.existsSync ?? fs.existsSync;
  const readFileSync =
    options.readFileSync ??
    ((target: string, encoding: "utf8") => fs.readFileSync(target, encoding));

  // 1. ENCLAWED_STATE_DIR / OPENCLAW_STATE_DIR (pre-existing override).
  //    `ENCLAWED_WORKSPACE_DIR` is intentionally NOT consulted here — that
  //    name already designates the project-workspace dir for docker-compose
  //    and live-test scripts. See the header comment.
  const stateEnv = readEnv(env, "ENCLAWED_STATE_DIR") ?? readEnv(env, "OPENCLAW_STATE_DIR");
  if (stateEnv) {
    return {
      path: expand(stateEnv, env, homedir),
      rule: "env_state_dir",
      usingLegacyDir: false,
    };
  }

  // 2. ENCLAWED_CONFIG_PATH / OPENCLAW_CONFIG_PATH
  const configPathEnv =
    readEnv(env, "ENCLAWED_CONFIG_PATH") ?? readEnv(env, "OPENCLAW_CONFIG_PATH");
  if (configPathEnv) {
    return {
      path: path.dirname(expand(configPathEnv, env, homedir)),
      rule: "env_config_path",
      usingLegacyDir: false,
    };
  }

  const home = resolveRequiredHomeDir(env, homedir);
  const enclawedDir = path.join(home, ENCLAWED_DIR_NAME);
  const openclawDir = path.join(home, OPENCLAW_DIR_NAME);

  const enclawedConfig = path.join(enclawedDir, ENCLAWED_CONFIG_FILENAME);
  const openclawConfig = path.join(openclawDir, OPENCLAW_CONFIG_FILENAME);

  // 3. agent.workspace key in either config file (new wins on tie).
  const configForKey = safeExists(existsSync, enclawedConfig)
    ? enclawedConfig
    : safeExists(existsSync, openclawConfig)
      ? openclawConfig
      : undefined;
  if (configForKey) {
    const fromConfig = readWorkspaceFromConfig(configForKey, readFileSync);
    if (fromConfig) {
      return {
        path: expand(fromConfig, env, homedir),
        rule: "config_key",
        usingLegacyDir: false,
      };
    }
  }

  // 4. ~/.enclawed exists -> use it.
  if (safeExists(existsSync, enclawedDir)) {
    return {
      path: enclawedDir,
      rule: "enclawed_exists",
      usingLegacyDir: false,
    };
  }

  // 5. ~/.openclaw fallback for existing installs.
  if (safeExists(existsSync, openclawDir)) {
    return {
      path: openclawDir,
      rule: "openclaw_fallback",
      usingLegacyDir: true,
    };
  }

  // 6. New install default.
  return {
    path: enclawedDir,
    rule: "new_install_default",
    usingLegacyDir: false,
  };
}

function safeExists(existsSync: (target: string) => boolean, target: string): boolean {
  try {
    return existsSync(target);
  } catch {
    return false;
  }
}

/**
 * Resolve the path to the default config file (`enclawed.json` in the new
 * tree, falling back to `openclaw.json` in the legacy `~/.openclaw` dir if
 * present). The chosen filename matches the directory: `~/.enclawed/` ->
 * `enclawed.json`, `~/.openclaw/` -> `openclaw.json`.
 *
 * Precedence:
 *   1. `~/.enclawed/enclawed.json` if it exists on disk.
 *   2. `~/.openclaw/openclaw.json` if it exists on disk and (1) does not.
 *   3. `<resolved workspace dir>/enclawed.json` (new-install default; same
 *      filename also applies if the resolver picked a custom directory via
 *      env var, since that directory does not commit to a legacy filename).
 *   4. If the resolved workspace is the legacy `~/.openclaw/` dir, prefer
 *      `openclaw.json` inside it so legacy installs keep their filename.
 */
export function resolveDefaultConfigPath(
  options: ResolveWorkspaceDirOptions = {},
): { path: string; rule: WorkspaceDirRule | "explicit_enclawed_config" | "explicit_openclaw_config" } {
  const env = options.env ?? process.env;
  const homedir = options.homedir ?? os.homedir;
  const existsSync = options.existsSync ?? fs.existsSync;

  const home = resolveRequiredHomeDir(env, homedir);
  const enclawedConfig = path.join(home, ENCLAWED_DIR_NAME, ENCLAWED_CONFIG_FILENAME);
  const openclawConfig = path.join(home, OPENCLAW_DIR_NAME, OPENCLAW_CONFIG_FILENAME);

  // Honor an explicit ENCLAWED_CONFIG_PATH / OPENCLAW_CONFIG_PATH override.
  const configPathEnv =
    readEnv(env, "ENCLAWED_CONFIG_PATH") ?? readEnv(env, "OPENCLAW_CONFIG_PATH");
  if (configPathEnv) {
    return {
      path: expand(configPathEnv, env, homedir),
      rule: "env_config_path",
    };
  }

  if (safeExists(existsSync, enclawedConfig)) {
    return { path: enclawedConfig, rule: "explicit_enclawed_config" };
  }
  if (safeExists(existsSync, openclawConfig)) {
    return { path: openclawConfig, rule: "explicit_openclaw_config" };
  }

  // Neither exists: pick the filename that matches the resolver's directory.
  const workspace = resolveWorkspaceDirInfo(options);
  const filename = workspace.usingLegacyDir ? OPENCLAW_CONFIG_FILENAME : ENCLAWED_CONFIG_FILENAME;
  return { path: path.join(workspace.path, filename), rule: workspace.rule };
}

/** Human-readable rule -> short reason string for log messages. */
export function formatRuleReason(rule: WorkspaceDirResolution["rule"]): string {
  switch (rule) {
    case "env_state_dir":
      return "$ENCLAWED_STATE_DIR set";
    case "env_config_path":
      return "$ENCLAWED_CONFIG_PATH set";
    case "config_key":
      return "agent.workspace key in config";
    case "enclawed_exists":
      return "~/.enclawed/ exists";
    case "openclaw_fallback":
      return "~/.enclawed/ missing, ~/.openclaw/ present (legacy fallback)";
    case "new_install_default":
      return "new install — defaulting to ~/.enclawed/";
  }
}

let resolutionLogged = false;

/**
 * Reset the once-only log latch. Test-only.
 */
export function _resetWorkspaceDirLogStateForTesting(): void {
  resolutionLogged = false;
}

/**
 * Emit an info-level log line describing which workspace dir was chosen and
 * which rule fired. Idempotent: a second call is a no-op so we don't spam
 * downstream subsystems that import `utils.ts` lazily.
 *
 * The actual logger is injected to avoid a static circular import between
 * `utils.ts` (which exposes the resolver) and `logger.ts` (which imports
 * widely from the project).
 */
export function logWorkspaceDirResolution(
  resolution: WorkspaceDirResolution,
  logInfo: (message: string) => void,
): void {
  if (resolutionLogged) {
    return;
  }
  resolutionLogged = true;
  const legacy = resolution.usingLegacyDir ? " [legacy fallback]" : "";
  logInfo(
    `workspace-dir: using ${resolution.path}${legacy} (${formatRuleReason(resolution.rule)})`,
  );
}
