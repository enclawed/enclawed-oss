// enclawed adapter kit: files changed outside the agent.
//
// Enclawed keeps the content digest of every project file at the last
// audited state: the snapshot taken when a session starts, updated by every
// write the agent made through a checked call (a gated write) and by every
// checked command once it finished. A file that differs from that state
// without such an action was changed by someone else (another process, a
// person, a program running beside the session). Such a change is recorded,
// audited and kept reversible; it is not blocked (the owner's rule, 2026-11-27:
// a person's edits are not blocked but made reversible until the person
// approves the commit):
//
//   - reversible: the content of the last audited state is kept as each file
//     becomes the recorded state (./file-baseline.ts: HEAD's blob when git
//     holds it as it is, else a bounded copy), so a person can see the change
//     and put it back (baselineOf; in Enclawed Code: `ecwctl files`);
//   - used freely: a read, a read-only command, the agent's own edit, a
//     command that names a changed plain file: allowed, and recorded ("used",
//     "inspected");
//   - code runs only contained: a command that would run or load code from a
//     changed file (a script, source code, an executable, execution
//     configuration, an import or package script it reaches without naming
//     it, git over changed hooks or configuration) is allowed only when its
//     decision runs it contained (project-only writes, a snapshot first, no
//     network); outside containment it is asked of a person (denied where no
//     person can be asked). A changed link or special file followed, a skill
//     loaded from changed files, or a changed code file handed to an MCP or
//     unknown tool is always asked;
//   - accepted at a commit: a `git commit` is the acceptance point. It is
//     always asked of a person (with the number of files the agent changed and
//     the files changed outside the agent); once a commit the person approved
//     at Enclawed's own prompt has run, every change it includes as it is on
//     disk is accepted into the recorded state (acceptCommit) and its kept
//     copies are released (git holds the content); the adapter prunes its
//     history of those files. A person may also accept outside the agent
//     (acceptByPerson; in Enclawed Code `ecwctl files accept`).
//
// The record covers the project bounded (file count and bytes): a path the
// record could not cover is treated as changed (fail closed). The version
// control object store is left out (git writes it on every command); its
// hooks and configuration are kept, they configure what runs.
//
// A checked action is credited only with what its decision decided it may
// change (its write scope: nothing for a read-only command or a read, the
// exact targets of a redirect or in-place edit, anything for a contained run
// or a call a person approved). A change made while it runs to any other path
// is a change outside the agent: recorded (the exec variant for links and
// executables), audited, and, when the path is in the action's read set (the
// files it names, the directories it searches; links and globs included as
// the prefixes they lie under), the action's output is withheld from the
// model (endAuditedAction reports it; the engine withholds). A read of a file
// swapped between the decision and the run never reaches the model.
//
// Detection: at launch (compareAtLaunch), at every use (the used files are
// digested again), before every command (a rescan) and, for promptness,
// while the session runs (watchProject, the adapter forwards its events).
// Every detection, block, approval and acceptance is written to the ledger's
// own event log and to the adapter's audit sink: the file, the digests before
// and after and a summary of the change (sizes, line counts), never content.

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { CAPABILITY } from "../skill-capabilities.js";
import { INTERPRETERS, programOf, segments } from "./exec-provenance.js";
import {
  dirContentStore,
  gitBlobId,
  gitBlobOf,
  gitChangedPaths,
  gitHeadOf,
  gitIgnoredOf,
  gitRepoOf,
  gitTreeOf,
  MAX_KEPT_BYTES,
  MAX_KEPT_FILE_BYTES,
  memoryContentStore,
  readPlainFile,
  sha256Of,
  topRelOf,
  type ContentStore,
  type GitRepo,
  type KeptRef,
} from "./file-baseline.js";
import { keysOf, shardedRecord } from "./file-integrity-record.js";
import {
  expandHome,
  isInside,
  isProtectedPath,
  pathWords,
  realpathNearestSync,
  type ProtectedSet,
} from "./fs-probe.js";
import {
  deny,
  isBuildFilePath,
  isExecConfigPath,
  personOnly,
  type ExecConfigOption,
} from "./rule-decisions.js";
import { classifyCompound } from "./shell-readonly.js";
import type { SkillSet } from "./skill-types.js";
import type { Decision, PreActionEvent, ReasonCode } from "./types.js";
import { quoteUntrusted as q, showPath } from "./untrusted.js";

/**
 * Reason codes: a changed file followed or loaded in a way containment does not cover (asked), code
 * from a changed file run outside containment (asked), and a git commit, the acceptance point (asked).
 */
export const FILE_CHANGED_CODE = "file-changed-outside-agent" as const;
export const FILE_CHANGED_EXEC_CODE = "file-changed-outside-agent-exec" as const;
export const GIT_COMMIT_ACCEPTS_CODE = "git-commit-accepts-changes" as const;

// Bounds of a snapshot (internal constants; the adapter may only lower them).
const MAX_FILES = 50_000;
const MAX_BYTES = 1024 * 1024 * 1024;
const MAX_UNCOVERED = 2_000;
const MAX_EVENTS = 500;
const CHUNK = 1024 * 1024;
const RACY_MS = 2000;

// ─── Snapshot ───────────────────────────────────────────────────────────

/** One recorded path: a file (digest, size, lines, executable bit), a link (its target, never followed), or something else. */
export type FileEntry =
  | Readonly<{
      kind: "file";
      sha256: string;
      size: number;
      lines: number;
      /** Any execute bit is set. */
      exec: boolean;
      /** Begins with #! or an executable format's magic number. */
      runnable: boolean;
      /** Stat identity (device, inode, size, times, mode): the digest is reused only while it is unchanged. */
      stat: string;
    }>
  | Readonly<{ kind: "link"; target: string }>
  | Readonly<{ kind: "special" }>;

export type ProjectSnapshot = Readonly<{
  root: string;
  /** Relative path ("/"-separated) → entry. */
  files: Readonly<Record<string, FileEntry>>;
  /**
   * Relative paths (files or directories, "" = everything not listed in
   * `files`) the snapshot could not cover: over a bound, or unreadable.
   */
  uncovered: readonly string[];
  /** Why it is incomplete, when it is. */
  incomplete: "too-many-files" | "too-many-bytes" | "unreadable" | null;
}>;

export type SnapshotOptions = Readonly<{
  maxFiles?: number;
  maxBytes?: number;
  /** Digests to reuse while a file's stat identity is unchanged. */
  prior?: Readonly<Record<string, FileEntry>> | null;
  /** Directories (relative) the adapter leaves out: they count as not covered. */
  exclude?: readonly string[];
  /**
   * Only these paths (relative; files or directories, walked below) instead of
   * the whole project: a scoped check. A path absent now is simply not listed.
   */
  under?: readonly string[] | null;
}>;

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Whether a relative path is in scope: everything but a version-control
 * object store. In a `.git` directory (at any depth) only `config` and
 * `hooks/` are kept; in `.hg` only `hgrc`; `.svn` and `.bzr` are left out.
 */
export function inIntegrityScope(rel: string): boolean {
  const parts = rel.split("/");
  for (let i = 0; i < parts.length; i++) {
    const seg = parts[i];
    const rest = parts.slice(i + 1);
    if (seg === ".git" && rest.length > 0) {
      return (rest[0] === "config" && rest.length === 1) || rest[0] === "hooks";
    }
    if (seg === ".hg" && rest.length > 0) {
      return rest[0] === "hgrc" && rest.length === 1;
    }
    if (seg === ".svn" || seg === ".bzr") {
      return false;
    }
  }
  return true;
}

const ELF = [0x7f, 0x45, 0x4c, 0x46];
const MACHO = [
  [0xcf, 0xfa, 0xed, 0xfe],
  [0xce, 0xfa, 0xed, 0xfe],
  [0xfe, 0xed, 0xfa, 0xce],
  [0xfe, 0xed, 0xfa, 0xcf],
  [0xca, 0xfe, 0xba, 0xbe],
];
const WASM = [0x00, 0x61, 0x73, 0x6d];

function runnableHead(b: Buffer): boolean {
  const starts = (m: number[]) => m.every((x, i) => b[i] === x);
  return (b[0] === 0x23 && b[1] === 0x21) || starts(ELF) || starts(WASM) || MACHO.some(starts);
}

function statKey(st: fs.BigIntStats): string {
  return `${st.dev}:${st.ino}:${st.size}:${st.mtimeNs}:${st.ctimeNs}:${st.mode}`;
}

/** The entry for one path now (lstat: a link is recorded, never followed); null when absent or a directory. */
export function entryOf(abs: string, prior?: FileEntry | null): FileEntry | null {
  let st: fs.BigIntStats;
  try {
    st = fs.lstatSync(abs, { bigint: true });
  } catch (err) {
    if (
      (err as NodeJS.ErrnoException).code === "ENOENT" ||
      (err as NodeJS.ErrnoException).code === "ENOTDIR"
    ) {
      return null;
    }
    throw err;
  }
  if (st.isSymbolicLink()) {
    return { kind: "link", target: fs.readlinkSync(abs) };
  }
  if (st.isDirectory()) {
    return null; // a directory is recorded by its files
  }
  if (!st.isFile()) {
    return { kind: "special" };
  }
  const key = statKey(st);
  if (prior?.kind === "file" && prior.stat === key) {
    // (a racy identity never equals a stat key)
    return prior;
  }
  const h = createHash("sha256");
  const fd = fs.openSync(abs, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
  let size = 0;
  let lines = 0;
  let head: Buffer | null = null;
  try {
    const buf = Buffer.allocUnsafe(CHUNK);
    for (;;) {
      const n = fs.readSync(fd, buf, 0, CHUNK, null);
      if (n <= 0) {
        break;
      }
      const chunk = buf.subarray(0, n);
      head ??= Buffer.from(chunk.subarray(0, 4));
      h.update(chunk);
      size += n;
      for (let i = chunk.indexOf(0x0a); i !== -1; i = chunk.indexOf(0x0a, i + 1)) {
        lines++;
      }
    }
  } finally {
    fs.closeSync(fd);
  }
  // A file changed within the clock slack of this reading could change again
  // without a visible stat difference (same size, same coarse time): its
  // identity is not kept, so it is hashed again next time ("racily clean").
  const racy = Date.now() - Number(st.ctimeNs / 1_000_000n) < RACY_MS;
  return {
    kind: "file",
    sha256: h.digest("hex"),
    size,
    lines,
    exec: (Number(st.mode) & 0o111) !== 0,
    runnable: head !== null && runnableHead(head),
    stat: racy ? `racy:${key}` : key,
  };
}

/**
 * A bounded, deterministic snapshot of a project: breadth first, names in
 * code-unit order, so the same tree always covers the same paths. Over a
 * bound, the rest is listed as not covered.
 */
export function snapshotProject(root: string, o: SnapshotOptions = {}): ProjectSnapshot {
  const maxFiles = Math.min(o.maxFiles ?? MAX_FILES, MAX_FILES);
  const maxBytes = Math.min(o.maxBytes ?? MAX_BYTES, MAX_BYTES);
  const excluded = new Set((o.exclude ?? []).map((e) => e.replace(/\\/g, "/").replace(/\/+$/, "")));
  const files: Record<string, FileEntry> = {};
  const uncovered: string[] = [...excluded].toSorted(cmp);
  let incomplete: ProjectSnapshot["incomplete"] = null;
  let count = 0;
  let bytes = 0;
  const queue: string[] = o.under ? [] : [""];
  const stopAt = (rest: readonly string[], why: NonNullable<ProjectSnapshot["incomplete"]>) => {
    incomplete ??= why;
    uncovered.push(...rest);
  };
  for (const r of o.under ?? []) {
    if (!inIntegrityScope(r) || [...excluded].some((x) => r === x || r.startsWith(`${x}/`))) {
      continue;
    }
    let st: fs.Stats;
    try {
      st = fs.lstatSync(path.join(root, r));
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "ENOENT" && code !== "ENOTDIR") {
        stopAt([r], "unreadable");
      }
      continue;
    }
    if (st.isDirectory()) {
      queue.push(r);
      continue;
    }
    try {
      const e = entryOf(path.join(root, r), o.prior?.[r] ?? null);
      if (e) {
        files[r] = e;
        count++;
        bytes += e.kind === "file" ? e.size : 0;
      }
    } catch {
      stopAt([r], "unreadable");
    }
  }
  while (queue.length) {
    const dir = queue.shift() as string;
    let names: string[];
    try {
      names = fs.readdirSync(path.join(root, dir)).toSorted(cmp);
    } catch {
      stopAt([dir], "unreadable");
      continue;
    }
    for (let i = 0; i < names.length; i++) {
      const rel = dir ? `${dir}/${names[i]}` : names[i];
      if (!inIntegrityScope(rel) || excluded.has(rel)) {
        continue;
      }
      if (incomplete === "too-many-files" || incomplete === "too-many-bytes") {
        uncovered.push(rel);
        continue;
      }
      const abs = path.join(root, rel);
      let st: fs.Stats;
      try {
        st = fs.lstatSync(abs);
      } catch {
        stopAt([rel], "unreadable");
        continue;
      }
      if (st.isDirectory()) {
        queue.push(rel);
        continue;
      }
      if (count >= maxFiles || bytes + (st.isFile() ? st.size : 0) > maxBytes) {
        stopAt(
          names.slice(i).map((n) => (dir ? `${dir}/${n}` : n)),
          count >= maxFiles ? "too-many-files" : "too-many-bytes",
        );
        uncovered.push(...queue.splice(0));
        break;
      }
      try {
        const e = entryOf(abs, o.prior?.[rel] ?? null);
        if (e) {
          files[rel] = e;
          count++;
          bytes += e.kind === "file" ? e.size : 0;
        }
      } catch {
        stopAt([rel], "unreadable");
      }
    }
  }
  const unc = [...new Set(uncovered)].filter((u) => inIntegrityScope(u)).toSorted(cmp);
  return { root, files, uncovered: unc.length > MAX_UNCOVERED ? [""] : unc, incomplete };
}

function coveredBy(uncovered: readonly string[], rel: string): boolean {
  return !uncovered.some((u) => u === "" || rel === u || rel.startsWith(`${u}/`));
}

/** Same content: digest and executable bit for a file, target for a link. */
export function sameEntry(a: FileEntry | null, b: FileEntry | null): boolean {
  if (!a || !b) {
    return a === b;
  }
  if (a.kind === "file" && b.kind === "file") {
    return a.sha256 === b.sha256 && a.exec === b.exec;
  }
  if (a.kind === "link" && b.kind === "link") {
    return a.target === b.target;
  }
  return a.kind === b.kind;
}

// ─── Ledger ─────────────────────────────────────────────────────────────

export type ChangeSource = "launch" | "watch" | "use" | "rescan";

/** A change nobody's checked action made: the evidence. */
export type ChangeRecord = Readonly<{
  path: string;
  source: ChangeSource;
  at: number;
  before: FileEntry | null;
  after: FileEntry | null;
  /** false: the recorded state never covered this path (a bound, an unreadable directory). */
  covered: boolean;
}>;

export type FileIntegrityEvent = Readonly<{
  type:
    | "baseline"
    | "detected"
    | "reverted"
    | "blocked"
    | "asked"
    | "inspected"
    | "used"
    | "contained"
    | "build-file"
    | "approved"
    | "accepted"
    | "gated-write"
    | "agent-action"
    | "watch-lost";
  at: number;
  paths: readonly string[];
  /** Plain words: digests before/after, sizes, line counts, the reason code; never content. */
  detail: string;
}>;

type Approval = { sha256: string; at: number; callId: string | null };

export type LedgerState = {
  v: 1;
  root: string;
  /** null: never recorded (nothing is covered until a launch snapshot). */
  recordedAt: number | null;
  files: Record<string, FileEntry>;
  uncovered: string[];
  changed: Record<string, ChangeRecord>;
  approvals: Record<string, Approval>;
  asked: Record<
    string,
    {
      at: number;
      files: { path: string; sha256: string }[];
      /** The call is a git commit asked of a person: the directory git runs in and HEAD before it. */
      commit?: { dir: string; head: string | null };
    }
  >;
  /**
   * Where the recorded content of each path is kept (./file-baseline.ts): for a clean
   * file its current content, for a changed one its content before the change.
   */
  kept?: Record<string, KeptRef>;
  /** Paths the agent changed (gated writes, its checked commands) since they were last accepted or committed. */
  agent?: Record<string, number>;
  /** How many kept references each stored copy has, and the bytes the copies take (kept in step with `kept`). */
  copies?: Record<string, number>;
  copyBytes?: number;
  /** Recorded paths that configure what git starts (kept in step with `files`). */
  gitPaths?: string[];
  /**
   * Checked actions running now: a change meanwhile is theirs only inside
   * their write scope. A number is a record written before scopes (write
   * scope: anything, read set: nothing).
   */
  actions: Record<string, number | RunningAction>;
  /** Actions that ended recently (a second end of one is a no-op). */
  ended?: string[];
  events: FileIntegrityEvent[];
};

/**
 * What a checked action may change and what it reads, as its decision
 * decided (absolute paths or relative to the project; outside the project
 * they are ignored, an ancestor of the project covers all of it).
 * writes: "none" (a read-only command, a read), exact paths (a redirect, an
 * in-place edit), or "any" (contained execution, a call a person approved,
 * an MCP tool). reads: path prefixes (each covers itself and everything
 * below), or "any".
 */
export type AuditedActionScope = Readonly<{
  writes: "none" | "any" | readonly string[];
  reads: "any" | readonly string[];
}>;

type RunningAction = {
  at: number;
  writes: "none" | "any" | string[];
  reads: "any" | string[];
  /** Paths in the read set changed outside the agent while it ran (sticky: a revert does not clear it). */
  outside: string[];
};

/** What ending a checked action found. */
export type AuditedActionEnd = Readonly<{
  /** Whether a running action of this id was ended now (false: unknown or already ended). */
  ended: boolean;
  /** Paths changed outside the agent while it ran (flagged now or by the watcher). */
  outside: readonly string[];
  /** Of those, the ones in its read set: its output may carry them and is withheld. */
  outsideReads: readonly string[];
}>;

export type PathStatus = Readonly<{
  path: string;
  state: "clean" | "changed" | "approved" | "absent";
  entry: FileEntry | null;
  change: ChangeRecord | null;
}>;

export type LaunchComparison = Readonly<{
  /** No earlier record: this snapshot becomes the baseline (nothing to compare). */
  firstRun: boolean;
  /** Changes found now. */
  found: readonly ChangeRecord[];
  /** Every change still outstanding (found now or earlier, not reverted or accepted). */
  outstanding: readonly ChangeRecord[];
  incomplete: ProjectSnapshot["incomplete"];
}>;

export type IntegrityAudit = (e: FileIntegrityEvent) => void | Promise<void>;

/** The recorded content of a path changed outside the agent: what putting the change back writes. */
export type Baseline = Readonly<{
  path: string;
  /** The recorded entry before the change (null: the path did not exist, putting back deletes it). */
  before: FileEntry | null;
  /** The bytes of a recorded file (checked against its digest), or null. */
  content: Buffer | null;
  /** Where it was found: git (HEAD's blob), copy (the store), the record itself (link, absent), or none (not kept). */
  kept: "git" | "copy" | "link" | "absent" | "none";
}>;

/** What a person's approved commit accepted. */
export type CommitAcceptance = Readonly<{
  /** The new commit, or null when HEAD did not move (nothing was committed). */
  commit: string | null;
  /** Changes outside the agent the commit includes as they are on disk: accepted now. */
  accepted: readonly string[];
  /** Every project path the commit includes as it is on disk (relative): its history may be pruned. */
  committed: readonly string[];
}>;

interface Backend {
  /**
   * The record. shared: the backend's own object (read-only for the caller,
   * or owned under the lock by mutate); otherwise a copy the caller may keep.
   */
  load(o?: { shared?: boolean }): LedgerState | null;
  save(s: LedgerState): void;
  /** Forget any object load returned shared (a change of it failed midway). */
  invalidate?(): void;
  /** wait false: throw LedgerBusyError at once when another process holds the record. */
  locked<T>(fn: () => T, wait?: boolean): T;
}

/** The record is held by another process and the caller asked not to wait (an event loop that must not stall). */
export class LedgerBusyError extends Error {
  readonly code = "ledger-busy" as const;
  constructor(file: string) {
    super(`the file-integrity record ${file} is held by another process`);
    this.name = "LedgerBusyError";
  }
}

/**
 * Runs `fn` (a ledger call made with { wait: false }) until the record is
 * free, yielding to the event loop between tries (never blocking it), up to
 * `timeoutMs` on the monotonic clock. For a long-lived process (a launcher)
 * whose event loop must keep running.
 */
export async function whenLedgerFree<T>(fn: () => T, o: { timeoutMs?: number } = {}): Promise<T> {
  const deadline = performance.now() + (o.timeoutMs ?? LOCK_WAIT_MS);
  for (;;) {
    try {
      return fn();
    } catch (err) {
      if (!(err instanceof LedgerBusyError) || performance.now() > deadline) {
        throw err;
      }
    }
    await new Promise((r) => setTimeout(r, 5));
  }
}

const RECORDS = new Set([
  "files",
  "uncovered",
  "changed",
  "approvals",
  "asked",
  "actions",
  "ended",
  "kept",
  "agent",
  "events",
]);

/**
 * The record, with every change to it or to one of its maps noted (so an
 * unchanged record is not written). Nested values are changed only by
 * replacing them in their map (or through log, which marks it too).
 */
function tracked(s: LedgerState, mark: () => void): LedgerState {
  const wrapped = new Map<string, { target: object; proxy: object }>();
  const watch = (o: object): object =>
    new Proxy(o, {
      set(t, k, v) {
        mark();
        return Reflect.set(t, k, v);
      },
      deleteProperty(t, k) {
        mark();
        return Reflect.deleteProperty(t, k);
      },
    });
  return new Proxy(s, {
    get(t, k, r) {
      const v: unknown = Reflect.get(t, k, r);
      if (typeof k !== "string" || !RECORDS.has(k) || !v || typeof v !== "object") {
        return v;
      }
      let w = wrapped.get(k);
      if (!w || w.target !== v) {
        w = { target: v, proxy: watch(v) };
        wrapped.set(k, w);
      }
      return w.proxy;
    },
    set(t, k, v) {
      mark();
      return Reflect.set(t, k, v);
    },
    deleteProperty(t, k) {
      mark();
      return Reflect.deleteProperty(t, k);
    },
  });
}

/** What one change of the record keeps (./file-baseline.ts), written when the change is saved. */
type KeepBatch = {
  /** HEAD's tree may hold the content (one git call per batch). */
  git: boolean;
  /** Paths whose recorded content becomes the entry given (null: nothing to keep). */
  want: Map<string, FileEntry | null>;
  /** Copies no longer referenced by the paths that dropped them (removed unless another path references them). */
  dropped: Set<string>;
};

/** Bound of the record of paths the agent changed (internal). */
const MAX_AGENT_PATHS = 50_000;

const empty = (root: string): LedgerState => ({
  v: 1,
  root,
  recordedAt: null,
  files: {},
  uncovered: [""],
  changed: {},
  approvals: {},
  asked: {},
  actions: {},
  kept: {},
  agent: {},
  events: [],
});

function shortSha(e: FileEntry | null): string {
  return e?.kind === "file"
    ? e.sha256.slice(0, 16)
    : e?.kind === "link"
      ? "link"
      : e
        ? e.kind
        : "absent";
}

/** The change in plain words: digests, sizes, line counts (no content). */
export function changeSummary(c: ChangeRecord): string {
  const b = c.before;
  const a = c.after;
  const parts = [`sha256 ${shortSha(b)} -> ${shortSha(a)}`];
  if (b?.kind === "file" || a?.kind === "file") {
    const bs = b?.kind === "file" ? b.size : 0;
    const as = a?.kind === "file" ? a.size : 0;
    const bl = b?.kind === "file" ? b.lines : 0;
    const al = a?.kind === "file" ? a.lines : 0;
    parts.push(
      `${bs} -> ${as} bytes`,
      `${bl} -> ${al} lines (at least ${Math.max(0, al - bl)} added, ${Math.max(0, bl - al)} removed)`,
    );
    if (b?.kind === "file" && a?.kind === "file" && b.exec !== a.exec) {
      parts.push(a.exec ? "made executable" : "no longer executable");
    }
  }
  if (b?.kind === "link" || a?.kind === "link") {
    parts.push(
      `link target ${b?.kind === "link" ? JSON.stringify(b.target) : "none"} -> ${a?.kind === "link" ? JSON.stringify(a.target) : "none"}`,
    );
  }
  if (!b && c.covered) {
    parts.push("created");
  }
  if (!a) {
    parts.push("deleted");
  }
  if (!c.covered) {
    parts.push("not covered by the recorded state");
  }
  return parts.join(", ");
}

/**
 * The record of a project's files at the last audited state, the changes
 * nobody's checked action made, and the approvals a person gave. Every
 * method reads the current record (several processes share one file); the
 * ones that change it hold the ledger's lock.
 */
export class FileIntegrityLedger {
  readonly root: string;
  private readonly backend: Backend;
  private readonly audit: IntegrityAudit | null;
  private readonly snapOpts: SnapshotOptions;
  private readonly now: () => number;
  /** The record's own file, when it has one (never part of the record, never judged). */
  readonly own: string | null;
  /** Where copies of recorded content are kept (null: none are kept). */
  readonly store: ContentStore | null;
  private readonly useGit: boolean;
  private repoCache: GitRepo | null | undefined = undefined;
  private batch: KeepBatch | null = null;

  constructor(
    root: string,
    backend: Backend,
    o: {
      audit?: IntegrityAudit | null;
      snapshot?: SnapshotOptions;
      now?: () => number;
      own?: string | null;
      store?: ContentStore | null;
      /** false: never read git (tests of a project outside any repository). */
      git?: boolean;
    } = {},
  ) {
    this.root = path.resolve(root);
    this.backend = backend;
    this.audit = o.audit ?? null;
    this.now = o.now ?? Date.now;
    this.own = o.own ? path.resolve(o.own) : null;
    this.store = o.store ?? null;
    this.useGit = o.git !== false;
    // The record's directory inside the project (a project at the state directory's parent) is left out.
    const ownDir = this.own ? path.relative(this.root, path.dirname(this.own)) : null;
    const inside = ownDir !== null && !ownDir.startsWith("..") && !path.isAbsolute(ownDir);
    this.snapOpts = inside
      ? {
          ...o.snapshot,
          exclude: [
            ...(o.snapshot?.exclude ?? []),
            ownDir === "" ? path.basename(this.own as string) : ownDir.split(path.sep).join("/"),
          ],
        }
      : (o.snapshot ?? {});
  }

  /** The current record (a copy). Throws when the record is unreadable or for another project. */
  state(): LedgerState {
    return this.loaded(false);
  }

  // The record as the backend holds it (not a copy): only read, never kept or changed.
  private peek(): LedgerState {
    return this.loaded(true);
  }

  private loaded(shared: boolean): LedgerState {
    const s = this.backend.load({ shared });
    if (s && s.root !== this.root) {
      throw new Error(`the file-integrity record is for ${s.root}, not ${this.root}`);
    }
    return s ?? empty(this.root);
  }

  /** The path relative to the project ("/"-separated), or null outside it. */
  relOf(p: string): string | null {
    const abs = path.resolve(this.root, p);
    const rel = path.relative(this.root, abs);
    if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) {
      return null;
    }
    const r = rel.split(path.sep).join("/");
    return inIntegrityScope(r) ? r : null;
  }

  snapshot(prior?: Readonly<Record<string, FileEntry>> | null): ProjectSnapshot {
    return snapshotProject(this.root, { ...this.snapOpts, prior: prior ?? null });
  }

  // Changes the record under its lock: the record as held (no copy), every
  // change noted, written only when something changed. A failure midway
  // drops the held object (the next load reads the file again).
  private mutate<T>(
    fn: (s: LedgerState, log: (e: Omit<FileIntegrityEvent, "at">) => void, k: KeepBatch) => T,
    o: { wait?: boolean } = {},
  ): T {
    const pending: FileIntegrityEvent[] = [];
    const out = this.backend.locked(() => {
      const raw = this.loaded(true);
      let dirty = false;
      const s = tracked(raw, () => {
        dirty = true;
      });
      try {
        s.kept ??= {};
        s.agent ??= {};
        const log = (e: Omit<FileIntegrityEvent, "at">) => {
          const ev = { ...e, at: this.now() };
          s.events.push(ev);
          pending.push(ev);
        };
        const k: KeepBatch = { git: false, want: new Map(), dropped: new Set() };
        this.batch = k;
        let r: T;
        try {
          r = fn(s, log, k);
        } finally {
          this.batch = null;
        }
        this.flushKeep(s, k);
        if (s.events.length > MAX_EVENTS) {
          s.events.splice(0, s.events.length - MAX_EVENTS);
        }
        if (dirty) {
          this.backend.save(raw);
        }
        return r;
      } catch (err) {
        this.backend.invalidate?.();
        throw err;
      }
    }, o.wait !== false);
    for (const e of pending) {
      try {
        void Promise.resolve(this.audit?.(e)).catch(() => {});
      } catch {
        /* the ledger's own event log keeps it */
      }
    }
    return out;
  }

  /** The git repository holding the project (looked up once), or null. */
  private repo(): GitRepo | null {
    if (this.repoCache === undefined) {
      this.repoCache = this.useGit ? gitRepoOf(this.root) : null;
    }
    return this.repoCache;
  }

  /** The path's recorded content becomes `e` (kept when the change is saved). */
  private keep(rel: string, e: FileEntry | null): void {
    this.batch?.want.set(rel, e);
  }

  /**
   * The agent changed this path (a gated write, its checked command). A build
   * file is flagged (a "build-file" event): the commit's question names it.
   */
  private noteAgent(
    s: LedgerState,
    rel: string,
    log?: (e: Omit<FileIntegrityEvent, "at">) => void,
  ): void {
    const a = (s.agent ??= {});
    const fresh = !Object.hasOwn(a, rel);
    if (!fresh || Object.keys(a).length < MAX_AGENT_PATHS) {
      a[rel] = this.now();
    }
    if (fresh && isBuildFilePath(rel)) {
      log?.({
        type: "build-file",
        paths: [rel],
        detail:
          "build file changed by the agent: review it before a build outside Enclawed (the commit's question names it)",
      });
    }
  }

  // Keeps the recorded content of the paths a change of the record named
  // (./file-baseline.ts): HEAD's blob when git holds the file as it is, else a
  // copy within the bounds (not for a file git ignores); releases copies no
  // path references any more. Content that no longer matches its digest is not
  // kept (the file is changing; its next check detects it).
  private flushKeep(s: LedgerState, k: KeepBatch): void {
    const kept = (s.kept ??= {});
    const store = this.store;
    countCopies(s);
    const todo: [string, Extract<FileEntry, { kind: "file" }>][] = [];
    for (const [rel, e] of k.want) {
      const old = kept[rel];
      if (e?.kind !== "file" || s.changed[rel]) {
        if (!s.changed[rel]) {
          setKept(s, rel, null, k);
        }
        continue;
      }
      if (old && old.sha256 === e.sha256 && (old.at === "git" || store?.has(old.sha256))) {
        continue;
      }
      setKept(s, rel, null, k);
      if (store && e.size <= MAX_KEPT_FILE_BYTES) {
        todo.push([rel, e]);
      }
    }
    if (store && todo.length) {
      const repo = this.repo();
      const head = repo && k.git ? gitHeadOf(repo) : null;
      const tree = repo && head ? gitTreeOf(repo, head) : null;
      const copies: typeof todo = [];
      for (const [rel, e] of todo) {
        const t = repo && tree ? topRelOf(repo, this.root, rel) : null;
        const blob = t ? tree?.get(t) : undefined;
        if (blob && head) {
          const data = readPlainFile(path.join(this.root, rel), MAX_KEPT_FILE_BYTES);
          if (data && sha256Of(data) === e.sha256 && gitBlobId(data, blob.length) === blob) {
            setKept(s, rel, { sha256: e.sha256, size: e.size, at: "git", blob, commit: head }, k);
            continue;
          }
        }
        if (store.has(e.sha256)) {
          setKept(s, rel, { sha256: e.sha256, size: e.size, at: "copy" }, k);
          continue;
        }
        copies.push([rel, e]);
      }
      if (copies.length) {
        const tops = repo ? copies.map(([rel]) => topRelOf(repo, this.root, rel)) : [];
        const ignored = repo
          ? gitIgnoredOf(
              repo,
              tops.filter((t): t is string => t !== null),
            )
          : new Set<string>();
        copies.forEach(([rel, e], i) => {
          const t = tops[i];
          // What the copies take is counted in the record (no walk of the store or the map).
          if ((t && ignored.has(t)) || (s.copyBytes ?? 0) + onDisk(e.size) > MAX_KEPT_BYTES) {
            return;
          }
          const data = readPlainFile(path.join(this.root, rel), MAX_KEPT_FILE_BYTES);
          if (!data || sha256Of(data) !== e.sha256 || !store.put(e.sha256, data)) {
            return;
          }
          setKept(s, rel, { sha256: e.sha256, size: e.size, at: "copy" }, k);
        });
      }
    }
    if (store) {
      for (const sha of k.dropped) {
        if (!s.copies?.[sha]) {
          store.remove(sha);
        }
      }
    }
  }

  // Verifies one path against the record, flagging a change nobody's checked action made.
  private verify(
    s: LedgerState,
    rel: string,
    source: ChangeSource,
    log: (e: Omit<FileIntegrityEvent, "at">) => void,
    current?: FileEntry | null,
  ): PathStatus {
    const prior = s.files[rel] ?? null;
    const cur = current === undefined ? entryOf(path.join(this.root, rel), prior) : current;
    const ch = s.changed[rel] ?? null;
    if (ch) {
      if (sameEntry(cur, ch.before) && ch.covered) {
        delete s.changed[rel];
        delete s.approvals[rel];
        setEntry(s, rel, cur);
        this.keep(rel, cur);
        log({
          type: "reverted",
          paths: [rel],
          detail: `back to the recorded state (sha256 ${shortSha(cur)})`,
        });
        return { path: rel, state: cur ? "clean" : "absent", entry: cur, change: null };
      }
      let c = ch;
      if (!sameEntry(cur, ch.after)) {
        c = { ...ch, after: cur, at: this.now(), source };
        s.changed[rel] = c;
        delete s.approvals[rel];
        setEntry(s, rel, cur);
        markOutside(s, rel, cur);
        log({ type: "detected", paths: [rel], detail: changeSummary(c) });
      }
      if (!cur) {
        return { path: rel, state: "absent", entry: null, change: c };
      }
      const ap = s.approvals[rel];
      const approved = ap && cur.kind === "file" && ap.sha256 === cur.sha256;
      return { path: rel, state: approved ? "approved" : "changed", entry: cur, change: c };
    }
    const recorded = Object.hasOwn(s.files, rel);
    if (recorded ? sameEntry(prior, cur) : cur === null) {
      if (cur && prior !== cur) {
        s.files[rel] = cur;
      }
      return { path: rel, state: cur ? "clean" : "absent", entry: cur, change: null };
    }
    if (duringAction(s, rel, cur)) {
      // A checked command whose write scope covers this path is running and
      // the file changed after it started: the change is attributed to it,
      // and recorded when it ends. Any other change is outside the agent.
      return { path: rel, state: cur ? "clean" : "absent", entry: cur, change: null };
    }
    const c: ChangeRecord = {
      path: rel,
      source,
      at: this.now(),
      before: prior,
      after: cur,
      covered: recorded || coveredBy(s.uncovered, rel),
    };
    s.changed[rel] = c;
    setEntry(s, rel, cur);
    markOutside(s, rel, cur);
    log({ type: "detected", paths: [rel], detail: changeSummary(c) });
    return { path: rel, state: cur ? "changed" : "absent", entry: cur, change: c };
  }

  /**
   * At launch: the current snapshot against the recorded state. What differs
   * is recorded as changed outside the agent; the snapshot becomes the
   * recorded state (the changes stay outstanding until reverted, accepted
   * by a person outside the agent, or, for a plain file, approved).
   */
  compareAtLaunch(current: ProjectSnapshot): LaunchComparison {
    return this.mutate((s, log, k) => {
      // The recorded content of every clean file is kept (HEAD's blob or a
      // copy), so a change made before the next use can be put back; a record
      // from before content was kept keeps it from now on.
      const keepClean = () => {
        k.git = true;
        for (const rel of new Set([...Object.keys(s.files), ...Object.keys(s.kept ?? {})])) {
          if (!s.changed[rel]) {
            this.keep(rel, s.files[rel] ?? null);
          }
        }
      };
      const firstRun = s.recordedAt === null;
      const found: ChangeRecord[] = [];
      s.actions = {};
      s.ended = [];
      s.asked = {};
      if (firstRun) {
        s.files = { ...current.files };
        s.gitPaths = Object.keys(current.files)
          .filter((r) => GIT_CONFIG.test(r))
          .toSorted(cmp);
        s.uncovered = [...current.uncovered];
        s.recordedAt = this.now();
        keepClean();
        log({
          type: "baseline",
          paths: [],
          detail: `${Object.keys(current.files).length} files recorded${current.incomplete ? ` (incomplete: ${current.incomplete})` : ""}`,
        });
        return {
          firstRun,
          found,
          outstanding: Object.values(s.changed),
          incomplete: current.incomplete,
        };
      }
      const rels = [
        ...new Set([
          ...Object.keys(s.files),
          ...Object.keys(current.files),
          ...Object.keys(s.changed),
        ]),
      ].toSorted(cmp);
      for (const rel of rels) {
        const inNow = Object.hasOwn(current.files, rel);
        if (!inNow && !coveredBy(current.uncovered, rel)) {
          continue; // not seen now: decided when used
        }
        const had = s.changed[rel];
        const st = this.verify(s, rel, "launch", log, inNow ? current.files[rel] : null);
        if (st.change && st.change !== had) {
          found.push(st.change);
        }
      }
      s.uncovered = [...current.uncovered];
      s.recordedAt = this.now();
      s.gitPaths = Object.keys(s.files)
        .filter((r) => GIT_CONFIG.test(r))
        .toSorted(cmp);
      keepClean();
      return {
        firstRun,
        found,
        outstanding: Object.values(s.changed),
        incomplete: current.incomplete,
      };
    });
  }

  /** The used paths, each verified now (a new difference is flagged). */
  check(rels: readonly string[]): PathStatus[] {
    return this.mutate((s, log) =>
      [...new Set(rels)].toSorted(cmp).map((r) => this.verify(s, r, "use", log)),
    );
  }

  /** Every path in scope verified now (a rescan); returns the changes found (a running command's own changes are left to it). */
  rescan(under: readonly string[] | null = null): ChangeRecord[] {
    const roots = scopeRoots(under);
    const prior = this.peek().files;
    const snap = snapshotProject(this.root, { ...this.snapOpts, prior, under: roots });
    return this.mutate((s, log) => {
      const found: ChangeRecord[] = [];
      for (const rel of [
        ...new Set([...keysWithin(s.files, roots), ...Object.keys(snap.files)]),
      ].toSorted(cmp)) {
        const inNow = Object.hasOwn(snap.files, rel);
        if (!inNow && !coveredBy(snap.uncovered, rel)) {
          continue;
        }
        const had = s.changed[rel];
        // Read again under the lock where the walk saw something else than the record: another
        // process may have recorded a write since (the walk ran before the lock).
        const cur = this.fresh(s, rel, inNow ? snap.files[rel] : null);
        const st = this.verify(s, rel, "rescan", log, cur);
        if (st.change && st.change !== had) {
          found.push(st.change);
        }
      }
      return found;
    });
  }

  /**
   * After a gated write (the agent's own write, checked before it ran): the
   * file's new digest is the recorded state. A change flagged on the file
   * stays unless the write replaced the whole content, or the flag was the
   * watcher seeing this very write (same digest) before this call.
   */
  noteGatedWrite(p: string, op: "write" | "edit" | "delete" = "edit"): PathStatus | null {
    const rel = this.relOf(p);
    if (!rel) {
      return null;
    }
    return this.mutate((s, log) => {
      const cur = entryOf(path.join(this.root, rel), s.files[rel] ?? null);
      const ch = s.changed[rel];
      this.noteAgent(s, rel, log);
      log({ type: "gated-write", paths: [rel], detail: `${op}, sha256 ${shortSha(cur)}` });
      if (
        ch &&
        !(op === "write" || op === "delete" || (ch.source === "watch" && sameEntry(cur, ch.after)))
      ) {
        // The outside change is still in the file: it stays flagged; an
        // approval carries over the agent's own edit.
        const ap = s.approvals[rel];
        if (
          ap &&
          ch.after?.kind === "file" &&
          ap.sha256 === ch.after.sha256 &&
          cur?.kind === "file"
        ) {
          s.approvals[rel] = { ...ap, sha256: cur.sha256 };
        }
        s.changed[rel] = { ...ch, after: cur };
        setEntry(s, rel, cur);
        return { path: rel, state: "changed", entry: cur, change: s.changed[rel] };
      }
      if (ch && ch.source === "watch" && sameEntry(cur, ch.after)) {
        // The watcher saw this very write (the agent's own, checked) before
        // this call: it was never a change outside the agent.
        for (const [id, v] of Object.entries(s.actions)) {
          const a = runningOf(v);
          a.outside = a.outside.filter((r) => r !== rel);
          s.actions[id] = a;
        }
      }
      delete s.changed[rel];
      delete s.approvals[rel];
      setEntry(s, rel, cur);
      this.keep(rel, cur);
      return { path: rel, state: cur ? "clean" : "absent", entry: cur, change: null };
    });
  }

  /** A watcher event: the path verified now (null: the watcher lost track, everything is rescanned). */
  noteOutsideChange(p: string | null, o: { wait?: boolean } = {}): ChangeRecord[] {
    if (p === null) {
      this.mutate((_s, log) =>
        log({
          type: "watch-lost",
          paths: [],
          detail: "the watcher reported a change without a path",
        }),
      );
      return this.rescan();
    }
    const rel = this.relOf(p);
    if (!rel) {
      return [];
    }
    return this.mutate((s, log) => {
      const had = s.changed[rel];
      const st = this.verify(s, rel, "watch", log);
      return st.change && st.change !== had ? [st.change] : [];
    }, o);
  }

  /**
   * A checked action starts (once the call is allowed), with what its
   * decision decided it may change and reads (the engine passes the scope of
   * every call it allows: ./action-scope.ts). An action already running
   * under this id keeps its scope, so an adapter's own later call changes
   * nothing. Without a scope (an adapter bracketing a call the engine did
   * not open) it is the record's behavior before scopes: everything changed
   * after it started is credited to it, and it has no read set.
   */
  beginAuditedAction(id: string, scope?: AuditedActionScope | null): void {
    const writes = !scope
      ? ("any" as const)
      : scope.writes === "none"
        ? ("none" as const)
        : scope.writes === "any"
          ? ("any" as const)
          : [...new Set(scope.writes.flatMap((p) => this.scopeRels(p, false)))].toSorted(cmp);
    const reads = !scope
      ? []
      : scope.reads === "any"
        ? ("any" as const)
        : [...new Set(scope.reads.flatMap((p) => this.scopeRels(p, true)))].toSorted(cmp);
    // An action that may write anything is credited with what changes while it runs: every change
    // made before it begins is found first (a call's end checks only its own scope).
    if (writes === "any" && !Object.hasOwn(this.peek().actions, id)) {
      this.rescan();
    }
    this.mutate((s) => {
      if (Object.hasOwn(s.actions, id)) {
        return;
      }
      s.actions[id] = { at: this.now(), writes, reads, outside: [] };
    });
  }

  /** A begun action that will not run (its call was blocked after all): removed, nothing credited to it. */
  dropAuditedAction(id: string): void {
    this.mutate((s) => {
      delete s.actions[id];
      s.ended = [...(s.ended ?? []).filter((x) => x !== id), id].slice(-64);
    });
  }

  // A scope path as the record's relative paths: the path as named (its
  // directory resolved) and, for a read, where it resolves to (a link's
  // target inside the project). An ancestor of the project covers all of it
  // for a read; a path outside the project is not the record's.
  private scopeRels(p: string, read: boolean): string[] {
    if (typeof p !== "string" || p === "") {
      return [];
    }
    const abs = path.resolve(this.root, p);
    const named = path.join(realpathNearestSync(path.dirname(abs)), path.basename(abs));
    const out: string[] = [];
    for (const cand of read ? [named, realpathNearestSync(abs)] : [named]) {
      if (read && isInside(cand, this.root)) {
        out.push("");
        continue;
      }
      const r = path.relative(this.root, cand);
      if (r === "" || r.startsWith("..") || path.isAbsolute(r)) {
        continue;
      }
      out.push(r.split(path.sep).join("/"));
    }
    return out;
  }

  /**
   * A checked action ended: what changed since it started inside its write
   * scope is its own and becomes the recorded state; every other change is
   * outside the agent (flagged, audited). Returns what was outside, and what
   * of that is in its read set (the caller withholds its output). Ending an
   * action that already ended does nothing; ending one never begun (an
   * adapter that brackets without beginning) credits only what changed
   * after this moment, as before scopes.
   */
  endAuditedAction(id: string, o: { wait?: boolean } = {}): AuditedActionEnd {
    const seen = this.peek();
    if ((seen.ended ?? []).includes(id)) {
      return { ended: false, outside: [], outsideReads: [] };
    }
    // Only what the action may write or reads is walked (a read-only command: its read set); an
    // action that may write anything, reads anything or has no scope: the whole project. A change
    // elsewhere is no business of this action: the next use, rescan or the watcher finds it.
    const v = seen.actions[id];
    const ra = v === undefined ? null : runningOf(v);
    const roots =
      ra && ra.writes !== "any" && ra.reads !== "any"
        ? scopeRoots([...(ra.writes === "none" ? [] : ra.writes), ...ra.reads])
        : null;
    const snap =
      roots && roots.length === 0
        ? { root: this.root, files: {}, uncovered: [], incomplete: null }
        : snapshotProject(this.root, { ...this.snapOpts, prior: seen.files, under: roots });
    return this.mutate((s, log) => {
      const known = Object.hasOwn(s.actions, id);
      const a: RunningAction = known
        ? runningOf(s.actions[id])
        : { at: this.now(), writes: "any", reads: [], outside: [] };
      // Changes are the command's only when made after it started (change
      // time, which no program can set back) and inside its write scope.
      const started = a.at;
      delete s.actions[id];
      s.ended = [...(s.ended ?? []).filter((x) => x !== id), id].slice(-64);
      const accepted: string[] = [];
      const outside = new Set(a.outside);
      for (const rel of [
        ...new Set([...keysWithin(s.files, roots), ...Object.keys(snap.files)]),
      ].toSorted(cmp)) {
        const inNow = Object.hasOwn(snap.files, rel);
        if (s.changed[rel] || (!inNow && !coveredBy(snap.uncovered, rel))) {
          continue;
        }
        // The walk ran before the lock: where it saw something else than the record, read again
        // now, so a gated write another hook recorded meanwhile is never credited back to the
        // older content (session 7b2243a5: a parallel fork's Bash end undid a recorded Edit).
        const cur = this.fresh(s, rel, inNow ? snap.files[rel] : null);
        if (sameEntry(s.files[rel] ?? null, cur)) {
          setEntry(s, rel, cur);
          continue;
        }
        if (changedBefore(cur, started)) {
          this.verify(s, rel, "rescan", log, cur);
          continue;
        }
        if (writesCover(a, rel)) {
          accepted.push(rel);
          setEntry(s, rel, cur);
          this.keep(rel, cur);
          this.noteAgent(s, rel, log);
          continue;
        }
        if (duringAction(s, rel, cur)) {
          continue; // another running action may have made it: decided when that one ends
        }
        // Made while this action ran, outside what it may change: not the agent's.
        this.verify(s, rel, "rescan", log, cur);
        outside.add(rel);
      }
      if (!roots) {
        s.uncovered = [...snap.uncovered];
      }
      if (accepted.length) {
        log({
          type: "agent-action",
          paths: accepted.slice(0, 50),
          detail: `${accepted.length} files changed by the checked call ${JSON.stringify(id)}`,
        });
      }
      const all = [...outside].toSorted(cmp);
      const reads = all.filter((r) => readsCover(a, r));
      if (reads.length) {
        log({
          type: "blocked",
          paths: reads.slice(0, 50),
          detail: `${FILE_CHANGED_CODE}: changed outside the agent while the checked call ${JSON.stringify(id)} that reads it ran; its output is withheld from the model`,
        });
      }
      return { ended: known, outside: all, outsideReads: reads };
    }, o);
  }

  // The entry the walk saw, or, when it differs from the record, the path read again now.
  private fresh(s: LedgerState, rel: string, seen: FileEntry | null): FileEntry | null {
    const prior = s.files[rel] ?? null;
    if (sameEntry(prior, seen)) {
      return seen;
    }
    try {
      return entryOf(path.join(this.root, rel), prior);
    } catch {
      return seen;
    }
  }

  /** An "ask" was returned for a call: what the person would approve (bound to the digests now). */
  noteAsked(
    callId: string | null,
    statuses: readonly PathStatus[],
    detail: string,
    commit: { dir: string; head: string | null } | null = null,
  ): void {
    this.mutate((s, log) => {
      const files = statuses.flatMap((x) =>
        x.entry?.kind === "file" ? [{ path: x.path, sha256: x.entry.sha256 }] : [],
      );
      if (callId) {
        s.asked[callId] = { at: this.now(), files, ...(commit ? { commit } : {}) };
        const ids = Object.keys(s.asked);
        for (const old of ids.slice(0, Math.max(0, ids.length - 64))) {
          delete s.asked[old];
        }
      }
      log({ type: "asked", paths: statuses.map((x) => x.path), detail });
    });
  }

  /**
   * The call ran (the adapter's post-call event): an "ask" it carried was
   * approved by a person, so the plain files it named are approved at the
   * digests they were asked with.
   */
  noteCallRan(callId: string | null): void {
    if (!callId || !this.peek().asked[callId]) {
      return;
    }
    this.mutate((s, log) => {
      const a = s.asked[callId];
      if (!a) {
        return;
      }
      delete s.asked[callId];
      for (const f of a.files) {
        s.approvals[f.path] = { sha256: f.sha256, at: this.now(), callId };
      }
      log({
        type: "approved",
        paths: a.files.map((f) => f.path),
        detail: a.files.map((f) => `${f.path} sha256 ${f.sha256.slice(0, 16)}`).join("; "),
      });
    });
  }

  /**
   * A changed file that runs or configures what runs was read as text (a Read, or a read-only
   * command): reading is not use, so it was allowed, and recorded here.
   */
  noteInspected(paths: readonly string[], detail: string): void {
    this.mutate((_s, log) => log({ type: "inspected", paths: [...paths], detail }));
  }

  noteBlocked(paths: readonly string[], detail: string): void {
    this.mutate((_s, log) => log({ type: "blocked", paths: [...paths], detail }));
  }

  /** Changed files an allowed call reads, edits or names (not as code): allowed, and recorded. */
  noteUsed(paths: readonly string[], detail: string): void {
    this.mutate((_s, log) => log({ type: "used", paths: [...paths], detail }));
  }

  /** Code from changed files runs in an allowed contained call: allowed, and recorded. */
  noteContained(paths: readonly string[], detail: string): void {
    this.mutate((_s, log) => log({ type: "contained", paths: [...paths], detail }));
  }

  /** These paths' agent changes were accepted by a person (their history may be pruned): no longer listed. */
  forgetAgentChanges(paths: readonly string[]): void {
    this.mutate((s) => {
      for (const p of paths) {
        const rel = this.relOf(p);
        if (rel) {
          delete s.agent?.[rel];
        }
      }
    });
  }

  /** The changes outside the agent outstanding now (read only: the record as held, not a copy). */
  changes(): Readonly<Record<string, ChangeRecord>> {
    return this.peek().changed;
  }

  /** Recorded paths that configure what git starts (hooks, config, attributes, modules). */
  gitConfigPaths(): string[] {
    const s = this.peek();
    return s.gitPaths ?? Object.keys(s.files).filter((r) => GIT_CONFIG.test(r));
  }

  /** Build files the agent changed since they were last accepted or committed, sorted. */
  agentBuildFiles(): string[] {
    return this.agentChanged().filter((r) => isBuildFilePath(r));
  }

  /** Paths the agent changed since they were last accepted or committed, sorted. */
  agentChanged(): string[] {
    return Object.keys(this.peek().agent ?? {}).toSorted(cmp);
  }

  /** Bytes the copies of recorded content take now (the store's own count). */
  keptBytes(): number {
    return this.store?.bytes() ?? 0;
  }

  /**
   * The recorded content of a path changed outside the agent: what putting
   * the change back writes. Null: the path is not changed outside the agent.
   * A kept blob or copy is checked against the recorded digest; one that is
   * gone or does not match is "none" (the change is recorded, but Enclawed
   * cannot put it back).
   */
  baselineOf(p: string): Baseline | null {
    const rel = this.relOf(p);
    const s = this.peek();
    const ch = rel ? s.changed[rel] : undefined;
    if (!rel || !ch) {
      return null;
    }
    const before = ch.covered ? ch.before : null;
    if (!ch.covered) {
      return { path: rel, before: null, content: null, kept: "none" };
    }
    if (!before) {
      return { path: rel, before: null, content: null, kept: "absent" };
    }
    if (before.kind === "link") {
      return { path: rel, before, content: null, kept: "link" };
    }
    if (before.kind !== "file") {
      return { path: rel, before, content: null, kept: "none" };
    }
    const ref = s.kept?.[rel];
    if (ref && ref.sha256 === before.sha256) {
      if (ref.at === "copy") {
        const b = this.store?.get(ref.sha256) ?? null;
        if (b) {
          return { path: rel, before, content: b, kept: "copy" };
        }
      } else {
        const repo = this.repo();
        const b = repo ? gitBlobOf(repo, ref.blob) : null;
        if (b && sha256Of(b) === before.sha256) {
          return { path: rel, before, content: b, kept: "git" };
        }
      }
    }
    return { path: rel, before, content: null, kept: "none" };
  }

  /** A git commit asked of a person was not approved at Enclawed's own prompt: running it accepts nothing. */
  dropCommitAcceptance(callId: string | null): void {
    if (!callId || !this.peek().asked[callId]?.commit) {
      return;
    }
    this.mutate((s) => {
      const a = s.asked[callId];
      if (a) {
        const { commit: _dropped, ...rest } = a;
        s.asked[callId] = rest;
      }
    });
  }

  /**
   * A git commit a person approved ran (the adapter's post-call event, ran or
   * failed: HEAD moving is what counts). Every path the new commit changed
   * that is on disk exactly as committed (same blob id; absent when the
   * commit deletes it) is accepted: a change outside the agent on it is
   * cleared (audited, with the digests), its recorded content is now HEAD's
   * blob (its copy is released), and it leaves the list of paths the agent
   * changed. A path committed with content other than what is on disk (a
   * partial staging) stays as it is. Null: the call was no such commit.
   */
  acceptCommit(callId: string | null): CommitAcceptance | null {
    const asked = callId ? this.peek().asked[callId] : undefined;
    const c = asked?.commit;
    if (!callId || !c) {
      return null;
    }
    const repo = this.useGit ? gitRepoOf(c.dir) : null;
    const head = repo ? gitHeadOf(repo) : null;
    const moved = repo !== null && head !== null && head !== c.head;
    const paths = moved && repo && head ? gitChangedPaths(repo, c.head, head) : null;
    const tree = moved && repo && head ? gitTreeOf(repo, head) : null;
    return this.mutate((s, log) => {
      const a = s.asked[callId];
      if (a) {
        const { commit: _dropped, ...rest } = a;
        s.asked[callId] = rest;
      }
      if (!repo || !head || !moved || !paths || !tree) {
        return { commit: null, accepted: [], committed: [] };
      }
      const accepted: string[] = [];
      const committed: string[] = [];
      for (const p of paths) {
        const abs = path.join(repo.top, p);
        const rel = this.relOf(abs);
        if (!rel) {
          continue;
        }
        const blob = tree.get(p) ?? null;
        const cur = entryOf(abs, s.files[rel] ?? null);
        let asOnDisk: boolean;
        if (blob === null) {
          asOnDisk = cur === null;
        } else if (cur?.kind === "file") {
          const data = readPlainFile(abs, Number.MAX_SAFE_INTEGER);
          asOnDisk =
            data !== null && sha256Of(data) === cur.sha256 && gitBlobId(data, blob.length) === blob;
        } else {
          asOnDisk = false;
        }
        if (!asOnDisk) {
          continue;
        }
        committed.push(rel);
        const ch = s.changed[rel];
        if (ch) {
          accepted.push(rel);
          log({
            type: "accepted",
            paths: [rel],
            detail: `${changeSummary({ ...ch, after: cur })}; included in the git commit ${head.slice(0, 12)} a person approved at Enclawed's prompt`,
          });
          delete s.changed[rel];
          delete s.approvals[rel];
        }
        setEntry(s, rel, cur);
        delete s.agent?.[rel];
        countCopies(s);
        setKept(
          s,
          rel,
          cur?.kind === "file" && blob
            ? { sha256: cur.sha256, size: cur.size, at: "git", blob, commit: head }
            : null,
          this.batch,
        );
      }
      log({
        type: "accepted",
        paths: committed.slice(0, 50),
        detail: `git commit ${head.slice(0, 12)} approved by a person: ${committed.length} committed file(s) as on disk, ${accepted.length} of them changed outside the agent (accepted)`,
      });
      return { commit: head, accepted, committed };
    });
  }

  /**
   * A person, outside the agent (a command of the adapter's own, never a
   * tool call), reviewed the changes and makes them part of the recorded
   * state. The only way back for an executable or execution configuration,
   * besides putting the file back.
   */
  acceptByPerson(paths: readonly string[], note: string): string[] {
    return this.mutate((s, log, k) => {
      k.git = true;
      const done: string[] = [];
      for (const p of paths) {
        const rel = this.relOf(p);
        if (!rel) {
          continue;
        }
        const cur = entryOf(path.join(this.root, rel), null);
        const ch = s.changed[rel];
        delete s.changed[rel];
        delete s.approvals[rel];
        setEntry(s, rel, cur);
        this.keep(rel, cur);
        done.push(rel);
        log({
          type: "accepted",
          paths: [rel],
          detail: `${ch ? changeSummary({ ...ch, after: cur }) : `sha256 ${shortSha(cur)}`}; ${note.slice(0, 200)}`,
        });
      }
      return done;
    });
  }

  /** The session ended: running actions and unanswered asks are dropped (the record and changes stay). */
  endSession(): void {
    this.mutate((s) => {
      s.actions = {};
      s.asked = {};
      s.ended = [];
    });
  }
}

// Kernel change times run on a coarse clock: a change made just after a
// command started may carry a time slightly before it.
const CLOCK_SLACK_MS = 1000;

function ctimeMs(e: FileEntry): number | null {
  if (e.kind !== "file") {
    return null;
  }
  const ns = e.stat.replace(/^racy:/, "").split(":")[4];
  return ns && /^\d+$/.test(ns) ? Number(BigInt(ns) / 1_000_000n) : null;
}

/** A file whose change time is before `since` (minus the clock slack): not changed by what started then. */
function changedBefore(e: FileEntry | null, since: number): boolean {
  const t = e ? ctimeMs(e) : null;
  return t !== null && t < since - CLOCK_SLACK_MS;
}

/** A running action as recorded (a bare start time is a record written before scopes). */
function runningOf(v: number | RunningAction): RunningAction {
  return typeof v === "number" ? { at: v, writes: "any", reads: [], outside: [] } : v;
}

function writesCover(a: RunningAction, rel: string): boolean {
  return a.writes === "any" || (Array.isArray(a.writes) && a.writes.includes(rel));
}

function readsCover(a: RunningAction, rel: string): boolean {
  return a.reads === "any" || a.reads.some((p) => p === "" || rel === p || rel.startsWith(`${p}/`));
}

/**
 * A checked command whose write scope covers `rel` runs, and the entry may be
 * its doing (changed after it started).
 */
function duringAction(s: LedgerState, rel: string, e: FileEntry | null): boolean {
  return Object.values(s.actions).some((v) => {
    const a = runningOf(v);
    return writesCover(a, rel) && !changedBefore(e, a.at);
  });
}

/** A change outside the agent: every running action it happened during notes it (its output may carry it). */
function markOutside(s: LedgerState, rel: string, e: FileEntry | null): void {
  for (const [id, v] of Object.entries(s.actions)) {
    const a = runningOf(v);
    if (!writesCover(a, rel) && !changedBefore(e, a.at) && !a.outside.includes(rel)) {
      a.outside = [...a.outside, rel].slice(-256);
      s.actions[id] = a;
    }
  }
}

/** Scope roots as relative paths, or null for the whole project ("" or none given). */
function scopeRoots(under: readonly string[] | null): string[] | null {
  if (!under) {
    return null;
  }
  const rs = [...new Set(under.map((r) => r.replace(/\/+$/, "")))].toSorted(cmp);
  if (rs.includes("")) {
    return null;
  }
  return rs.filter((r) => !rs.some((o) => o !== r && r.startsWith(`${o}/`)));
}

/** The record's paths under the roots (all of them for null), loading only the shards needed. */
function keysWithin(files: Readonly<Record<string, FileEntry>>, roots: readonly string[] | null) {
  return keysOf(files, roots);
}

function setEntry(s: LedgerState, rel: string, e: FileEntry | null): void {
  if (e) {
    s.files[rel] = e;
  } else {
    delete s.files[rel];
  }
  if (GIT_CONFIG.test(rel)) {
    const g = new Set(s.gitPaths ?? []);
    if (e ? !g.has(rel) : g.has(rel)) {
      if (e) {
        g.add(rel);
      } else {
        g.delete(rel);
      }
      s.gitPaths = [...g].toSorted(cmp);
    }
  }
}

/** The copy counters, computed from `kept` once for a record from before they existed. */
function countCopies(s: LedgerState): void {
  if (s.copies && typeof s.copyBytes === "number") {
    return;
  }
  const refs: Record<string, number> = {};
  let bytes = 0;
  for (const r of Object.values(s.kept ?? {})) {
    if (r.at === "copy") {
      if (!refs[r.sha256]) {
        bytes += onDisk(r.size);
      }
      refs[r.sha256] = (refs[r.sha256] ?? 0) + 1;
    }
  }
  s.copies = refs;
  s.copyBytes = bytes;
}

/** What a copy takes on disk: whole 4 KiB blocks (a small file still takes one). */
const onDisk = (size: number) => Math.max(1, Math.ceil(size / 4096)) * 4096;

/** Where a path's recorded content is kept (null: nowhere), with the copy counters in step. */
function setKept(s: LedgerState, rel: string, ref: KeptRef | null, k: KeepBatch | null): void {
  const kept = (s.kept ??= {});
  const copies = (s.copies ??= {});
  const old = kept[rel];
  if (old?.at === "copy") {
    const n = (copies[old.sha256] ?? 1) - 1;
    if (n > 0) {
      copies[old.sha256] = n;
    } else {
      delete copies[old.sha256];
      s.copyBytes = Math.max(0, (s.copyBytes ?? 0) - onDisk(old.size));
      k?.dropped.add(old.sha256);
    }
  }
  if (ref) {
    kept[rel] = ref;
    if (ref.at === "copy") {
      if (!copies[ref.sha256]) {
        s.copyBytes = (s.copyBytes ?? 0) + onDisk(ref.size);
      }
      copies[ref.sha256] = (copies[ref.sha256] ?? 0) + 1;
      k?.dropped.delete(ref.sha256);
    }
  } else if (old) {
    delete kept[rel];
  }
}

/** A ledger kept in memory (tests, a single-process adapter). */
export function memoryFileIntegrityLedger(
  root: string,
  o: {
    audit?: IntegrityAudit | null;
    snapshot?: SnapshotOptions;
    now?: () => number;
    store?: ContentStore | null;
    git?: boolean;
  } = {},
): FileIntegrityLedger {
  let held: LedgerState | null = null;
  return new FileIntegrityLedger(
    root,
    {
      load: (lo) => (held === null ? null : lo?.shared ? held : structuredClone(held)),
      save: (s) => {
        held = s;
      },
      invalidate: () => {
        held = held === null ? null : (JSON.parse(JSON.stringify(held)) as LedgerState);
      },
      locked: (fn) => fn(),
    },
    { ...o, store: o.store === undefined ? memoryContentStore() : o.store },
  );
}

const LOCK_WAIT_MS = 10_000;
const LOCK_STALE_MS = 60_000;

/**
 * A ledger in a JSON file the adapter places in its own state directory
 * (out of the agent's reach), written atomically (temporary file, fsync,
 * rename) under a lock directory, so the launcher's watcher and every hook
 * process share it. An unreadable record throws: the rule then denies.
 */
export function fileIntegrityLedger(
  file: string,
  root: string,
  o: {
    audit?: IntegrityAudit | null;
    snapshot?: SnapshotOptions;
    now?: () => number;
    git?: boolean;
  } = {},
): FileIntegrityLedger {
  const lockDir = `${file}.lock`;
  const sleeper = new Int32Array(new SharedArrayBuffer(4));
  const validate = (s: LedgerState): LedgerState => {
    if (
      !s ||
      s.v !== 1 ||
      typeof s.root !== "string" ||
      typeof s.files !== "object" ||
      typeof s.changed !== "object"
    ) {
      throw new Error(`the file-integrity record ${file} is not a version 1 record`);
    }
    s.approvals ??= {};
    s.asked ??= {};
    s.actions ??= {};
    s.ended ??= [];
    s.events ??= [];
    s.uncovered ??= [""];
    s.kept ??= {};
    s.agent ??= {};
    return s;
  };
  // Sharded on disk, read shard by shard and held between calls of one
  // process while the files are the ones it read (./file-integrity-record.ts).
  const record = shardedRecord(file, validate);
  return new FileIntegrityLedger(
    root,
    {
      load: (lo) => record.load(lo),
      save: (s) => record.save(s),
      invalidate: () => record.invalidate(),
      locked: (fn, wait = true) => {
        fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
        // Monotonic: a wall-clock step never shortens or stretches the wait.
        const deadline = performance.now() + LOCK_WAIT_MS;
        for (;;) {
          try {
            fs.mkdirSync(lockDir);
            break;
          } catch (err) {
            if ((err as NodeJS.ErrnoException).code !== "EEXIST") {
              throw err;
            }
            try {
              // A lock left by a process that died: its age is the file's own time.
              if (Date.now() - fs.statSync(lockDir).mtimeMs > LOCK_STALE_MS) {
                fs.rmdirSync(lockDir);
                continue;
              }
            } catch {
              continue;
            }
            if (!wait) {
              throw new LedgerBusyError(file);
            }
            if (performance.now() > deadline) {
              throw new Error(`the file-integrity record ${file} stayed locked`, { cause: err });
            }
            // A short process (a hook) waits here; a long-lived one passes wait: false and
            // retries from its event loop (whenLedgerFree).
            Atomics.wait(sleeper, 0, 0, 5);
          }
        }
        try {
          return fn();
        } finally {
          fs.rmdirSync(lockDir);
        }
      },
    },
    // The copies of recorded content live beside the record (<file>.kept/objects/<sha256>).
    { ...o, own: file, store: dirContentStore(`${file}.kept`) },
  );
}

// ─── Watching during the session ────────────────────────────────────────

/**
 * Reports changes under `root` (recursive fs.watch; inotify on Linux): each
 * changed relative path once per settle period, `null` when the watcher
 * could not name it (the caller rescans). The adapter passes each to
 * ledger.noteOutsideChange, which tells the agent's own writes apart by
 * digest. Correctness never rests on the watcher: every use verifies again.
 */
export function watchProject(
  root: string,
  onChange: (rel: string | null) => void,
  o: { onError?: (err: unknown) => void; settleMs?: number } = {},
): { stop(): void } {
  const pending = new Set<string | null>();
  let timer: NodeJS.Timeout | null = null;
  const flush = () => {
    timer = null;
    const items = [...pending].toSorted((a, b) => cmp(a ?? "", b ?? ""));
    pending.clear();
    for (const r of items) {
      try {
        onChange(r);
      } catch (err) {
        o.onError?.(err);
      }
    }
  };
  const w = fs.watch(root, { recursive: true, persistent: false }, (_ev, name) => {
    const rel = typeof name === "string" ? name.split(path.sep).join("/") : null;
    if (rel !== null && !inIntegrityScope(rel)) {
      return;
    }
    pending.add(rel);
    timer ??= setTimeout(flush, o.settleMs ?? 50);
  });
  w.on("error", (err) => o.onError?.(err));
  return {
    stop() {
      w.close();
      if (timer) {
        clearTimeout(timer);
        flush();
      }
    },
  };
}

// ─── The decision ───────────────────────────────────────────────────────

/** What the rule decides with (a subset of the engine's options). */
// The fields are EngineOptions' own (./rule-kit.ts), named here so this module
// does not import the engine options (a type-level import cycle).
export type FileIntegrityRuleOptions = Readonly<{
  projectDir: string;
  home?: string | null;
  execConfig?: ExecConfigOption;
  skills?: SkillSet | null;
  protected?: ProtectedSet | null;
  secretPaths?: readonly string[];
  fileIntegrity?: FileIntegrityLedger | null;
}>;

// Source code and compiled code: a changed one runs when anything imports or
// loads it, so it is never approvable.
const CODE_EXT = new Set(
  (
    "sh bash zsh ksh fish csh py pyw pyc pyo pyx pxd js mjs cjs jsx ts mts cts tsx rb erb pl pm t php lua ps1 psm1 psd1 bat cmd vbs vba " +
    "r jl go rs java kt kts scala groovy gradle c h cc cpp cxx hh hpp hxx m mm cs fs swift dart ex exs erl hrl clj cljs el vim tcl awk " +
    "sed mk cmake ninja bzl star nix ipynb wasm so dylib dll exe com jar class war node lib a o elc"
  ).split(" "),
);

/** Why a changed path is never approvable (it runs or configures what runs), or null for a plain file. */
export function execClassOf(
  abs: string,
  rel: string,
  entry: FileEntry | null,
  opts: FileIntegrityRuleOptions,
): string | null {
  if (entry?.kind === "link") {
    return "a symbolic link";
  }
  if (entry?.kind === "special") {
    return "not a regular file";
  }
  if (isExecConfigPath(abs, opts.execConfig)) {
    return "execution configuration";
  }
  if (isBuildFilePath(abs)) {
    return "a build file";
  }
  if (entry?.kind === "file" && entry.exec) {
    return "an executable file";
  }
  if (entry?.kind === "file" && entry.runnable) {
    return "a program or script";
  }
  const base = rel.slice(rel.lastIndexOf("/") + 1).toLowerCase();
  const dot = base.lastIndexOf(".");
  if (dot > 0 && CODE_EXT.has(base.slice(dot + 1))) {
    return "source or compiled code";
  }
  const skillDirs = [...(opts.skills?.verified ?? []), ...(opts.skills?.excluded ?? [])].map(
    (s) => s.dir,
  );
  if (
    [...skillDirs, ...(opts.skills?.roots ?? [])].some(
      (d) => abs === d || abs.startsWith(`${d}${path.sep}`),
    )
  ) {
    return "part of a skill";
  }
  return null;
}

type How = "read" | "edit" | "mention" | "run" | "load";
type Use = { abs: string; how: How; recursive: boolean; word?: string };

// Programs that only handle files as data and never load project code
// (the files they are given are checked as named).
const PLAIN_PROGRAMS = new Set(
  (
    "ls cat head tail wc grep egrep fgrep rg echo printf pwd mkdir rmdir rm touch cp mv ln chmod stat file diff cmp " +
    "sort uniq cut tr true false test [ basename dirname realpath readlink du df date sleep which cd tree nl od xxd hexdump " +
    "sha256sum sha1sum md5sum b2sum base64 column fold paste comm join tac rev"
  ).split(" "),
);
// Programs that never show content or run anything: their words are not uses.
const CONTENT_FREE = new Set(
  "ls pwd cd mkdir rmdir rm touch stat du df which test [ true false basename dirname realpath readlink date sleep tree wc sha256sum sha1sum md5sum b2sum".split(
    " ",
  ),
);
const GIT_CONFIG = /(^|\/)\.git\/(config$|hooks\/)|(^|\/)\.git(attributes|modules)$/;

const isGlob = (w: string) => /[*?[]/.test(w);

function usesOf(
  event: PreActionEvent,
  cwd: string,
  home: string | null,
  opts: FileIntegrityRuleOptions,
): { uses: Use[]; loadsCode: "none" | "git" | "any" } {
  const at = (p: string) => path.resolve(cwd, expandHome(p, home));
  const uses: Use[] = [];
  let loadsCode: "none" | "git" | "any" = "none";
  if (event.kind === "read") {
    for (const r of event.reads ?? []) {
      if (!r.listOnly) {
        uses.push({ abs: at(r.path), how: "read", recursive: r.recursive === true });
      }
    }
  } else if (event.kind === "fs-write") {
    for (const w of event.writes ?? []) {
      if (w.op === "edit") {
        uses.push({ abs: at(w.path), how: "edit", recursive: false });
      }
    }
  } else if (event.kind === "shell") {
    const text = event.command?.text ?? "";
    const runWords = new Set<string>();
    // Every program of the line only lists, counts or removes names (no
    // content reaches the model, nothing runs): the words are not uses.
    let contentFree = event.command?.dialect === "posix" && !text.includes("`");
    if (event.command?.dialect === "posix") {
      let onlyGit = true;
      let prevWords: readonly string[] = [];
      for (const seg of segments(text)) {
        const p = programOf(seg.words);
        const words = seg.words;
        if (!p) {
          prevWords = words;
          continue;
        }
        contentFree &&= CONTENT_FREE.has(p.prog) && !words.includes("<") && !words.includes("<<<");
        const argv0 = words.find((w) => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(w)) ?? "";
        if (argv0.includes("/")) {
          runWords.add(argv0);
        }
        if (INTERPRETERS.has(p.prog)) {
          // An interpreter may run any file it is given, in a code string,
          // in a here-document or here-string it reads as its code, or read
          // from the command piped into it.
          const bodies = (seg.heredocs ?? []).map((h) => h.body);
          for (const w of [...p.args, ...bodies, ...(seg.pipedFromPrev ? prevWords : [])]) {
            for (const x of [w, ...pathWords(w)]) {
              runWords.add(x);
            }
          }
        }
        if (!PLAIN_PROGRAMS.has(p.prog)) {
          loadsCode = "any";
          onlyGit &&= p.prog === "git";
        }
        prevWords = words;
      }
      if (loadsCode === "any" && onlyGit) {
        loadsCode = "git";
      }
    } else {
      loadsCode = "any";
    }
    for (const w of contentFree ? [] : pathWords(text)) {
      const glob = isGlob(w);
      const base = glob ? w.slice(0, w.search(/[*?[]/)).replace(/[^/]*$/, "") || "." : w;
      uses.push({
        abs: at(base),
        how: runWords.has(w) ? "run" : "mention",
        recursive: glob,
        word: w,
      });
    }
  } else if (event.kind === "mcp" || event.kind === "unknown") {
    const seen = new Set<string>();
    const walk = (v: unknown, d: number) => {
      if (d > 16 || seen.size > 256) {
        return;
      }
      if (
        typeof v === "string" &&
        v.length > 0 &&
        v.length < 4096 &&
        !v.includes("\n") &&
        !/^[a-z][a-z0-9+.-]*:\/\//i.test(v)
      ) {
        seen.add(v);
      } else if (Array.isArray(v)) {
        v.forEach((x) => walk(x, d + 1));
      } else if (v && typeof v === "object") {
        Object.values(v).forEach((x) => walk(x, d + 1));
      }
    };
    walk(event.params, 0);
    for (const v of seen) {
      const abs = at(v);
      if (fs.existsSync(abs)) {
        uses.push({ abs, how: "mention", recursive: false, word: v });
      }
    }
  } else if (event.kind === "skill") {
    const name = (event.skill ?? "").replace(/^\//, "");
    for (const s of opts.skills?.verified ?? []) {
      if (s.name === name) {
        uses.push({ abs: s.dir, how: "load", recursive: true });
      }
    }
  }
  // A directory named is read below it (a copy, an archive, a search).
  for (const u of uses) {
    if (!u.recursive) {
      try {
        u.recursive = fs.lstatSync(u.abs).isDirectory();
      } catch {
        /* absent: the path itself */
      }
    }
  }
  return { uses, loadsCode };
}

type Finding = { status: PathStatus; how: How; abs: string; why: string | null };

/** Where a person accepts a change outside the agent (the adapter's own command, never a tool call). */
const ACCEPT_HINT =
  "a person approves a git commit that includes it at Enclawed's prompt, or accepts it outside the agent (in Enclawed Code: `ecwctl files accept`; `ecwctl files` shows the change and can put it back)";

const CONTAINMENT =
  "Enclawed's containment (the project read-write and nothing else, a snapshot first, no network)";

/**
 * Whether the call only reads: a Read tool call, or a POSIX line the strict read-only classifier
 * (./shell-readonly.ts classifyCompound) accepts. Such a call builds, runs, sources and imports
 * nothing, so reading a changed file with it is not running its code. `git` says whether the line
 * runs git, which still reads the repository's own configuration (hooks, diff drivers), so a
 * changed one of those still counts as code it runs. Null: not read-only.
 */
function readOnlyCall(
  event: PreActionEvent,
  cwd: string,
  home: string | null,
): { git: boolean } | null {
  if (event.kind === "read") {
    return { git: false };
  }
  if (event.kind === "shell" && event.command?.dialect === "posix") {
    const v = classifyCompound(event.command.text ?? "", { cwd, home });
    return v.readOnly ? { git: v.gits.length > 0 } : null;
  }
  return null;
}

const linkish = (f: Finding) =>
  f.status.entry?.kind === "link" || f.status.entry?.kind === "special";

/** One reason a call is asked: its codes, the files, and the words. */
type Part = { code: ReasonCode; files: PathStatus[]; why: string };

type Assessment = {
  /** Fail closed: the record could not be read or checked. */
  deny: Decision | null;
  /** Asked whatever runs it (a changed link followed, a skill loaded, code handed to a tool). */
  always: Part | null;
  /** Asked unless the call's decision runs it contained (code from a changed file). */
  uncontained: Part | null;
  /** Changed files the call reads, edits or names, not as code: allowed, recorded. */
  used: Finding[];
  /** The line makes a git commit: the acceptance point. */
  commit: { dir: string; head: string | null; why: string } | null;
};

const cache = new WeakMap<PreActionEvent, Assessment>();
const finalized = new WeakMap<PreActionEvent, Decision | null>();

function callText(event: PreActionEvent): string {
  return event.kind === "shell"
    ? `Command (quoted as the agent gave it): ${q(event.command?.text ?? "", { max: 400 })}`
    : `Tool (name as given): ${q(event.tool, { max: 120 })}`;
}

const VERB: Record<How, string> = {
  read: "read",
  edit: "edited",
  mention: "used",
  run: "run",
  load: "loaded",
};

const USE_VERB: Record<How, string> = {
  read: "read",
  edit: "edit",
  mention: "use",
  run: "run",
  load: "load",
};

const more = (xs: readonly { path: string }[], what: string) =>
  xs.length > 1
    ? ` (${xs.length - 1} more ${what}: ${xs
        .slice(1, 6)
        .map((x) => showPath(x.path))
        .join(", ")}${xs.length > 6 ? ", ..." : ""})`
    : "";

/** Git's global options that take a value (git v2.53 usage). */
const GIT_VALUE_OPTIONS = new Set([
  "-c",
  "--git-dir",
  "--work-tree",
  "--namespace",
  "--exec-path",
  "--config-env",
  "--super-prefix",
  "--list-cmds",
  "--attr-source",
]);

/**
 * The directory a POSIX line's `git commit` runs in (its -C applied), or null when the line makes no
 * commit. Only `git commit` (with --amend too) is the acceptance point: it records the working tree
 * and index the person can see. merge, cherry-pick, revert, rebase and am make commits from other
 * commits; they accept nothing (their own rules decide them).
 */
function gitCommitDir(event: PreActionEvent, cwd: string, home: string | null): string | null {
  if (event.kind !== "shell" || event.command?.dialect !== "posix") {
    return null;
  }
  for (const seg of segments(event.command.text ?? "")) {
    const p = programOf(seg.words);
    if (!p || p.prog !== "git") {
      continue;
    }
    let dir = cwd;
    let i = 0;
    const a = p.args;
    while (i < a.length) {
      const w = a[i];
      if (w === "-C" && i + 1 < a.length) {
        dir = path.resolve(dir, expandHome(a[i + 1], home));
        i += 2;
      } else if (GIT_VALUE_OPTIONS.has(w)) {
        i += 2;
      } else if (w.startsWith("-")) {
        i++;
      } else {
        break;
      }
    }
    if (a[i] === "commit") {
      return dir;
    }
  }
  return null;
}

function assess(event: PreActionEvent, opts: FileIntegrityRuleOptions): Assessment {
  const none: Assessment = { deny: null, always: null, uncontained: null, used: [], commit: null };
  const ledger = opts.fileIntegrity;
  if (!ledger || !["read", "fs-write", "shell", "mcp", "skill", "unknown"].includes(event.kind)) {
    return none;
  }
  const cwd = path.isAbsolute(event.cwd) ? event.cwd : opts.projectDir;
  const used = usesOf(event, cwd, opts.home ?? null, opts);
  const uses = used.uses;
  const readOnly = readOnlyCall(event, cwd, opts.home ?? null);
  // A read-only line loads no project code; one that runs git still reads the repository's own
  // configuration, so only that counts for it.
  const loadsCode = readOnly ? (readOnly.git ? "git" : "none") : used.loadsCode;
  // What the call can reach is checked now (the used paths themselves are checked below): a
  // command that may load project code, the whole project; git, the repository's configuration;
  // a directory read or searched, that directory. The rest is no business of this decision.
  const roots: string[] = [];
  let whole = loadsCode === "any";
  for (const u of uses.filter((x) => x.recursive)) {
    for (const abs of new Set([u.abs, realpathNearestSync(u.abs)])) {
      const rel = ledger.relOf(abs);
      if (rel) {
        roots.push(rel);
      } else if (isInside(path.resolve(abs), ledger.root)) {
        whole = true; // the project itself, or a directory holding it
      }
    }
  }
  if (loadsCode === "git") {
    roots.push(
      ".git/config",
      ".git/hooks",
      ".gitattributes",
      ".gitmodules",
      ...ledger.gitConfigPaths(),
    );
  }
  if (whole) {
    ledger.rescan();
  } else if (roots.length) {
    ledger.rescan(roots);
  }
  // Enclawed's own state, policy and code, the agent CLI's secrets and the
  // record itself are judged by their own rules (protected / secret paths),
  // never as files of the project.
  const owned = (rel: string) => {
    const abs = path.join(ledger.root, rel);
    return (
      (ledger.own !== null &&
        (isInside(ledger.own, abs) || isInside(path.dirname(ledger.own), abs))) ||
      (opts.protected ? isProtectedPath(opts.protected, [abs]) : false) ||
      (opts.secretPaths ?? []).some((x) => isInside(x, abs))
    );
  };
  const rels = new Map<string, Use>();
  const changedNow = ledger.changes();
  for (const u of uses) {
    for (const abs of new Set([u.abs, realpathNearestSync(u.abs)])) {
      const rel = ledger.relOf(abs);
      const top = rel ?? (path.resolve(abs) === ledger.root ? "" : null);
      if (top === null) {
        continue;
      }
      if (rel && !owned(rel)) {
        rels.set(rel, pick(rels.get(rel), u));
      }
      if (u.recursive) {
        for (const c of Object.keys(changedNow)) {
          if ((top === "" || c.startsWith(`${top}/`)) && !owned(c)) {
            rels.set(c, pick(rels.get(c), u));
          }
        }
      }
    }
  }
  const findings: Finding[] = ledger
    .check([...rels.keys()])
    .filter((st) => st.state === "changed" || st.state === "approved")
    .map((st) => {
      const abs = path.join(ledger.root, st.path);
      return {
        status: st,
        how: (rels.get(st.path) as Use).how,
        abs,
        why: execClassOf(abs, st.path, st.entry, opts),
      };
    });
  const always: Finding[] = [];
  const uncontained: Finding[] = [];
  const usedFiles: Finding[] = [];
  for (const f of findings) {
    if (event.kind === "fs-write") {
      // The agent's own edit: allowed; its history is kept as for any edit.
      usedFiles.push(f);
    } else if (linkish(f)) {
      // A changed link or special file is followed by what reads it: asked; run by a command, it
      // may still run contained (containment reads only the files it pinned).
      (event.kind === "shell" && !readOnly ? uncontained : always).push(f);
    } else if (event.kind === "read" || (readOnly && (f.how === "read" || f.how === "mention"))) {
      usedFiles.push(f);
    } else if (event.kind === "skill") {
      always.push(f);
    } else if (event.kind === "shell") {
      // Run as code, or code named by a command that may load code: only contained.
      const runs = f.how === "run" || f.how === "load" || (f.why !== null && loadsCode !== "none");
      (runs ? uncontained : usedFiles).push(f);
    } else {
      // An MCP or unknown tool handed a changed code file may run it, outside any containment.
      (f.why !== null ? always : usedFiles).push(f);
    }
  }
  // A command that may load project code reaches a changed code file without naming it (an
  // import, a package script, a git hook).
  let reached: ChangeRecord[] = [];
  if (loadsCode !== "none") {
    const named = new Set(findings.map((f) => f.status.path));
    reached = Object.values(ledger.changes())
      .filter(
        (c) =>
          c.after !== null &&
          !named.has(c.path) &&
          !owned(c.path) &&
          (loadsCode === "any" || GIT_CONFIG.test(c.path)),
      )
      .filter((c) => execClassOf(path.join(ledger.root, c.path), c.path, c.after, opts) !== null)
      .toSorted((a, b) => cmp(a.path, b.path));
  }
  const a: Assessment = { ...none, used: usedFiles };
  if (always.length) {
    const f = always[0];
    const what =
      f.status.entry?.kind === "link"
        ? "a symbolic link, which would be followed"
        : f.status.entry?.kind === "special"
          ? "not a regular file"
          : event.kind === "skill"
            ? "part of the skill that would be loaded"
            : `${f.why ?? "code"}, handed to a tool that may run it outside ${CONTAINMENT}`;
    a.always = {
      code: FILE_CHANGED_CODE,
      files: always.map((x) => x.status),
      why: `the file ${showPath(f.status.path)} was changed outside the agent (${changeSummary(f.status.change as ChangeRecord)}), and it is ${what}${more(
        always.map((x) => x.status),
        "such files",
      )}`,
    };
  }
  if (uncontained.length || reached.length) {
    const f = uncontained[0];
    const why = f
      ? `the file ${showPath(f.status.path)} was changed outside the agent (${changeSummary(f.status.change as ChangeRecord)}), and it is ${linkish(f) ? "a symbolic link or special file" : (f.why ?? "a file the agent would run as code")} that this command would ${USE_VERB[f.how]} outside ${CONTAINMENT}${more(
          uncontained.map((x) => x.status),
          "such files",
        )}`
      : `this command may load code of the project, and ${showPath(reached[0].path)} was changed outside the agent (${changeSummary(reached[0])}); it is ${execClassOf(path.join(ledger.root, reached[0].path), reached[0].path, reached[0].after, opts)}, and the command would run outside ${CONTAINMENT}${more(reached, "such files")}`;
    a.uncontained = {
      code: FILE_CHANGED_EXEC_CODE,
      files: [
        ...uncontained.map((x) => x.status),
        ...reached.map((c) => ({
          path: c.path,
          state: "changed" as const,
          entry: c.after,
          change: c,
        })),
      ],
      why: `${why}. Code from a file changed outside the agent runs without asking only contained, until ${ACCEPT_HINT}. Approve only if you made or reviewed the change`,
    };
  }
  const commitDir = gitCommitDir(event, cwd, opts.home ?? null);
  if (commitDir && event.approvalRoute === "person") {
    a.commit = commitNote(ledger, commitDir, owned);
  }
  return a;
}

/** What approving a git commit accepts, in plain words, and HEAD before it. */
function commitNote(
  ledger: FileIntegrityLedger,
  dir: string,
  owned: (rel: string) => boolean,
): Assessment["commit"] {
  const repo = gitRepoOf(dir);
  if (!repo) {
    return null;
  }
  const head = gitHeadOf(repo);
  const outside = Object.values(ledger.changes())
    .filter((c) => !owned(c.path))
    .map((c) => c.path)
    .toSorted(cmp);
  const agentAll = ledger.agentChanged().filter((r) => !owned(r));
  // Files git ignores (build output) are never committed: not counted.
  const tops = agentAll.map((r) => topRelOf(repo, ledger.root, r));
  const ignored = gitIgnoredOf(
    repo,
    tops.filter((t): t is string => t !== null),
  );
  const agent = agentAll.filter((_r, i) => {
    const t = tops[i];
    return t !== null && !ignored.has(t);
  });
  const names = (xs: readonly string[], n: number) =>
    xs.length
      ? `: ${xs
          .slice(0, n)
          .map((x) => showPath(x))
          .join(", ")}${xs.length > n ? `, and ${xs.length - n} more` : ""}`
      : "";
  const builds = agent.filter((r) => isBuildFilePath(r));
  const why = `this is a git commit, the point where changes are accepted. Approving it accepts what the commit includes, as it is on disk, of ${agent.length} file(s) the agent changed${names(agent, 6)} and ${outside.length} file(s) changed outside the agent${names(outside, 20)}; their kept history versions are then deleted (git holds that content once it is committed). ${builds.length ? `Build files the agent changed: ${builds.map((b) => showPath(b)).join(", ")}; review them before you build outside Enclawed. ` : ""}Changes the commit leaves out stay recorded and reversible`;
  return { dir, head, why };
}

const RANK: Record<How, number> = { mention: 0, read: 1, edit: 2, run: 3, load: 4 };
const pick = (a: Use | undefined, b: Use): Use => (a && RANK[a.how] >= RANK[b.how] ? a : b);

function assessed(event: PreActionEvent, opts: FileIntegrityRuleOptions): Assessment {
  let a = cache.get(event);
  if (!a) {
    try {
      a = assess(event, opts);
    } catch (err) {
      // The record cannot be read or checked: nothing is decided on it (fail closed).
      a = {
        deny: deny(
          [FILE_CHANGED_EXEC_CODE],
          `the record of the project's files could not be checked (${q((err as Error)?.message ?? String(err), { max: 200 })}), so whether this call runs code from a file changed outside the agent is unknown. ${callText(event)}`,
          null,
        ),
        always: null,
        uncontained: null,
        used: [],
        commit: null,
      };
    }
    cache.set(event, a);
  }
  return a;
}

/**
 * The deny half: only fail closed (the record could not be read or
 * checked). A change outside the agent is never denied by itself; it is
 * asked about only where code from it would run outside containment (the
 * ask half). Goes before every rule that may ask or allow (it also rescans
 * the project for the call).
 */
export async function fileIntegrityDenyRule(
  event: PreActionEvent,
  opts: FileIntegrityRuleOptions,
): Promise<Decision | null> {
  return assessed(event, opts).deny;
}

/**
 * The ask half, given the decision the call's own rules reached (`decided`;
 * null: as if not contained). Asked of a person (denied where no person can
 * be asked):
 *   - code from a changed file run outside containment (not when `decided`
 *     runs the call contained: then allowed, recorded as "contained");
 *   - a changed link or special file followed, a skill loaded from changed
 *     files, a changed code file handed to an MCP or unknown tool;
 *   - a git commit, with a person to ask: the acceptance point (what
 *     approving accepts is said; the answer is kept for acceptCommit).
 * Reads, edits and other uses of changed files are allowed and recorded
 * ("used", "inspected"). Null: nothing to ask. Goes after the call's own
 * rules (the engine merges both reasons into one question).
 */
export async function fileIntegrityAskRule(
  event: PreActionEvent,
  opts: FileIntegrityRuleOptions,
  decided: Decision | null = null,
): Promise<Decision | null> {
  if (finalized.has(event)) {
    return finalized.get(event) ?? null;
  }
  const a = assessed(event, opts);
  const ledger = opts.fileIntegrity;
  if (a.deny || !ledger) {
    return null;
  }
  const contained = Boolean(decided?.contain) && decided?.outcome !== "deny";
  const parts: Part[] = [];
  if (a.always) {
    parts.push(a.always);
  }
  if (a.uncontained && contained) {
    ledger.noteContained(
      a.uncontained.files.map((x) => x.path),
      `runs contained (${a.uncontained.files
        .map((x) => `${x.path}: ${x.change ? changeSummary(x.change) : "changed"}`)
        .join("; ")
        .slice(0, 1500)})`,
    );
  } else if (a.uncontained) {
    parts.push(a.uncontained);
  }
  if (a.used.length) {
    const inspected = a.used.filter((f) => f.why !== null);
    const plain = a.used.filter((f) => f.why === null);
    const detail = (xs: Finding[]) =>
      xs
        .map(
          (x) =>
            `${x.status.path}${x.why ? ` (${x.why})` : ""}: ${changeSummary(x.status.change as ChangeRecord)}`,
        )
        .join("; ")
        .slice(0, 1500);
    if (inspected.length) {
      ledger.noteInspected(
        inspected.map((x) => x.status.path),
        `${event.kind === "fs-write" ? "edited by the agent" : "read as text, not run"} (${detail(inspected)})`,
      );
    }
    if (plain.length) {
      ledger.noteUsed(
        plain.map((x) => x.status.path),
        `${event.kind === "fs-write" ? "edited by the agent" : `${VERB[plain[0].how]} by an allowed call`} (${detail(plain)})`,
      );
    }
  }
  if (a.commit) {
    parts.push({ code: GIT_COMMIT_ACCEPTS_CODE, files: [], why: a.commit.why });
  }
  if (!parts.length) {
    finalized.set(event, null);
    return null;
  }
  const codes = [...new Set(parts.map((p) => p.code))];
  const why = `${parts.map((p) => p.why).join(". Also: ")}. ${callText(event)}`;
  const d = personOnly(
    codes,
    why,
    a.uncontained && !contained ? CAPABILITY.SPAWN_PROC : CAPABILITY.FS_READ,
    event,
  );
  const files = parts.flatMap((p) => p.files);
  const detail = parts
    .map(
      (p) =>
        `${p.code}: ${p.files.length ? p.files.map((x) => `${x.path} (${x.change ? changeSummary(x.change) : "changed"})`).join("; ") : "git commit"}`,
    )
    .join(" | ")
    .slice(0, 1500);
  if (d.outcome === "ask") {
    ledger.noteAsked(
      event.callId,
      files,
      detail,
      a.commit ? { dir: a.commit.dir, head: a.commit.head } : null,
    );
  } else {
    ledger.noteBlocked(
      files.map((x) => x.path),
      `${detail} (no person to ask)`,
    );
  }
  finalized.set(event, d);
  return d;
}

/**
 * The call kinds bracketed with begin/endAuditedAction: those whose effects
 * on files are not known by path, and reads (what a read shows must be what
 * was decided: a file swapped while it runs withholds its output).
 */
export function bracketsAuditedAction(kind: PreActionEvent["kind"]): boolean {
  return (
    kind === "shell" || kind === "mcp" || kind === "skill" || kind === "unknown" || kind === "read"
  );
}
