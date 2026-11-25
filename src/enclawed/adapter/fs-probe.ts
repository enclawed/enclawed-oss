// enclawed adapter kit: the filesystem facts the engine decides on, behind
// one interface (FsProbe) so the decisions stay testable. nodeFsProbe() is
// the real implementation.
//
// Ported from codenclawed's paths.mjs, links.mjs, secrets.mjs, trusted-bin.mjs
// and gate.mjs (gitTracking).

import { spawnSync, type SpawnSyncOptions, type SpawnSyncReturns } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { inNonInitialUserNamespace } from "../hardware-root/userns.js";
import { gitProgramsOf, type GitProgram } from "./git-programs.js";

/** How git sees a file: tracked, untracked, ignored, outside any work tree, or unknown (git missing or failed). */
export type GitTracking = "tracked" | "untracked" | "ignored" | "no-repo" | "unknown";

/** What Enclawed protects from the agent: its own state, policy, audit log, history and code. */
export type ProtectedSet = Readonly<{
  /** Files and directories (absolute). */
  paths: readonly string[];
  /** Files named `<basename>*` inside `dir` (a latch file and its siblings). */
  prefixes: readonly { dir: string; basename: string }[];
  /** Paths a shell command may name without being refused (a directory the agent legitimately lists). */
  mentionExempt?: readonly string[];
  /** The adapter's own state (audit log, session, policy, latch files): indexed first, so a small walk covers it. */
  statePaths?: readonly string[];
  /** An index of the protected inodes written at launch (writeProtectedInodeIndex), used while its digest matches. */
  inodeIndex?: Readonly<{ file: string; digest: string }>;
}>;

/**
 * What a write target that is also another file is. "protected-unknown": the
 * protected trees were too large to rule its inode out; `match` is then the
 * project's exec-config file it is, when it is one. "exec-config": it is one
 * of the project's files that configure what runs later (by inode).
 */
export type HardLinkVerdict =
  | null
  | Readonly<{ kind: "protected"; nlink: number; match: string }>
  | Readonly<{ kind: "protected-unknown"; nlink: number; match: string | null }>
  | Readonly<{ kind: "exec-config"; nlink: number; match: string }>
  | Readonly<{ kind: "multiply-linked"; nlink: number; complete?: boolean }>;

/** Where to look for the exec-config file a hard-linked target may be. */
export type ExecConfigScope = Readonly<{
  projectDir: string;
  isExecConfig: (absPath: string) => boolean;
}>;

export interface FsProbe {
  /** realpath of the longest existing prefix, with the rest appended. */
  realpathNearest(abs: string): string;
  /** Permission bits of a regular file (no symlink follow), or null. */
  fileMode(p: string): number | null;
  /**
   * A target that is also another file (hard link, bind mount): is it one of
   * the protected files, or (with `execConfig`) one of the project's
   * exec-config files?
   */
  hardLink(
    realPath: string,
    prot: ProtectedSet | null,
    execConfig?: ExecConfigScope | null,
  ): HardLinkVerdict;
  /** Is `realPath` the same inode as one of the secret files? Returns that secret, or null. */
  sameInodeAs(realPath: string, candidates: readonly string[]): string | null;
  gitTracking(realPath: string): GitTracking;
  /** The first line of the repository's git config that can start a program, or null. */
  gitConfigRisk?(cwd: string): string | null;
  /**
   * The programs the repository's git configuration and hooks can make git
   * start (./git-programs.ts), or null when they could not be read. With it,
   * a read-only git command is checked against the programs it actually starts.
   */
  gitPrograms?(cwd: string): readonly GitProgram[] | null;
  /** HEAD's tree of the repository holding `dir` (gitCommittedTreeOf), or null. */
  committedTree?(dir: string): { top: string; blobs: ReadonlyMap<string, string> } | null;
}

export function comparablePath(p: string): string {
  return path.resolve(p).normalize("NFC").toLowerCase();
}

/** Is `child` inside (or equal to) `dir`? Compared case-insensitively after NFC (macOS and Windows fold case). */
export function isInside(dir: string, child: string): boolean {
  const d = comparablePath(dir);
  const c = comparablePath(child);
  if (c === d) {
    return true;
  }
  const rel = path.relative(d, c);
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

/** Exact containment, no case folding: an allowance never matches by folding. */
export function isInsideExact(dir: string, child: string): boolean {
  const rel = path.relative(dir, child);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

export function realpathNearestSync(abs: string): string {
  let probe = abs;
  const rest: string[] = [];
  for (;;) {
    try {
      const real = fs.realpathSync(probe);
      return rest.length ? path.join(real, ...rest.toReversed()) : real;
    } catch {
      const parent = path.dirname(probe);
      if (parent === probe) {
        return abs;
      }
      rest.push(path.basename(probe));
      probe = parent;
    }
  }
}

/** ~, $HOME and ${HOME} at the start of a path, expanded. */
export function expandHome(p: string, home: string | null | undefined): string {
  if (!home) {
    return p;
  }
  return p.replace(/^~(?=$|\/)/, home).replace(/^\$\{?HOME\}?(?=$|\/)/, home);
}

export function isProtectedPath(prot: ProtectedSet, absPaths: readonly (string | null)[]): boolean {
  for (const p of absPaths) {
    if (!p) {
      continue;
    }
    if (prot.paths.some((q) => isInside(q, p))) {
      return true;
    }
    if (
      prot.prefixes.some(
        (x) =>
          comparablePath(path.dirname(p)) === comparablePath(x.dir) &&
          path.basename(p).toLowerCase().startsWith(x.basename),
      )
    ) {
      return true;
    }
  }
  return false;
}

const SYSTEM_BIN_DIRS = ["/usr/bin", "/bin", "/usr/sbin", "/sbin"];

function overflowUid(): number {
  try {
    const n = Number(fs.readFileSync("/proc/sys/kernel/overflowuid", "utf8").trim());
    return Number.isInteger(n) ? n : 65534;
  } catch {
    return 65534;
  }
}

// The uids that own system binaries: root; inside a user namespace also the
// overflow uid (the host's unmapped root). The binary still comes from a
// fixed system directory, never from the user's PATH.
// `extra`: a test suite's stand-in uids for root (TestOwnership, admin-grants.ts).
export function systemBinaryUids(extra: readonly number[] = []): number[] {
  const base =
    process.platform === "linux" && inNonInitialUserNamespace() ? [0, overflowUid()] : [0];
  return [...new Set([...base, ...extra])];
}

/** Every directory from `dir` up to the root owned by one of `uids` and not group/other-writable. */
function trustedChain(dir: string, uids: readonly number[]): boolean {
  for (let d = dir; ;) {
    let st: fs.Stats;
    try {
      st = fs.statSync(d);
    } catch {
      return false;
    }
    if (!uids.includes(st.uid) || (st.mode & 0o022) !== 0) {
      return false;
    }
    const up = path.dirname(d);
    if (up === d) {
      return true;
    }
    d = up;
  }
}

/**
 * Why `file` is not a trusted system executable, or null when it is: the
 * file it resolves to (symlinks followed) is a regular executable owned by a
 * system uid and not group/other-writable, and every directory above both the
 * link and its target is too.
 */
export function untrustedBinaryReason(
  file: string,
  uids: readonly number[] = systemBinaryUids(),
): string | null {
  let real: string;
  let st: fs.Stats;
  let linkDir: string;
  try {
    real = fs.realpathSync(file);
    st = fs.statSync(real);
    linkDir = fs.realpathSync(path.dirname(file));
  } catch (err) {
    return (err as NodeJS.ErrnoException).code ?? "UNKNOWN";
  }
  if (!st.isFile() || (st.mode & 0o111) === 0) {
    return `${real} is not an executable file`;
  }
  if (!uids.includes(st.uid) || (st.mode & 0o022) !== 0) {
    return `${real} is owned by uid ${st.uid} or writable by group or other`;
  }
  if (!trustedChain(path.dirname(real), uids) || !trustedChain(linkDir, uids)) {
    return `a directory above ${real} is not a system directory`;
  }
  return null;
}

// A binary in a system directory whose whole path is owned by root and not
// group- or world-writable: never one found on the user's PATH (a shim there
// could answer "tracked" for every file). `o.testUids`: a suite's stand-in
// uids for root (TestOwnership).
export function trustedBinary(
  name: string,
  dirs: readonly string[] = SYSTEM_BIN_DIRS,
  o: Readonly<{ testUids?: readonly number[] }> = {},
): string | null {
  if (!/^[A-Za-z0-9._-]+$/.test(name)) {
    return null;
  }
  const uids = systemBinaryUids(o.testUids ?? []);
  for (const d of dirs) {
    const p = path.join(d, name);
    if (untrustedBinaryReason(p, uids) === null) {
      return fs.realpathSync(p);
    }
  }
  return null;
}

type Runner = (
  cmd: string,
  args: readonly string[],
  opts: Omit<SpawnSyncOptions, "encoding">,
) => Pick<SpawnSyncReturns<string>, "status" | "stderr" | "error">;

/**
 * Whether git keeps a copy of the file. Repository config that could start a
 * program during the lookup is neutralized, no GIT_* variable from the
 * environment is passed on, and the name is matched literally, never as a
 * pattern.
 */
export function gitTrackingOf(
  realPath: string,
  opts: { run?: Runner; gitBin?: string | null } = {},
): GitTracking {
  const run: Runner = opts.run ?? ((c, a, o) => spawnSync(c, [...a], { ...o, encoding: "utf8" }));
  const dir = path.dirname(realPath);
  const base = path.basename(realPath);
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (!k.startsWith("GIT_") && typeof v === "string") {
      env[k] = v;
    }
  }
  env.GIT_OPTIONAL_LOCKS = "0";
  const gitBin =
    opts.gitBin !== undefined
      ? opts.gitBin
      : process.platform === "win32"
        ? "git"
        : trustedBinary("git");
  if (!gitBin) {
    return "unknown";
  }
  const git = (args: string[]) =>
    run(
      gitBin,
      ["-c", "core.fsmonitor=false", "-c", "core.untrackedCache=false", "-C", dir, ...args],
      {
        timeout: 5000,
        env,
        windowsHide: true,
      },
    );
  const r = git(["--literal-pathspecs", "ls-files", "--error-unmatch", "--", base]);
  if (r.error || r.status === null) {
    return "unknown";
  }
  if (r.status === 0) {
    return "tracked";
  }
  if (r.status === 128 && /not a git repository/i.test(r.stderr)) {
    return "no-repo";
  }
  if (r.status !== 1) {
    return "unknown";
  }
  const ig = git(["check-ignore", "-q", "--", base]);
  return ig.status === 0 ? "ignored" : "untracked";
}

/**
 * HEAD's tree of the repository holding `dir`: path relative to the
 * repository's top (with "/") -> blob id, or null when it cannot be read.
 * Read with `git ls-tree` (no index, no working tree: no filter, fsmonitor
 * or hook runs), the same system git and scrubbed environment as
 * gitTrackingOf.
 */
export function gitCommittedTreeOf(
  dir: string,
  opts: { run?: Runner; gitBin?: string | null } = {},
): { top: string; blobs: Map<string, string> } | null {
  const gitBin =
    opts.gitBin !== undefined
      ? opts.gitBin
      : process.platform === "win32"
        ? "git"
        : trustedBinary("git");
  if (!gitBin) {
    return null;
  }
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (!k.startsWith("GIT_") && typeof v === "string") {
      env[k] = v;
    }
  }
  env.GIT_OPTIONAL_LOCKS = "0";
  const run = (args: string[]) =>
    spawnSync(
      gitBin,
      ["-c", "core.fsmonitor=false", "-c", "core.untrackedCache=false", "-C", dir, ...args],
      { timeout: 10_000, env, windowsHide: true, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
    );
  const top = run(["rev-parse", "--show-toplevel"]);
  if (top.status !== 0 || typeof top.stdout !== "string") {
    return null;
  }
  const r = run(["ls-tree", "-r", "-z", "--full-tree", "HEAD"]);
  if (r.status !== 0 || typeof r.stdout !== "string") {
    return null;
  }
  const blobs = new Map<string, string>();
  for (const rec of r.stdout.split("\0")) {
    const m = /^\d+ blob ([0-9a-f]+)\t(.*)$/s.exec(rec);
    if (m) {
      blobs.set(m[2], m[1]);
    }
  }
  return { top: top.stdout.trim(), blobs };
}

/** Inodes of every file under the given roots, with a work budget; `complete` is false when it ran out. */
function inodeIndex(
  roots: readonly string[],
  budget: number,
): { map: Map<string, string>; complete: boolean } {
  const map = new Map<string, string>();
  let left = budget;
  for (const root of roots) {
    const stack = [root];
    while (stack.length) {
      if (left-- <= 0) {
        return { map, complete: false };
      }
      const p = stack.pop() as string;
      let st: fs.Stats;
      try {
        st = fs.lstatSync(p);
      } catch {
        continue;
      }
      if (st.isFile()) {
        map.set(`${st.dev}:${st.ino}`, p);
      } else if (st.isDirectory()) {
        try {
          for (const n of fs.readdirSync(p)) {
            stack.push(path.join(p, n));
          }
        } catch {
          /* unreadable: nothing to index */
        }
      }
    }
  }
  return { map, complete: true };
}

// Repository-local git config that can make a read-only git command start a
// program: pagers, fsmonitor, filter/diff/merge drivers and textconv, external
// diff, hooks path, gpg, ssh and editor helpers, and includes (which could
// pull any of these in). User-level and system git config are the user's.
const RISKY_GIT_SECTION = /^\s*\[\s*(include|includeif|filter|gpg|pager|(diff|merge)\s+")/i;
const RISKY_GIT_KEY =
  /^\s*(fsmonitor|pager|hookspath|sshcommand|askpass|editor|external|showsignature|textconv|command|program|process|clean|smudge|driver)\s*(=|$)/i;

function gitDirOf(dir: string): string | null {
  const dotgit = path.join(dir, ".git");
  let st: fs.Stats;
  try {
    st = fs.statSync(dotgit);
  } catch {
    // A bare repository: git uses the directory itself.
    if (
      fs.existsSync(path.join(dir, "HEAD")) &&
      fs.existsSync(path.join(dir, "config")) &&
      fs.existsSync(path.join(dir, "objects"))
    ) {
      return dir;
    }
    return null;
  }
  if (st.isDirectory()) {
    return dotgit;
  }
  try {
    const m = /^gitdir:\s*(.+)\s*$/m.exec(fs.readFileSync(dotgit, "utf8"));
    return m ? path.resolve(dir, m[1].trim()) : null;
  } catch {
    return null;
  }
}

/** The repository git config line (with its file) that could make a git command in `cwd` start a program, or null. */
export function gitConfigRiskOf(cwd: string): string | null {
  let dir = path.resolve(cwd);
  for (;;) {
    const gitDir = gitDirOf(dir);
    if (gitDir) {
      const files = [path.join(gitDir, "config"), path.join(gitDir, "config.worktree")];
      try {
        const common = fs.readFileSync(path.join(gitDir, "commondir"), "utf8").trim();
        files.push(path.join(path.resolve(gitDir, common), "config"));
      } catch {
        /* not a linked worktree */
      }
      for (const f of files) {
        let text: string;
        try {
          text = fs.readFileSync(f, "utf8");
        } catch {
          continue;
        }
        for (const line of text.split(/\r?\n/)) {
          const l = line.replace(/[#;].*$/, "");
          if (RISKY_GIT_SECTION.test(l) || RISKY_GIT_KEY.test(l)) {
            return `${f}: ${l.trim()}`;
          }
        }
      }
      return null;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      return null;
    }
    dir = parent;
  }
}

export const PROTECTED_WALK_BUDGET = 20000;
// The launcher's index, written once at launch (walking large code trees on every call is too slow).
const PRECOMPUTED_INDEX_BUDGET = 50_000;
// With a precomputed index, each decision walks only this much (the adapter's state first).
const LIVE_INDEX_BUDGET = 1_500;

const inodeKey = (st: Pick<fs.Stats, "dev" | "ino">) => `${st.dev}:${st.ino}`;

/**
 * Breadth-first over `roots` (shallowest entries first), up to `budget`
 * entries, adding each file's and directory's inode to `map` (directories
 * too: a bind-mounted protected directory has its inode under another path).
 * Returns whether the walk finished.
 */
function protectedWalk(
  roots: readonly string[],
  budget: number,
  map: Map<string, string>,
): boolean {
  let left = budget;
  let queue = [...roots];
  while (queue.length > 0) {
    const next: string[] = [];
    for (const p of queue) {
      if (--left < 0) {
        return false;
      }
      let st: fs.Stats;
      try {
        st = fs.lstatSync(p);
      } catch {
        continue;
      }
      if (!map.has(inodeKey(st))) {
        map.set(inodeKey(st), p);
      }
      if (st.isDirectory()) {
        try {
          for (const n of fs.readdirSync(p)) {
            next.push(path.join(p, n));
          }
        } catch {
          /* unreadable */
        }
      }
    }
    queue = next;
  }
  return true;
}

function protectedLatchFiles(prot: ProtectedSet): string[] {
  const out: string[] = [];
  for (const x of prot.prefixes) {
    try {
      for (const n of fs.readdirSync(x.dir)) {
        if (n.toLowerCase().startsWith(x.basename)) {
          out.push(path.join(x.dir, n));
        }
      }
    } catch {
      /* no such dir */
    }
  }
  return out;
}

/**
 * Write the protected inode index once at launch into a file the agent may
 * not write (the adapter's session directory); the adapter keeps the digest
 * in its session record and passes both as ProtectedSet.inodeIndex.
 */
export function writeProtectedInodeIndex(
  prot: ProtectedSet,
  file: string,
): { file: string; digest: string; entries: number; complete: boolean } {
  const map = new Map<string, string>();
  const complete = protectedWalk(
    [...(prot.statePaths ?? []), ...prot.paths, ...protectedLatchFiles(prot)],
    PRECOMPUTED_INDEX_BUDGET,
    map,
  );
  const text = JSON.stringify({ v: 1, complete, entries: [...map] });
  fs.writeFileSync(file, text, { mode: 0o600, flag: "wx" });
  return {
    file,
    digest: createHash("sha256").update(text).digest("hex"),
    entries: map.size,
    complete,
  };
}

export type ProtectedInodeIndex = {
  map: Map<string, string>;
  complete: boolean;
  precomputed: boolean;
};

/**
 * The inodes of the protected files and directories: the precomputed index
 * (while its digest still matches) plus a live, bounded walk of the state
 * paths first, which also covers files created after launch. With no
 * precomputed index the walk gets `budget`.
 */
export function protectedInodeIndex(
  prot: ProtectedSet,
  budget = PROTECTED_WALK_BUDGET,
): ProtectedInodeIndex {
  const map = new Map<string, string>();
  let precomputed = false;
  let complete = false;
  const pre = prot.inodeIndex;
  if (pre?.file && pre.digest) {
    try {
      const text = fs.readFileSync(pre.file, "utf8");
      if (createHash("sha256").update(text).digest("hex") === pre.digest) {
        const doc = JSON.parse(text) as { complete?: unknown; entries?: unknown };
        if (Array.isArray(doc.entries)) {
          for (const e of doc.entries) {
            if (Array.isArray(e) && typeof e[0] === "string" && typeof e[1] === "string") {
              map.set(e[0], e[1]);
            }
          }
          precomputed = true;
          complete = doc.complete === true;
        }
      }
    } catch {
      /* gone or unreadable: the live walk still runs */
    }
  }
  const live = protectedWalk(
    [...(prot.statePaths ?? []), ...protectedLatchFiles(prot), ...prot.paths],
    precomputed ? LIVE_INDEX_BUDGET : budget,
    map,
  );
  return { map, complete: complete || live, precomputed };
}

/** The protected file or directory `p` is (by inode), or one of its ancestors is (a bind-mounted protected directory). */
function boundProtected(ix: ProtectedInodeIndex, p: string): string | null {
  try {
    const hit = ix.map.get(inodeKey(fs.lstatSync(p)));
    if (hit) {
      return hit;
    }
  } catch {
    /* a new file: its ancestors still count */
  }
  for (let d = path.dirname(p); ; d = path.dirname(d)) {
    try {
      const st = fs.statSync(d);
      const hit = st.isDirectory() ? ix.map.get(inodeKey(st)) : undefined;
      if (hit) {
        return hit;
      }
    } catch {
      /* not there */
    }
    if (path.dirname(d) === d) {
      return null;
    }
  }
}
export const PROJECT_WALK_BUDGET = 20000;

/**
 * The project's exec-config file with the same inode as `st`, walking the
 * project on the target's filesystem with a work budget. node_modules and
 * .git/objects are skipped: never exec-config, and often huge (git objects
 * are hard-linked by `git clone --local`).
 */
export function execConfigInodeMatch(
  scope: ExecConfigScope,
  st: Pick<fs.Stats, "dev" | "ino">,
  budget = PROJECT_WALK_BUDGET,
): { match: string | null; complete: boolean } {
  const want = `${st.dev}:${st.ino}`;
  let left = budget;
  const stack = [scope.projectDir];
  while (stack.length) {
    const p = stack.pop() as string;
    let s: fs.Stats;
    try {
      s = fs.lstatSync(p);
    } catch {
      continue;
    }
    if (--left < 0) {
      return { match: null, complete: false };
    }
    if (s.isFile()) {
      if (`${s.dev}:${s.ino}` === want && scope.isExecConfig(p)) {
        return { match: p, complete: true };
      }
    } else if (s.isDirectory() && s.dev === st.dev) {
      let names: string[];
      try {
        names = fs.readdirSync(p);
      } catch {
        continue;
      }
      for (const n of names) {
        const skip =
          n === "node_modules" || (n === "objects" && path.basename(p).toLowerCase() === ".git");
        if (!skip) {
          stack.push(path.join(p, n));
        }
      }
    }
  }
  return { match: null, complete: true };
}

/** The real filesystem probe. Inode indexes are built once per protected set. */
export function nodeFsProbe(
  opts: {
    budget?: number;
    projectBudget?: number;
    gitConfigRisk?: (cwd: string) => string | null;
    gitPrograms?: (cwd: string) => readonly GitProgram[] | null;
  } = {},
): FsProbe {
  const budget = opts.budget ?? PROTECTED_WALK_BUDGET;
  const indexes = new WeakMap<object, ProtectedInodeIndex>();
  const indexOf = (prot: ProtectedSet) => {
    let ix = indexes.get(prot);
    if (!ix) {
      ix = protectedInodeIndex(prot, budget);
      indexes.set(prot, ix);
    }
    return ix;
  };
  return {
    realpathNearest: realpathNearestSync,
    fileMode(p) {
      try {
        const st = fs.lstatSync(p);
        return st.isFile() ? st.mode & 0o7777 : null;
      } catch {
        return null;
      }
    },
    hardLink(realPath, prot, execConfig) {
      let st: fs.Stats | null;
      try {
        st = fs.lstatSync(realPath);
      } catch {
        st = null;
      }
      // Whatever the link count (a bind mount keeps nlink == 1), and for a new
      // file too: the target, or a directory above it, is a protected inode.
      const ix = prot ? indexOf(prot) : null;
      const bound = ix ? boundProtected(ix, realPath) : null;
      if (bound !== null) {
        return { kind: "protected", nlink: st?.nlink ?? 0, match: bound };
      }
      if (!st || !st.isFile()) {
        return null;
      }
      const undecided = ix !== null && st.nlink > 1 && !ix.complete;
      if (st.nlink <= 1) {
        return null;
      }
      const e = execConfig
        ? execConfigInodeMatch(execConfig, st, opts.projectBudget)
        : { match: null, complete: true };
      if (undecided) {
        return { kind: "protected-unknown", nlink: st.nlink, match: e.match };
      }
      if (e.match) {
        return { kind: "exec-config", nlink: st.nlink, match: e.match };
      }
      return { kind: "multiply-linked", nlink: st.nlink, complete: e.complete };
    },
    sameInodeAs(realPath, candidates) {
      let st: fs.Stats;
      try {
        st = fs.statSync(realPath);
      } catch {
        return null;
      }
      if (!st.isFile()) {
        return null;
      }
      const ix = inodeIndex(candidates, 2000 * Math.max(1, candidates.length));
      return ix.map.get(`${st.dev}:${st.ino}`) ?? null;
    },
    gitTracking: (p) => gitTrackingOf(p),
    gitConfigRisk: opts.gitConfigRisk ?? gitConfigRiskOf,
    gitPrograms: opts.gitPrograms ?? (opts.gitConfigRisk ? undefined : gitProgramsOf),
    committedTree: (dir) => gitCommittedTreeOf(dir),
  };
}

const MAX_WORDS = 128;

/** The words of a command that may be paths (quotes dropped, option values kept). */
export function pathWords(command: string): string[] {
  return command
    .replace(/['"]/g, "")
    .split(/[\s;&|<>()`]+/)
    .filter(Boolean)
    .map((w) => (w.startsWith("-") ? (w.includes("=") ? w.slice(w.indexOf("=") + 1) : "") : w))
    .filter((w) => w !== "")
    .slice(0, MAX_WORDS);
}
