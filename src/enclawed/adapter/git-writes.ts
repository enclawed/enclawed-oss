// enclawed adapter kit: git commands that write only the repository's own
// refs, index, objects and the working tree of files git holds, and the one
// network read of a configured remote (fetch).
//
// Local writes run contained (./contained-exec.ts checkGit): the containment
// sees only the repository's own configuration (no global or system git
// config, no credentials, no network), refuses writes to files that configure
// what runs later (.git/hooks, .git/config except what git itself saves and
// the guard admits), and every project file git does not hold as it is now is
// snapshotted first. So what such a command changes can be put back:
//
//   switch -c / checkout -b / branch NAME   a new ref (reflog kept);
//   switch / checkout BRANCH                a checkout of an existing local
//                                           branch: git refuses to overwrite
//                                           local changes or untracked files,
//                                           and every file it may replace that
//                                           git does not hold as it is now was
//                                           snapshotted;
//   rm (no -f, no --cached)                 git removes only files identical
//                                           to HEAD's commit and the index, so
//                                           HEAD restores each one;
//   mv (no -f)                              a rename git refuses onto an
//                                           existing file;
//   restore --staged                        the index entry reset to HEAD (the
//                                           staged blob stays in the object
//                                           store, the working file unchanged);
//   stash / stash push                      changes saved as a stash commit
//                                           (reflog refs/stash), and snapshotted.
//
// Each only while the repository names nothing git could start for that
// command: every key of its configuration (and of each submodule's) is one
// git only reads as data, and no hook git may run for it is present. Measured
// on git v2.53: a superproject's switch to another branch, add, status and
// diff run each populated submodule's core.fsmonitor and post-index-change
// hook, so a submodule's configuration and hooks count as the repository's.
//
// fetch runs on the host (the containment has no network), so it is checked
// against everything git reads there: the session's environment (no GIT_*
// variable that changes what git runs or reads) and every configuration
// scope git itself lists (system, global, local, includes followed).

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { isInside, trustedBinary } from "./fs-probe.js";
import { moduleDirsOf } from "./git-programs.js";
import { isExecConfigPath } from "./rule-decisions.js";

// ─── Hooks ──────────────────────────────────────────────────────────────

/** Hooks no local command here runs: other commands' (push, rebase, am, merge) and the receiving side's. */
const NEVER_LOCAL = new Set([
  "pre-push",
  "pre-rebase",
  "applypatch-msg",
  "pre-applypatch",
  "post-applypatch",
  "pre-receive",
  "update",
  "proc-receive",
  "post-receive",
  "post-update",
  "push-to-checkout",
  "sendemail-validate",
  "p4-changelist",
  "p4-prepare-changelist",
  "p4-post-changelist",
  "p4-pre-submit",
  "post-merge",
  "pre-merge-commit",
]);
/** The hooks a commit runs. */
const COMMIT_HOOKS = new Set([
  "pre-commit",
  "prepare-commit-msg",
  "commit-msg",
  "post-commit",
  "post-rewrite",
]);

/**
 * Which hooks a git command may run, as a predicate. commit and revert: any
 * hook. The other writing commands here: any hook but the ones only other
 * commands run (an unknown name counts as one it may run). Reading
 * commands: none.
 */
export function hooksRunBy(sub: string): (hook: string) => boolean {
  // submodule status runs git inside each submodule: any of its hooks counts.
  if (sub === "commit" || sub === "revert" || sub === "submodule") {
    return () => true;
  }
  if (WRITE_SUBS.has(sub) || sub === "add" || sub === "fetch") {
    return (h) => !NEVER_LOCAL.has(h) && !COMMIT_HOOKS.has(h);
  }
  return () => false;
}

const WRITE_SUBS = new Set(["switch", "checkout", "branch", "rm", "mv", "restore", "stash"]);

// ─── The repository's configuration ─────────────────────────────────────

/** Config keys git only reads as data (no program, no hook, no driver, no pager, no include). */
const INERT_GIT_KEY =
  /^(?:core\.(?:repositoryformatversion|filemode|bare|logallrefupdates|ignorecase|precomposeunicode|symlinks|autocrlf|safecrlf|eol|quotepath|abbrev|compression)|user\.(?:name|email)|init\.defaultbranch|extensions\.\S+|remote\.[^\n]+\.(?:url|fetch|pushurl|tagopt|promisor|partialclonefilter)|branch\.[^\n]+\.(?:remote|merge|rebase)|submodule\.[^\n]+\.(?:url|active|branch|ignore|shallow)|color\.\S+|advice\.\S+|gc\.auto|i18n\.\S+)$/;

/** The repository's git directory (a .git directory above `cwd`; a .git file, a worktree, is not read here). */
export function gitDirFrom(cwd: string): string | null {
  for (let d = path.resolve(cwd); ; d = path.dirname(d)) {
    const g = path.join(d, ".git");
    try {
      return fs.statSync(g).isDirectory() ? g : null;
    } catch {
      /* go up */
    }
    if (path.dirname(d) === d) {
      return null;
    }
  }
}

/** Why one config file names something git could start (a key outside the inert list), or null. */
function configStarts(file: string, extra: RegExp | null, allowWorktree: boolean): string | null {
  let text: string;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "ENOENT" && !file.endsWith(`${path.sep}config`)
      ? null
      : `${path.basename(file)} could not be read`;
  }
  let section = "";
  for (const raw of text.split(/\r?\n/)) {
    const l = raw.trim();
    if (l === "" || l.startsWith("#") || l.startsWith(";")) {
      continue;
    }
    const head = /^\[\s*([A-Za-z0-9.-]+)(?:\s+"((?:[^"\\]|\\.)*)")?\s*\]\s*$/.exec(l);
    if (head) {
      section = head[2] !== undefined ? `${head[1]}.${head[2]}` : head[1];
      continue;
    }
    const kv = /^([A-Za-z][A-Za-z0-9-]*)\s*(?:=.*)?$/.exec(l);
    const key = `${section}.${kv?.[1] ?? "?"}`.toLowerCase();
    // A submodule's git directory names its work tree (git writes core.worktree there).
    if (allowWorktree && key === "core.worktree" && kv && !/\\\s*$/.test(l)) {
      continue;
    }
    if (!kv || /\\\s*$/.test(l) || (!INERT_GIT_KEY.test(key) && !(extra && extra.test(key)))) {
      return `its configuration sets ${key}`;
    }
  }
  return null;
}

/** The hooks present in `hooksDir` that `runs` says the command may run. */
function activeHook(hooksDir: string, runs: (h: string) => boolean): string | null {
  try {
    return (
      fs.readdirSync(hooksDir).find((h) => !h.endsWith(".sample") && runs(h.toLowerCase())) ?? null
    );
  } catch {
    return null; // no hooks directory
  }
}

/**
 * Why the repository holding `cwd` could make git start something for this
 * command (a key outside the inert list, a hook it may run, the same in any
 * submodule's git directory), or null. `extra`: keys the command never acts on.
 */
export function gitRepoStarts(
  cwd: string,
  extra: RegExp | null,
  runs: (hook: string) => boolean,
): string | null {
  const gitDir = gitDirFrom(cwd);
  if (!gitDir) {
    return "no repository Enclawed reads holds this directory";
  }
  const own =
    configStarts(path.join(gitDir, "config"), extra, false) ??
    configStarts(path.join(gitDir, "config.worktree"), extra, false);
  if (own) {
    return own;
  }
  const hook = activeHook(path.join(gitDir, "hooks"), runs);
  if (hook) {
    return `it holds the hook ${hook}`;
  }
  const modules = moduleDirsOf(gitDir);
  if (!modules) {
    return "it holds more submodules than Enclawed reads";
  }
  for (const m of modules) {
    const rel = path.relative(gitDir, m);
    const why = configStarts(path.join(m, "config"), extra, true);
    if (why) {
      return `its submodule ${rel}: ${why}`;
    }
    const h = activeHook(path.join(m, "hooks"), runs);
    if (h) {
      return `its submodule ${rel} holds the hook ${h}`;
    }
  }
  return null;
}

// ─── Arguments of the local writing commands ────────────────────────────

const REF_NAME = /^(?!-)(?!.*\.\.)(?!.*\/\/)(?!.*@\{)[A-Za-z0-9._/-]+(?<![./])$/;
const COMMIT_ID = /^[0-9a-f]{7,64}$/;

/** Does `gitDir` hold the ref `refs/<kind>/<name>` (loose or packed)? */
export function hasRef(gitDir: string, ref: string): boolean {
  if (!REF_NAME.test(ref)) {
    return false;
  }
  const common = commonDirOf(gitDir);
  try {
    if (fs.statSync(path.join(common, ...ref.split("/"))).isFile()) {
      return true;
    }
  } catch {
    /* not loose */
  }
  try {
    return fs
      .readFileSync(path.join(common, "packed-refs"), "utf8")
      .split("\n")
      .some((l) => l.endsWith(` ${ref}`));
  } catch {
    return false;
  }
}

function commonDirOf(gitDir: string): string {
  try {
    return path.resolve(gitDir, fs.readFileSync(path.join(gitDir, "commondir"), "utf8").trim());
  } catch {
    return gitDir;
  }
}

/** The submodule paths .gitmodules names (relative to the work tree's top). */
function submodulePaths(top: string): string[] {
  try {
    return [
      ...fs
        .readFileSync(path.join(top, ".gitmodules"), "utf8")
        .matchAll(/^\s*path\s*=\s*(.+?)\s*$/gm),
    ].map((m) => m[1]);
  } catch {
    return [];
  }
}

/** Is `abs`, or any file below it (bounded walk; past the bound: yes), a file that configures what runs later? */
function holdsExecConfig(abs: string): boolean {
  const stack = [abs];
  let budget = 20_000;
  while (stack.length) {
    const p = stack.pop() as string;
    if (budget-- <= 0 || isExecConfigPath(p) || isExecConfigPath(path.join(p, "x"))) {
      return true;
    }
    let st: fs.Stats;
    try {
      st = fs.lstatSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      try {
        for (const n of fs.readdirSync(p)) {
          stack.push(path.join(p, n));
        }
      } catch {
        return true;
      }
    }
  }
  return false;
}

export type LocalWriteCtx = Readonly<{
  projectDir: string;
  realpathNearest: (p: string) => string;
  /** Does the line change this path (or a path inside it) before git runs? Its content then is not known. */
  changed?: ((abs: string) => boolean) | null;
}>;

// ─── Staged changes no commit holds ─────────────────────────────────────

/** The pathspecs of a git add / restore argument list: the words that are not options, and every word after `--`. */
export function pathspecsOf(rest: readonly string[]): string[] {
  const dd = rest.indexOf("--");
  return [
    ...(dd < 0 ? rest : rest.slice(0, dd)).filter((a) => !a.startsWith("-")),
    ...(dd < 0 ? [] : rest.slice(dd + 1)),
  ];
}

/** git's object id of a blob with this content (sha1, or sha256 for a 64-digit id). */
function blobId(content: Buffer, like: string): string {
  return createHash(like.length === 64 ? "sha256" : "sha1")
    .update(`blob ${content.length}\0`)
    .update(content)
    .digest("hex");
}

/**
 * Which index entry an index-replacing command (git add, git restore
 * --staged) would lose: one matched by `pathspecs` (none: every entry) whose
 * staged content is neither the commit's (HEAD) nor the working file's, so
 * no commit and no file keeps it; or a conflicted entry. null: none would be
 * lost. Read with the system git (no hook, no fsmonitor, no configuration
 * but the repository's, no index refresh); unreadable counts as lost.
 */
export function stagedOnlyRefusal(
  dir: string,
  pathspecs: readonly string[],
  changed: ((abs: string) => boolean) | null,
  opts: { gitBin?: string | null } = {},
): string | null {
  const gitBin =
    opts.gitBin !== undefined
      ? opts.gitBin
      : process.platform === "win32"
        ? "git"
        : trustedBinary("git");
  if (!gitBin) {
    return "while the index could not be read";
  }
  const run = (args: string[]) =>
    spawnSync(
      gitBin,
      [
        "-c",
        "core.fsmonitor=false",
        "-c",
        "core.hooksPath=/dev/null",
        "-c",
        "core.untrackedCache=false",
        "-C",
        dir,
        ...args,
      ],
      {
        timeout: 10_000,
        env: {
          PATH: process.env.PATH ?? "/usr/bin:/bin",
          GIT_CONFIG_NOSYSTEM: "1",
          GIT_CONFIG_GLOBAL: "/dev/null",
          GIT_OPTIONAL_LOCKS: "0",
        },
        windowsHide: true,
        maxBuffer: 64 * 1024 * 1024,
      },
    );
  const specs = pathspecs.length ? ["--", ...pathspecs] : [];
  const top = run(["rev-parse", "--show-toplevel"]);
  const idx = run(["ls-files", "--stage", "-z", "--full-name", ...specs]);
  if (top.status !== 0 || idx.status !== 0) {
    return "while the index could not be read";
  }
  const topDir = top.stdout.toString("utf8").trim();
  const entries = idx.stdout
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .map((rec) => /^(\d+) ([0-9a-f]+) (\d)\t([\s\S]*)$/.exec(rec));
  if (entries.some((m) => !m)) {
    return "while the index could not be read";
  }
  if (!entries.length) {
    return null;
  }
  const head = new Map<string, string>();
  const tree = run(["ls-tree", "-r", "-z", "--full-tree", "HEAD"]);
  if (tree.status === 0) {
    for (const rec of tree.stdout.toString("utf8").split("\0").filter(Boolean)) {
      const m = /^\d+ \w+ ([0-9a-f]+)\t([\s\S]*)$/.exec(rec);
      if (m) {
        head.set(m[2], m[1]);
      }
    }
  }
  for (const m of entries) {
    const [, , oid, stage, rel] = m as RegExpExecArray;
    if (stage !== "0") {
      return `${rel}: a conflicted entry`;
    }
    if (head.get(rel) === oid) {
      continue;
    }
    const abs = path.join(topDir, ...rel.split("/"));
    let wt: string | null = null;
    if (!changed?.(abs)) {
      try {
        const st = fs.lstatSync(abs);
        if (st.isSymbolicLink()) {
          wt = blobId(Buffer.from(fs.readlinkSync(abs)), oid);
        } else if (st.isFile()) {
          wt = blobId(fs.readFileSync(abs), oid);
        }
      } catch {
        /* missing: the entry would be removed */
      }
    }
    if (wt !== oid) {
      return `${rel}: its staged content is in no commit and in no working file, and would be lost`;
    }
  }
  return null;
}

/**
 * A start point that sets up no tracking (so git writes no .git/config): an
 * existing local branch, HEAD, a commit id, or anything with --no-track.
 */
function startOk(gitDir: string, start: string | undefined, noTrack: boolean): boolean {
  if (start === undefined) {
    return true;
  }
  if (!REF_NAME.test(start) && !/^HEAD(?:~\d+|\^)*$/.test(start)) {
    return false;
  }
  return (
    noTrack ||
    /^HEAD(?:~\d+|\^)*$/.test(start) ||
    COMMIT_ID.test(start) ||
    hasRef(gitDir, `refs/heads/${start}`)
  );
}

/** Path operands of rm / mv / restore: inside the project, no .git, no submodule, no pathspec magic. */
function pathsOk(
  ctx: LocalWriteCtx,
  dir: string,
  top: string,
  files: readonly string[],
): string | null {
  const subs = submodulePaths(top).map((s) => path.resolve(top, s));
  for (const f of files) {
    if (f.startsWith(":")) {
      return `${f}: a pathspec with magic`;
    }
    const abs = path.resolve(dir, f);
    if (!isInside(ctx.projectDir, ctx.realpathNearest(abs))) {
      return `${f} is outside the project`;
    }
    if (abs.split(path.sep).some((s) => s.toLowerCase() === ".git")) {
      return `${f} is in the repository's git directory`;
    }
    if (subs.some((s) => isInside(abs, s) || isInside(s, abs))) {
      return `${f} is or holds a submodule`;
    }
  }
  return null;
}

/**
 * Why this local git write is not one Enclawed runs contained (null: it is,
 * as far as its arguments go; the repository check is gitRepoStarts).
 * `sub` is one of switch, checkout, branch, rm, mv, restore, stash.
 */
export function localGitWriteRefusal(
  sub: string,
  rest: readonly string[],
  dir: string,
  ctx: LocalWriteCtx,
): string | null {
  const gitDir = gitDirFrom(dir);
  if (!gitDir) {
    return "no repository Enclawed reads holds this directory";
  }
  const top = path.dirname(gitDir);
  const dd = rest.indexOf("--");
  const opts = (dd < 0 ? rest : rest.slice(0, dd)).filter((a) => a.startsWith("-"));
  const pos = [
    ...(dd < 0 ? rest : rest.slice(0, dd)).filter((a) => !a.startsWith("-")),
    ...(dd < 0 ? [] : rest.slice(dd + 1)),
  ];
  const only = (re: RegExp) => opts.every((o) => re.test(o));
  switch (sub) {
    case "switch":
    case "checkout":
    case "branch": {
      // The new branch's name is an option's value (-c NAME, -b NAME): read in order.
      const createFlag =
        sub === "switch" ? /^(?:-c|--create)$/ : sub === "checkout" ? /^-b$/ : null;
      const flags =
        sub === "branch"
          ? /^(?:--no-track|-q|--quiet)$/
          : /^(?:-q|--quiet|--no-track|--no-guess|-d|--detach|--progress|--no-progress)$/;
      let name: string | null = null;
      const operands: string[] = [];
      for (let i = 0; i < rest.length; i++) {
        const a = rest[i];
        if (a === "--") {
          return `git ${sub} with --`;
        }
        if (createFlag?.test(a)) {
          if (name !== null || i + 1 >= rest.length) {
            return `git ${sub} ${a} without one name`;
          }
          name = rest[++i];
        } else if (sub === "switch" && a.startsWith("--create=")) {
          name = a.slice("--create=".length);
        } else if (a.startsWith("-")) {
          if (!flags.test(a)) {
            return `git ${sub} ${a} is not a form Enclawed runs contained`;
          }
        } else {
          operands.push(a);
        }
      }
      const noTrack = rest.includes("--no-track");
      const detach = rest.includes("-d") || rest.includes("--detach");
      if (sub === "branch") {
        // branch NAME [START]: creates a ref (the list forms are read-only, decided elsewhere).
        if (operands.length < 1 || operands.length > 2 || !REF_NAME.test(operands[0])) {
          return "git branch other than creating one branch";
        }
        return startOk(gitDir, operands[1], noTrack)
          ? null
          : "git branch from a start point that would set up tracking (a config write)";
      }
      if (name !== null) {
        if (!REF_NAME.test(name) || detach || operands.length > 1) {
          return `git ${sub} creating a branch named ${name}`;
        }
        return startOk(gitDir, operands[0], noTrack)
          ? null
          : `git ${sub} from a start point that would set up tracking (a config write)`;
      }
      if (operands.length !== 1) {
        return `git ${sub} with ${operands.length} operands`;
      }
      if (detach) {
        return REF_NAME.test(operands[0]) || /^HEAD(?:~\d+|\^)*$/.test(operands[0])
          ? null
          : `git ${sub} --detach ${operands[0]}`;
      }
      // An existing local branch only: another name may create a tracking
      // branch (a config write) or, for checkout, name files to overwrite.
      return hasRef(gitDir, `refs/heads/${operands[0]}`)
        ? null
        : `git ${sub} ${operands[0]}, which is not an existing local branch`;
    }
    case "rm":
      // No -f (git then removes only what HEAD holds as it is), no --cached.
      if (!only(/^(?:-[rqn]+|--quiet|--dry-run|--ignore-unmatch)$/)) {
        return "git rm with an option that removes what no commit holds";
      }
      if (!pos.length) {
        return "git rm with no path";
      }
      // Removing a file that configures what runs later changes what runs, as writing it does.
      for (const f of pos) {
        const abs = path.resolve(dir, f);
        if (/[*?[]/.test(f)) {
          return `git rm ${f}: a pattern may match a file that configures what runs later`;
        }
        if (holdsExecConfig(abs)) {
          return `git rm removes ${f}, which configures what runs later (or holds such a file)`;
        }
      }
      return pathsOk(ctx, dir, top, pos);
    case "mv": {
      if (!only(/^(?:-[vnk]+|--verbose|--dry-run)$/) || pos.length < 2) {
        return "git mv with -f or without a source and a destination";
      }
      const bad = pathsOk(ctx, dir, top, pos);
      if (bad) {
        return bad;
      }
      for (const f of pos) {
        if (/[*?[]/.test(f)) {
          return `git mv ${f}: a pattern`;
        }
      }
      for (const f of pos.slice(0, -1)) {
        if (holdsExecConfig(path.resolve(dir, f))) {
          return `git mv moves ${f}, which configures what runs later (or holds such a file)`;
        }
      }
      if (isExecConfigPath(path.resolve(dir, pos[pos.length - 1]))) {
        return `git mv onto ${pos[pos.length - 1]}, a place that configures what runs later`;
      }
      const dest = path.resolve(dir, pos[pos.length - 1]);
      for (const s of pos.slice(0, -1)) {
        if (isExecConfigPath(path.join(dest, path.basename(s)))) {
          return `git mv into ${pos[pos.length - 1]}, a place that configures what runs later`;
        }
      }
      return null;
    }
    case "restore":
      if (
        !(rest.includes("--staged") || rest.includes("-S")) ||
        !only(/^(?:--staged|-S|-q|--quiet)$/)
      ) {
        return "git restore other than --staged (it would overwrite working files)";
      }
      if (!pos.length) {
        return "git restore with no path";
      }
      return (
        pathsOk(ctx, dir, top, pos) ??
        (() => {
          // restore --staged sets each entry back to the commit's: a staged
          // change the working file does not hold would be lost.
          const lost = stagedOnlyRefusal(dir, pos, ctx.changed ?? null);
          return lost ? `git restore --staged ${lost}` : null;
        })()
      );
    case "stash":
      // push and save make commits (refs/stash): a commit is the person's approval point.
      return rest[0] === undefined || rest[0] === "push" || rest[0] === "save"
        ? "git stash makes commits: a commit is the person's approval point, so it asks"
        : `git stash ${rest[0]} is not a form Enclawed runs contained`;
    default:
      return `git ${sub} is not a git command Enclawed runs contained`;
  }
}

export const LOCAL_WRITE_SUBS: ReadonlySet<string> = WRITE_SUBS;

// ─── fetch ──────────────────────────────────────────────────────────────

/** One configuration entry as git lists it, with its scope (system, global, local, worktree, command). */
export type GitConfigEntry = Readonly<{ scope: string; key: string; value: string | null }>;

export type FetchCtx = Readonly<{
  projectDir: string;
  realpathNearest: (p: string) => string;
  /** The session's environment, the one the fetch runs with; null: unknown, refused. */
  environment: Readonly<Record<string, string>> | null;
  /** Every configuration entry git reads for this git directory (all scopes, includes followed), or null. */
  configOf: ((gitDir: string) => readonly GitConfigEntry[] | null) | null;
  /** The operator's host allowlist; null: none (any https host). */
  allowedHosts: ReadonlySet<string> | null;
}>;

// GIT_* variables that change nothing fetch runs, reads or sends.
const FETCH_SAFE_GIT_ENV = new Set([
  "GIT_TERMINAL_PROMPT",
  "GIT_EDITOR",
  "GIT_SEQUENCE_EDITOR",
  "GIT_PAGER",
  "GIT_MERGE_AUTOEDIT",
  "GIT_OPTIONAL_LOCKS",
  "GIT_CONFIG_NOSYSTEM",
  "GIT_AUTHOR_NAME",
  "GIT_AUTHOR_EMAIL",
  "GIT_AUTHOR_DATE",
  "GIT_COMMITTER_NAME",
  "GIT_COMMITTER_EMAIL",
  "GIT_COMMITTER_DATE",
]);

/** Why a configuration entry lets fetch start a program, reach somewhere else or load something, or null. */
function fetchEntryRefusal(e: GitConfigEntry): string | null {
  const k = e.key.toLowerCase();
  const v = (e.value ?? "").trim();
  if (
    /^credential\.(?:.+\.)?helper$/.test(k) ||
    /^core\.(?:askpass|sshcommand|gitproxy|alternaterefscommand|hookspath)$/.test(k) ||
    (k === "core.fsmonitor" && !/^(?:true|false|yes|no|on|off|1|0)?$/i.test(v)) ||
    /^(?:ssh|protocol|url|hook|bundle|trace2)\./.test(k) ||
    /^(?:fetch|transfer)\.bundleuri$/.test(k) ||
    /^gc\.(?:recentobjectshook|repackfilterto)$/.test(k) ||
    k === "uploadpack.packobjectshook" ||
    (k === "promisor.acceptfromserver" && v.toLowerCase() !== "none") ||
    /^remote\..+\.(?:uploadpack|receivepack|vcs|proxy)$/.test(k)
  ) {
    return `${e.scope} configuration sets ${e.key}`;
  }
  return null;
}

/** The host of an https URL with no credentials in it, or null. */
function httpsHost(url: string): string | null {
  const m = /^https:\/\/([A-Za-z0-9.-]+)(?::\d+)?(?:\/[^\s?#]*)?$/.exec(url);
  return m ? m[1].toLowerCase() : null;
}

const FETCH_FLAG =
  /^(?:-[qvtn46]+|--quiet|--verbose|--progress|--no-progress|--unshallow|--tags|--no-tags|--dry-run|--no-write-fetch-head|--atomic|--all|--multiple|--no-auto-gc|--no-auto-maintenance|--show-forced-updates|--no-show-forced-updates|--ipv4|--ipv6|--no-recurse-submodules|--recurse-submodules=no|--(?:depth|deepen|jobs)=\d+)$/;

/**
 * Why `git ARGS` (ARGS after `git`, run in `cwd`) is not a fetch from a
 * configured https remote that starts nothing, or null when it is. What it
 * writes is the repository's objects and remote-tracking refs (kept in their
 * reflog); what it sends is git's negotiation for the remote's own refs.
 */
export function gitFetchRefusal(
  args: readonly string[],
  cwd: string,
  ctx: FetchCtx,
): string | null {
  let dir = cwd;
  let i = 0;
  for (; i < args.length && args[i].startsWith("-"); i++) {
    if (args[i] === "-C" && i + 1 < args.length) {
      dir = path.resolve(dir, args[++i]);
    } else if (args[i] !== "--no-pager") {
      return `git ${args[i]} before fetch`;
    }
  }
  if (args[i] !== "fetch") {
    return "not git fetch";
  }
  const rest = args.slice(i + 1);
  const env = ctx.environment;
  if (!env) {
    return "the session's environment is not known";
  }
  const bad = Object.keys(env).find((n) => n.startsWith("GIT_") && !FETCH_SAFE_GIT_ENV.has(n));
  if (bad) {
    return `the session's environment sets ${bad}`;
  }
  const gitDir = gitDirFrom(dir);
  if (!gitDir || !isInside(ctx.projectDir, ctx.realpathNearest(path.dirname(gitDir)))) {
    return "the repository is not the project's";
  }
  const pos: string[] = [];
  for (let k = 0; k < rest.length; k++) {
    const a = rest[k];
    if (a === "--") {
      return "git fetch with --";
    }
    if (
      (a === "--depth" || a === "--deepen" || a === "-j" || a === "--jobs") &&
      /^\d+$/.test(rest[k + 1] ?? "")
    ) {
      k++;
    } else if (a.startsWith("-")) {
      if (!FETCH_FLAG.test(a)) {
        return `git fetch ${a} is not a form Enclawed allows without a person`;
      }
    } else {
      pos.push(a);
    }
  }
  const configOf = ctx.configOf;
  const entries = configOf?.(gitDir) ?? null;
  if (!entries) {
    return "the repository's git configuration could not be listed";
  }
  for (const e of entries) {
    const why = fetchEntryRefusal(e);
    if (why) {
      return why;
    }
  }
  const urlsOf = (es: readonly GitConfigEntry[], r: string) =>
    es
      .filter((e) => e.key.toLowerCase() === `remote.${r.toLowerCase()}.url`)
      .map((e) => e.value ?? "");
  const all = rest.includes("--all");
  const multiple = rest.includes("--multiple");
  let remotes: string[];
  let refs: string[] = [];
  if (all) {
    if (pos.length) {
      return "git fetch --all with operands";
    }
    remotes = [
      ...new Set(
        entries.flatMap((e) => {
          const m = /^remote\.(.+)\.url$/i.exec(e.key);
          return m ? [m[1]] : [];
        }),
      ),
    ];
  } else if (multiple) {
    remotes = pos;
  } else if (pos.length) {
    [remotes, refs] = [[pos[0]], pos.slice(1)];
  } else {
    // The current branch's remote, else origin.
    let head = "";
    try {
      head = fs.readFileSync(path.join(gitDir, "HEAD"), "utf8").trim();
    } catch {
      return "the repository's HEAD could not be read";
    }
    const branch = /^ref: refs\/heads\/(.+)$/.exec(head)?.[1];
    const r = branch
      ? entries.findLast((e) => e.key.toLowerCase() === `branch.${branch.toLowerCase()}.remote`)
      : undefined;
    remotes = [r?.value ?? "origin"];
  }
  if (!remotes.length) {
    return "no remote to fetch";
  }
  for (const r of remotes) {
    const urls = urlsOf(entries, r);
    if (!urls.length) {
      return `${r} is not a configured remote (a URL given to fetch is the agent's)`;
    }
    for (const u of urls) {
      const host = httpsHost(u);
      if (!host) {
        return `remote ${r} is not a plain https URL`;
      }
      if (ctx.allowedHosts && !ctx.allowedHosts.has(host)) {
        return `remote ${r} is on ${host}, which is not on enclawed.policy.allowedHosts`;
      }
    }
  }
  // Ref names are sent to the remote: only names of its refs this repository already knows.
  for (const ref of refs) {
    const name = ref.replace(/^refs\/(?:heads|tags)\//, "");
    if (
      !hasRef(gitDir, `refs/remotes/${remotes[0]}/${name}`) &&
      !hasRef(gitDir, `refs/tags/${name}`)
    ) {
      return `${ref} is not a ref of ${remotes[0]} this repository knows`;
    }
  }
  const runs = hooksRunBy("fetch");
  const hook = activeHook(path.join(commonDirOf(gitDir), "hooks"), runs);
  if (hook) {
    return `the repository holds the hook ${hook}`;
  }
  // Submodules: fetched too (on demand) unless recursion is off; each then counts as the repository.
  const recurseOff =
    rest.includes("--no-recurse-submodules") ||
    rest.includes("--recurse-submodules=no") ||
    entries
      .filter((e) => e.key.toLowerCase() === "fetch.recursesubmodules")
      .findLast(() => true)
      ?.value?.match(/^(?:false|no|off|0)$/i) != null;
  const modules = moduleDirsOf(gitDir);
  if (!modules) {
    return "it holds more submodules than Enclawed reads";
  }
  if (!recurseOff) {
    for (const m of modules) {
      const es = configOf?.(m) ?? null;
      if (!es) {
        return `the submodule ${path.relative(gitDir, m)}'s configuration could not be listed`;
      }
      for (const e of es) {
        const why = fetchEntryRefusal(e);
        if (why) {
          return `submodule ${path.relative(gitDir, m)}: ${why}`;
        }
      }
      for (const u of es.filter((e) => /^remote\..+\.url$/i.test(e.key))) {
        const host = httpsHost(u.value ?? "");
        if (!host || (ctx.allowedHosts && !ctx.allowedHosts.has(host))) {
          return `submodule ${path.relative(gitDir, m)} fetches from a URL Enclawed does not allow`;
        }
      }
      const h = activeHook(path.join(m, "hooks"), runs);
      if (h) {
        return `submodule ${path.relative(gitDir, m)} holds the hook ${h}`;
      }
    }
  }
  return null;
}
