// Periodic check: is the locally-installed enclawed-oss tree behind
// origin/main? Runs in-process on a low cadence (~once every 12h by
// default) and emits a verdict the daily loop turns into an email to
// the principal when an update is available. The secretary never
// applies the update itself — that is `Update-EnclawedApp secretary`,
// which the operator runs deliberately and which re-runs the
// adversarial gate. This file only detects + notifies.
//
// What this is NOT:
//   * a full clone health check (no fsck, no working-tree verify);
//   * an auto-updater (we explicitly do not modify the running tree);
//   * a release-channel manager (one branch — main — by design).
//
// The check is fail-closed in the safety direction: any unexpected
// git failure returns kind=error, the daily loop logs it once, and
// the next tick retries.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

export type UpdateCheckResult =
  | Readonly<{ kind: "current"; localRev: string }>
  | Readonly<{
      kind: "behind";
      localRev: string;
      remoteRev: string;
      commitsBehind: number;
    }>
  | Readonly<{ kind: "error"; reason: string }>
  | Readonly<{ kind: "unavailable"; reason: string }>;

const DEFAULT_FETCH_TIMEOUT_MS = 8_000;
const DEFAULT_REVPARSE_TIMEOUT_MS = 2_000;
const DEFAULT_REMOTE = "origin";
const DEFAULT_BRANCH = "main";

/**
 * Wraps a subprocess launch so the caller can route it through the
 * enclawed gate (SPAWN_PROC). `label` is a short human tag for the audit
 * target; `run` performs the actual spawn and resolves with its result.
 * The default passthrough runs `run` directly — used by the unit tests,
 * which exercise the git plumbing without a gate.
 */
export type GatedSpawn = <T>(label: string, run: () => Promise<T>) => Promise<T>;

const PASSTHROUGH_SPAWN: GatedSpawn = (_label, run) => run();

/**
 * Compare the locally-checked-out HEAD of `repoRoot` against the tip of
 * `<remote>/<branch>`. Performs a shallow fetch first so the comparison
 * uses the freshest remote ref. Pure git plumbing; safe to call from a
 * background timer.
 */
export async function checkForUpdates(opts: {
  repoRoot: string;
  remote?: string;
  branch?: string;
  fetchTimeoutMs?: number;
  revParseTimeoutMs?: number;
  /**
   * Optional gate wrapper. When supplied, every git/which subprocess this
   * check launches is dispatched through it (the daily-loop wires this to
   * SkillGate.dispatch as SPAWN_PROC). When omitted, spawns run directly.
   */
  gatedSpawn?: GatedSpawn;
}): Promise<UpdateCheckResult> {
  const repoRoot = opts.repoRoot;
  const remote = opts.remote ?? DEFAULT_REMOTE;
  const branch = opts.branch ?? DEFAULT_BRANCH;
  const fetchTimeoutMs = opts.fetchTimeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;
  const revParseTimeoutMs = opts.revParseTimeoutMs ?? DEFAULT_REVPARSE_TIMEOUT_MS;
  const gatedSpawn = opts.gatedSpawn ?? PASSTHROUGH_SPAWN;

  const git = await resolveGit(gatedSpawn);
  if (!git) {
    return Object.freeze({
      kind: "unavailable" as const,
      reason:
        "git not found on PATH and not in any canonical install " +
        "location (Program Files / Program Files (x86) / /usr/bin). " +
        "Install git, or add its bin directory to the launcher's PATH, " +
        "to enable self-update notifications.",
    });
  }

  const fetchRes = await runGit(
    git,
    ["-C", repoRoot, "fetch", "--depth=1", remote, branch],
    fetchTimeoutMs,
    gatedSpawn,
  );
  if (!fetchRes.ok) {
    return Object.freeze({
      kind: "error" as const,
      reason: `git fetch failed: ${fetchRes.reason}`,
    });
  }

  const localRes = await runGit(
    git,
    ["-C", repoRoot, "rev-parse", "HEAD"],
    revParseTimeoutMs,
    gatedSpawn,
  );
  if (!localRes.ok) {
    return Object.freeze({
      kind: "error" as const,
      reason: `git rev-parse HEAD failed: ${localRes.reason}`,
    });
  }
  const localRev = localRes.stdout.trim();

  const remoteRes = await runGit(
    git,
    ["-C", repoRoot, "rev-parse", `${remote}/${branch}`],
    revParseTimeoutMs,
    gatedSpawn,
  );
  if (!remoteRes.ok) {
    return Object.freeze({
      kind: "error" as const,
      reason: `git rev-parse ${remote}/${branch} failed: ${remoteRes.reason}`,
    });
  }
  const remoteRev = remoteRes.stdout.trim();

  if (localRev === remoteRev) {
    return Object.freeze({ kind: "current" as const, localRev });
  }

  const countRes = await runGit(
    git,
    ["-C", repoRoot, "rev-list", "--count", `HEAD..${remote}/${branch}`],
    revParseTimeoutMs,
    gatedSpawn,
  );
  // If we cannot count (e.g. local branch is on a divergent line), still
  // report behind with commitsBehind=0 — the operator should run update
  // anyway because the SHA differs.
  const commitsBehind = countRes.ok ? Number.parseInt(countRes.stdout.trim(), 10) || 0 : 0;

  return Object.freeze({
    kind: "behind" as const,
    localRev,
    remoteRev,
    commitsBehind,
  });
}

type GitResult =
  | Readonly<{ ok: true; stdout: string }>
  | Readonly<{ ok: false; reason: string }>;

function runGit(
  git: string,
  args: ReadonlyArray<string>,
  timeoutMs: number,
  gatedSpawn: GatedSpawn = PASSTHROUGH_SPAWN,
): Promise<GitResult> {
  // The git subcommand (fetch/rev-parse/rev-list) tags the audit target.
  // Every call is built as ["-C", repoRoot, <subcommand>, ...], so the
  // subcommand is at index 2.
  const label = `git ${args[2] ?? args[0] ?? "git"}`;
  return gatedSpawn(label, () => new Promise<GitResult>((resolve) => {
    const child = spawn(git, [...args], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const settleOk = (out: string) => {
      if (settled) {return;}
      settled = true;
      resolve(Object.freeze({ ok: true as const, stdout: out }));
    };
    const settleErr = (msg: string) => {
      if (settled) {return;}
      settled = true;
      try {
        child.kill("SIGKILL");
      } catch {
        // child already exited; nothing to do.
      }
      resolve(Object.freeze({ ok: false as const, reason: msg }));
    };
    const timer = setTimeout(
      () => settleErr(`timeout after ${timeoutMs}ms`),
      timeoutMs,
    );
    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      settleErr(`spawn error: ${err.message}`);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        settleOk(stdout);
      } else {
        settleErr(`exit ${code}: ${stderr.trim().slice(0, 200)}`);
      }
    });
  }));
}

// Cached resolved git binary path. `undefined` = not yet resolved;
// `null` = resolution failed (git not installed / not on launcher
// PATH and not in any canonical location); string = absolute path.
// The cache survives for the lifetime of the process so the check
// does not pay a `where`/`which` spawn cost on every tick.
let gitPathCache: string | null | undefined = undefined;

async function resolveGit(gatedSpawn: GatedSpawn = PASSTHROUGH_SPAWN): Promise<string | null> {
  if (gitPathCache !== undefined) {return gitPathCache;}

  // First: try PATH via `where` (Windows) / `which` (Unix). The
  // background scheduled-task / launchd / systemd PATH usually has
  // less in it than an interactive shell, so this may legitimately
  // fail on machines where the operator installed git only to a
  // user-profile location not propagated to the service PATH.
  const finder = process.platform === "win32" ? "where" : "which";
  const fromPath = await gatedSpawn(`${finder} git`, () => new Promise<string | null>((resolve) => {
    let settled = false;
    const child = spawn(finder, ["git"], { stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    const done = (v: string | null) => {
      if (settled) {return;}
      settled = true;
      resolve(v);
    };
    child.stdout?.on("data", (chunk) => {
      out += chunk.toString("utf8");
    });
    child.on("error", () => done(null));
    child.on("close", (code) => {
      if (code === 0) {
        const firstLine = out.split(/\r?\n/)[0]?.trim();
        done(firstLine && firstLine.length > 0 ? firstLine : null);
      } else {
        done(null);
      }
    });
  }));
  if (fromPath && existsSync(fromPath)) {
    gitPathCache = fromPath;
    return fromPath;
  }

  // Fallback: probe the canonical install locations the Git for
  // Windows installer uses (both 64-bit and 32-bit Program Files,
  // plus the cmd/ shim some installers prefer). Linux/macOS distro
  // packages are always on /usr/bin or /usr/local/bin so the PATH
  // probe above covers them; this fallback is only for Windows
  // services whose PATH was pruned.
  const candidates =
    process.platform === "win32"
      ? [
          "C:\\Program Files\\Git\\bin\\git.exe",
          "C:\\Program Files\\Git\\cmd\\git.exe",
          "C:\\Program Files (x86)\\Git\\bin\\git.exe",
          "C:\\Program Files (x86)\\Git\\cmd\\git.exe",
        ]
      : ["/usr/bin/git", "/usr/local/bin/git", "/opt/homebrew/bin/git"];
  for (const c of candidates) {
    if (existsSync(c)) {
      gitPathCache = c;
      return c;
    }
  }

  gitPathCache = null;
  return null;
}

/** Test seam: clear the resolved-git cache so a unit test can re-run
 *  the resolution from a fresh state. Not part of the runtime API. */
export function _resetResolvedGitForTests(): void {
  gitPathCache = undefined;
}

/**
 * Resolve the repo root the update check should look at. Order:
 *   1. ENCLAWED_REPO_ROOT env var (set by the launcher at install time).
 *   2. process.cwd() (the launcher cwds to the workspace root before
 *      exec, so this is correct when the secretary is started via the
 *      generated launcher.mjs).
 */
export function resolveRepoRoot(env: NodeJS.ProcessEnv = process.env): string {
  const fromEnv = env.ENCLAWED_REPO_ROOT?.trim();
  if (fromEnv) {return fromEnv;}
  return process.cwd();
}
