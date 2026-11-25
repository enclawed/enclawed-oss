// enclawed adapter kit: files changed outside the agent.
//
// Enclawed keeps the content digest of every project file at the last
// audited state: the snapshot taken when a session starts, updated by every
// write the agent made through a checked call (a gated write) and by every
// checked command once it finished. A file that differs from that state
// without such an action was changed by someone else (another process, a
// person, a program running beside the session), and its USE by the agent is
// decided here:
//
//   - read into the model's context (a read tool, a shell command or a tool
//     argument naming it, an edit, which shows it): asked, and only for a
//     plain file. A person's approval binds to the file's current digest.
//   - run or loaded as code (the program of a command, an interpreter's
//     input, a sourced file, a skill's files), or any use of a file that is
//     executable, a script, source code, a symbolic link or execution
//     configuration: denied, never asked. A command that may load project
//     code at all (anything but a fixed set of plain file utilities) is
//     denied while such a changed file is in the project (an import, a
//     package script, a git hook reach it without naming it).
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
  expandHome,
  isInside,
  isProtectedPath,
  pathWords,
  realpathNearestSync,
  type ProtectedSet,
} from "./fs-probe.js";
import { deny, isExecConfigPath, personOnly, type ExecConfigOption } from "./rule-decisions.js";
import type { SkillSet } from "./skill-types.js";
import type { Decision, PreActionEvent } from "./types.js";
import { quoteUntrusted as q, showPath } from "./untrusted.js";

/** Reason codes: a plain file changed outside the agent (asked), and one that runs or configures what runs (denied). */
export const FILE_CHANGED_CODE = "file-changed-outside-agent" as const;
export const FILE_CHANGED_EXEC_CODE = "file-changed-outside-agent-exec" as const;

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
  const queue: string[] = [""];
  const stopAt = (rest: readonly string[], why: NonNullable<ProjectSnapshot["incomplete"]>) => {
    incomplete ??= why;
    uncovered.push(...rest);
  };
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
  asked: Record<string, { at: number; files: { path: string; sha256: string }[] }>;
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

interface Backend {
  load(): LedgerState | null;
  save(s: LedgerState): void;
  locked<T>(fn: () => T): T;
}

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

  constructor(
    root: string,
    backend: Backend,
    o: {
      audit?: IntegrityAudit | null;
      snapshot?: SnapshotOptions;
      now?: () => number;
      own?: string | null;
    } = {},
  ) {
    this.root = path.resolve(root);
    this.backend = backend;
    this.audit = o.audit ?? null;
    this.now = o.now ?? Date.now;
    this.own = o.own ? path.resolve(o.own) : null;
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
    const s = this.backend.load();
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

  private mutate<T>(
    fn: (s: LedgerState, log: (e: Omit<FileIntegrityEvent, "at">) => void) => T,
  ): T {
    const pending: FileIntegrityEvent[] = [];
    const out = this.backend.locked(() => {
      const s = this.state();
      const log = (e: Omit<FileIntegrityEvent, "at">) => {
        const ev = { ...e, at: this.now() };
        s.events.push(ev);
        pending.push(ev);
      };
      const r = fn(s, log);
      if (s.events.length > MAX_EVENTS) {
        s.events.splice(0, s.events.length - MAX_EVENTS);
      }
      this.backend.save(s);
      return r;
    });
    for (const e of pending) {
      try {
        void Promise.resolve(this.audit?.(e)).catch(() => {});
      } catch {
        /* the ledger's own event log keeps it */
      }
    }
    return out;
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
    return this.mutate((s, log) => {
      const firstRun = s.recordedAt === null;
      const found: ChangeRecord[] = [];
      s.actions = {};
      s.ended = [];
      s.asked = {};
      if (firstRun) {
        s.files = { ...current.files };
        s.uncovered = [...current.uncovered];
        s.recordedAt = this.now();
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
  rescan(): ChangeRecord[] {
    const prior = this.state().files;
    const snap = this.snapshot(prior);
    return this.mutate((s, log) => {
      const found: ChangeRecord[] = [];
      for (const rel of [
        ...new Set([...Object.keys(s.files), ...Object.keys(snap.files)]),
      ].toSorted(cmp)) {
        const inNow = Object.hasOwn(snap.files, rel);
        if (!inNow && !coveredBy(snap.uncovered, rel)) {
          continue;
        }
        const had = s.changed[rel];
        const st = this.verify(s, rel, "rescan", log, inNow ? snap.files[rel] : null);
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
      return { path: rel, state: cur ? "clean" : "absent", entry: cur, change: null };
    });
  }

  /** A watcher event: the path verified now (null: the watcher lost track, everything is rescanned). */
  noteOutsideChange(p: string | null): ChangeRecord[] {
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
    });
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
  endAuditedAction(id: string): AuditedActionEnd {
    if ((this.state().ended ?? []).includes(id)) {
      return { ended: false, outside: [], outsideReads: [] };
    }
    const snap = this.snapshot(this.state().files);
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
        ...new Set([...Object.keys(s.files), ...Object.keys(snap.files)]),
      ].toSorted(cmp)) {
        const inNow = Object.hasOwn(snap.files, rel);
        if (s.changed[rel] || (!inNow && !coveredBy(snap.uncovered, rel))) {
          continue;
        }
        const cur = inNow ? snap.files[rel] : null;
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
          continue;
        }
        if (duringAction(s, rel, cur)) {
          continue; // another running action may have made it: decided when that one ends
        }
        // Made while this action ran, outside what it may change: not the agent's.
        this.verify(s, rel, "rescan", log, cur);
        outside.add(rel);
      }
      s.uncovered = [...snap.uncovered];
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
    });
  }

  /** An "ask" was returned for a call: what the person would approve (bound to the digests now). */
  noteAsked(callId: string | null, statuses: readonly PathStatus[], detail: string): void {
    this.mutate((s, log) => {
      const files = statuses.flatMap((x) =>
        x.entry?.kind === "file" ? [{ path: x.path, sha256: x.entry.sha256 }] : [],
      );
      if (callId) {
        s.asked[callId] = { at: this.now(), files };
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
    if (!callId || !this.state().asked[callId]) {
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

  noteBlocked(paths: readonly string[], detail: string): void {
    this.mutate((_s, log) => log({ type: "blocked", paths: [...paths], detail }));
  }

  /**
   * A person, outside the agent (a command of the adapter's own, never a
   * tool call), reviewed the changes and makes them part of the recorded
   * state. The only way back for an executable or execution configuration,
   * besides putting the file back.
   */
  acceptByPerson(paths: readonly string[], note: string): string[] {
    return this.mutate((s, log) => {
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

function setEntry(s: LedgerState, rel: string, e: FileEntry | null): void {
  if (e) {
    s.files[rel] = e;
  } else {
    delete s.files[rel];
  }
}

/** A ledger kept in memory (tests, a single-process adapter). */
export function memoryFileIntegrityLedger(
  root: string,
  o: { audit?: IntegrityAudit | null; snapshot?: SnapshotOptions; now?: () => number } = {},
): FileIntegrityLedger {
  let held: string | null = null;
  return new FileIntegrityLedger(
    root,
    {
      load: () => (held === null ? null : (JSON.parse(held) as LedgerState)),
      save: (s) => {
        held = JSON.stringify(s);
      },
      locked: (fn) => fn(),
    },
    o,
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
  o: { audit?: IntegrityAudit | null; snapshot?: SnapshotOptions; now?: () => number } = {},
): FileIntegrityLedger {
  const lockDir = `${file}.lock`;
  const sleeper = new Int32Array(new SharedArrayBuffer(4));
  return new FileIntegrityLedger(
    root,
    {
      load: () => {
        let text: string;
        try {
          text = fs.readFileSync(file, "utf8");
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code === "ENOENT") {
            return null;
          }
          throw err;
        }
        const s = JSON.parse(text) as LedgerState;
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
        return s;
      },
      save: (s) => {
        fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
        const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
        const fd = fs.openSync(tmp, "wx", 0o600);
        try {
          fs.writeSync(fd, JSON.stringify(s));
          fs.fsyncSync(fd);
        } finally {
          fs.closeSync(fd);
        }
        fs.renameSync(tmp, file);
      },
      locked: (fn) => {
        fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
        const deadline = Date.now() + LOCK_WAIT_MS;
        for (;;) {
          try {
            fs.mkdirSync(lockDir);
            break;
          } catch (err) {
            if ((err as NodeJS.ErrnoException).code !== "EEXIST") {
              throw err;
            }
            try {
              if (Date.now() - fs.statSync(lockDir).mtimeMs > LOCK_STALE_MS) {
                fs.rmdirSync(lockDir);
                continue;
              }
            } catch {
              continue;
            }
            if (Date.now() > deadline) {
              throw new Error(`the file-integrity record ${file} stayed locked`, { cause: err });
            }
            Atomics.wait(sleeper, 0, 0, 10);
          }
        }
        try {
          return fn();
        } finally {
          fs.rmdirSync(lockDir);
        }
      },
    },
    { ...o, own: file },
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
          // or read from the command piped into it.
          for (const w of [...p.args, ...(seg.pipedFromPrev ? prevWords : [])]) {
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
type Assessment = { deny: Decision | null; ask: Decision | null };

const cache = new WeakMap<PreActionEvent, Assessment>();

function callText(event: PreActionEvent): string {
  return event.kind === "shell"
    ? `Command (untrusted, as given by the agent): ${q(event.command?.text ?? "", { max: 400 })}`
    : `Tool (untrusted name): ${q(event.tool, { max: 120 })}`;
}

const VERB: Record<How, string> = {
  read: "read",
  edit: "edited",
  mention: "used",
  run: "run",
  load: "loaded",
};

function assess(event: PreActionEvent, opts: FileIntegrityRuleOptions): Assessment {
  const ledger = opts.fileIntegrity;
  if (!ledger || !["read", "fs-write", "shell", "mcp", "skill", "unknown"].includes(event.kind)) {
    return { deny: null, ask: null };
  }
  const cwd = path.isAbsolute(event.cwd) ? event.cwd : opts.projectDir;
  const { uses, loadsCode } = usesOf(event, cwd, opts.home ?? null, opts);
  if (event.kind !== "read" && event.kind !== "fs-write") {
    ledger.rescan();
  } else if (uses.some((u) => u.recursive)) {
    ledger.rescan();
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
  const changedNow = ledger.state().changed;
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
  const denied = findings.filter((f) => f.why !== null || f.how === "run" || f.how === "load");
  if (denied.length) {
    const f = denied[0];
    const what = f.why ?? "a file the agent would run as code";
    const d = deny(
      [FILE_CHANGED_EXEC_CODE],
      `the file ${showPath(f.status.path)} was changed outside the agent (${changeSummary(f.status.change as ChangeRecord)}), and it is ${what}: a changed file of this kind may not be ${VERB[f.how]} in this session, and no approval can allow it${
        denied.length > 1
          ? ` (${denied.length - 1} more such files: ${denied
              .slice(1, 6)
              .map((x) => showPath(x.status.path))
              .join(", ")})`
          : ""
      }. A person who wants it reviews the change and accepts it outside the agent, or puts the file back. ${callText(event)}`,
      f.how === "run" || f.how === "load" ? CAPABILITY.SPAWN_PROC : CAPABILITY.FS_READ,
    );
    ledger.noteBlocked(
      denied.map((x) => x.status.path),
      `${FILE_CHANGED_EXEC_CODE}: ${denied
        .map((x) => `${x.status.path} (${changeSummary(x.status.change as ChangeRecord)})`)
        .join("; ")
        .slice(0, 1500)}`,
    );
    return { deny: d, ask: null };
  }
  if (loadsCode !== "none") {
    const st = ledger.state();
    const code = Object.values(st.changed)
      .filter(
        (c) =>
          c.after !== null && !owned(c.path) && (loadsCode === "any" || GIT_CONFIG.test(c.path)),
      )
      .filter((c) => execClassOf(path.join(ledger.root, c.path), c.path, c.after, opts) !== null)
      .toSorted((a, b) => cmp(a.path, b.path));
    if (code.length) {
      const c = code[0];
      const d = deny(
        [FILE_CHANGED_EXEC_CODE],
        `this command may load code of the project, and ${showPath(c.path)} was changed outside the agent (${changeSummary(c)}); it is ${execClassOf(path.join(ledger.root, c.path), c.path, c.after, opts)}, which would run unreviewed${
          code.length > 1
            ? ` (${code.length - 1} more such files: ${code
                .slice(1, 6)
                .map((x) => showPath(x.path))
                .join(", ")})`
            : ""
        }. No approval can allow it: a person reviews the change and accepts it outside the agent, or puts the file back. ${callText(event)}`,
        CAPABILITY.SPAWN_PROC,
      );
      ledger.noteBlocked(
        code.map((x) => x.path),
        `${FILE_CHANGED_EXEC_CODE}: command may load ${code
          .map((x) => `${x.path} (${changeSummary(x)})`)
          .join("; ")
          .slice(0, 1500)}`,
      );
      return { deny: d, ask: null };
    }
  }
  const asks = findings.filter((f) => f.status.state === "changed");
  if (!asks.length) {
    return { deny: null, ask: null };
  }
  const f = asks[0];
  const why = `the file ${showPath(f.status.path)} was changed outside the agent, by no action Enclawed checked (${changeSummary(f.status.change as ChangeRecord)})${
    asks.length > 1
      ? `, and ${asks.length - 1} more: ${asks
          .slice(1, 6)
          .map((x) => showPath(x.status.path))
          .join(", ")}`
      : ""
  }; its content would reach the model. Approve only if you made or reviewed this change. ${callText(event)}`;
  const d = personOnly([FILE_CHANGED_CODE], why, CAPABILITY.FS_READ, event);
  if (d.outcome === "ask") {
    ledger.noteAsked(
      event.callId,
      asks.map((x) => x.status),
      `${FILE_CHANGED_CODE}: ${asks
        .map((x) => `${x.status.path} (${changeSummary(x.status.change as ChangeRecord)})`)
        .join("; ")
        .slice(0, 1500)}`,
    );
  } else {
    ledger.noteBlocked(
      asks.map((x) => x.status.path),
      `${FILE_CHANGED_CODE} (no person to ask)`,
    );
  }
  return { deny: null, ask: d };
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
          `the record of the project's files could not be checked (${q((err as Error)?.message ?? String(err), { max: 200 })}), so whether this call uses a file changed outside the agent is unknown. ${callText(event)}`,
          null,
        ),
        ask: null,
      };
    }
    cache.set(event, a);
  }
  return a;
}

/**
 * The deny half: a changed file that runs or configures what runs, used in
 * any way, or any changed file run or loaded as code; a command that may load
 * project code while such a file is in the project. Goes before every rule
 * that may ask or allow.
 */
export async function fileIntegrityDenyRule(
  event: PreActionEvent,
  opts: FileIntegrityRuleOptions,
): Promise<Decision | null> {
  return assessed(event, opts).deny;
}

/**
 * The ask half: a plain changed file read into the model's context (asked
 * of a person; denied where no person can be asked). Goes after the other
 * deny rules, before the allow decisions by kind.
 */
export async function fileIntegrityAskRule(
  event: PreActionEvent,
  opts: FileIntegrityRuleOptions,
): Promise<Decision | null> {
  return assessed(event, opts).ask;
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
