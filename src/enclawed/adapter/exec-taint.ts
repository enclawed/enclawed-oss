// enclawed adapter kit: network-origin taint across commands (M5).
//
// Download-and-execute is denied inside one command line (exec-provenance).
// Split over several calls, it is the same act: `curl -o x.sh https://…` now,
// `sh x.sh` (or `./x.sh`, `python x.py`, `source x.sh`) later. So every file a
// command fetched from the network (curl -o/-O, wget and its default name or
// -O/-P, a fetcher's output redirected with > or tee, Invoke-WebRequest
// -OutFile) is remembered for the session, and a later command that runs one
// of them is denied as download-and-execute. The memory lives in a TaintStore
// (the adapter keeps it in its session directory when every hook is its own
// process).
//
// The taint follows the bytes, not only the name:
// - Unpacking a tainted archive (tar, bsdtar, unzip, 7z, jar, ar, cpio,
//   python -m zipfile/tarfile, Expand-Archive, or a tainted stream piped into
//   one) taints what it unpacks: the members the archive lists, read from the
//   archive itself (tar, gzip tar, zip), or, when its format cannot be listed
//   or it is gone, every file of the destination tree written since then.
// - Decompressing a tainted file (gunzip, xz -d, bunzip2, zstd -d, ...) taints
//   its output; mv, cp, install, ln, rsync, dd and `cat x > y` of a tainted
//   file taint the target; a tainted stream (a fetcher's, or `cat tainted`)
//   written to a file taints that file, and read by an interpreter runs it.
// - Backstop: the content digest of every downloaded file is remembered once
//   it is on disk, and running a file with that digest is download-and-execute
//   whatever its path or name (a rename another tool did, a copy by a script).
//
// An archive nobody downloaded (vendored in the repository) taints nothing.

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { FETCHERS, INTERPRETERS, outputFileOf, programOf, segments } from "./exec-provenance.js";
import { pathWords } from "./fs-probe.js";
import { archiveMembers, fileDigest } from "./taint-measure.js";
export { archiveMembers, fileDigest } from "./taint-measure.js";

/**
 * What the session remembers. `since` is a wall-clock time in ms: a tree
 * entry covers the files under it whose inode changed at or after it (ctime,
 * which no program can set back); a file entry's content is measured only
 * when it changed at or after it (so a file's earlier content is not taken
 * for the download).
 */
export type TaintEntry =
  | Readonly<{ kind: "file"; path: string; since?: number }>
  | Readonly<{ kind: "tree"; path: string; since: number }>
  | Readonly<{ kind: "digest"; sha256: string; of?: string }>
  | Readonly<{
      kind: "extract";
      id: string;
      archive: string;
      dest: string;
      strip: number;
      since: number;
    }>
  | Readonly<{ kind: "settled"; id: string }>;

/** Remembers network-origin files for a session. */
export interface TaintStore {
  add(entries: readonly (TaintEntry | string)[]): void | Promise<void>;
  list(): readonly TaintEntry[] | Promise<readonly TaintEntry[]>;
}

const asEntry = (e: TaintEntry | string): TaintEntry =>
  typeof e === "string" ? { kind: "file", path: e } : e;

export function memoryTaintStore(): TaintStore {
  const s: TaintEntry[] = [];
  return {
    add: (es) => {
      for (const e of es) {
        s.push(asEntry(e));
      }
    },
    list: () => s,
  };
}

function parseEntry(v: unknown): TaintEntry | null {
  if (typeof v === "string") {
    return { kind: "file", path: v };
  }
  if (!v || typeof v !== "object") {
    return null;
  }
  const o = v as Record<string, unknown>;
  const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : undefined);
  const str = (x: unknown) => (typeof x === "string" && x.length > 0 ? x : undefined);
  switch (o.kind) {
    case "file": {
      const p = str(o.path);
      const since = num(o.since);
      return p ? { kind: "file", path: p, ...(since === undefined ? {} : { since }) } : null;
    }
    case "tree": {
      const p = str(o.path);
      const since = num(o.since);
      return p && since !== undefined ? { kind: "tree", path: p, since } : null;
    }
    case "digest": {
      const d = str(o.sha256);
      const of = str(o.of);
      return d && /^[0-9a-f]{64}$/.test(d)
        ? { kind: "digest", sha256: d, ...(of ? { of } : {}) }
        : null;
    }
    case "extract": {
      const [id, archive, dest] = [str(o.id), str(o.archive), str(o.dest)];
      const since = num(o.since);
      return id && archive && dest && since !== undefined
        ? { kind: "extract", id, archive, dest, strip: num(o.strip) ?? 0, since }
        : null;
    }
    case "settled": {
      const id = str(o.id);
      return id ? { kind: "settled", id } : null;
    }
    default:
      return null;
  }
}

/** A store in one file of the session directory (one JSON entry per line, mode 0600). */
export function fileTaintStore(file: string): TaintStore {
  return {
    add: (es) => {
      if (es.length) {
        fs.appendFileSync(file, es.map((e) => `${JSON.stringify(asEntry(e))}\n`).join(""), {
          mode: 0o600,
        });
      }
    },
    list: () => {
      let text = "";
      try {
        text = fs.readFileSync(file, "utf8");
      } catch {
        return [];
      }
      const out: TaintEntry[] = [];
      for (const line of text.split("\n")) {
        try {
          const e = parseEntry(JSON.parse(line));
          if (e) {
            out.push(e);
          }
        } catch {
          /* a torn line */
        }
      }
      return out;
    },
  };
}

// File times come from the kernel's coarse clock, which can run a few
// milliseconds behind Date.now(): a file written right after a decision may
// carry an earlier ctime. Comparisons allow this much.
const CLOCK_SLACK_MS = 2000;

const ctimeOf = (p: string): number | null => {
  try {
    return fs.lstatSync(p).ctimeMs;
  } catch {
    return null;
  }
};

const isInsideDir = (dir: string, p: string) => {
  const r = path.relative(dir, p);
  return r === "" || (!r.startsWith("..") && !path.isAbsolute(r));
};

// ─── The session's taint, as a view ─────────────────────────────────────

/** The tainted paths, trees and digests a decision consults. */
export class TaintView {
  readonly files = new Set<string>();
  readonly trees: { path: string; since: number }[] = [];
  readonly digests = new Set<string>();

  static of(entries: readonly TaintEntry[]): TaintView {
    const v = new TaintView();
    for (const e of entries) {
      v.include(e);
    }
    return v;
  }

  /** A copy, so what one command line would taint does not leak into the original. */
  clone(): TaintView {
    const v = new TaintView();
    for (const f of this.files) {
      v.files.add(f);
    }
    v.trees.push(...this.trees);
    for (const d of this.digests) {
      v.digests.add(d);
    }
    return v;
  }

  include(e: TaintEntry): void {
    if (e.kind === "file") {
      this.files.add(e.path);
    } else if (e.kind === "tree") {
      this.trees.push({ path: e.path, since: e.since });
    } else if (e.kind === "digest") {
      this.digests.add(e.sha256);
    } else if (e.kind === "extract") {
      // Until it is settled, the whole destination written since counts.
      this.trees.push({ path: e.dest, since: e.since });
    }
  }

  get empty(): boolean {
    return this.files.size === 0 && this.trees.length === 0 && this.digests.size === 0;
  }

  /** Whether the file at an absolute path holds network-origin bytes. */
  has(p: string): boolean {
    if (this.files.has(p)) {
      return true;
    }
    for (const t of this.trees) {
      if (isInsideDir(t.path, p)) {
        // A file not there yet is one the tainted command will write.
        const c = ctimeOf(p);
        if (c === null || c >= t.since - CLOCK_SLACK_MS) {
          return true;
        }
      }
    }
    if (this.digests.size) {
      const d = fileDigest(p);
      if (d && this.digests.has(d)) {
        return true;
      }
    }
    return false;
  }

  /** Whether a directory holds tainted files (inside a tainted tree, or a tainted file under it). */
  hasUnder(dir: string): boolean {
    if (this.trees.some((t) => isInsideDir(t.path, dir) || isInsideDir(dir, t.path))) {
      return true;
    }
    for (const f of this.files) {
      if (isInsideDir(dir, f)) {
        return true;
      }
    }
    return false;
  }
}

/**
 * Settle what can be measured now: a downloaded file now on disk gets its
 * content digest remembered, and an unpacked archive its member list (or,
 * when it cannot be listed, the destination tree written since). Returns the
 * entries to add to the store.
 */
export function settleTaint(entries: readonly TaintEntry[]): TaintEntry[] {
  const out: TaintEntry[] = [];
  const digests = new Set(entries.flatMap((e) => (e.kind === "digest" ? [e.sha256] : [])));
  const settled = new Set(entries.flatMap((e) => (e.kind === "settled" ? [e.id] : [])));
  for (const e of entries) {
    if (e.kind === "file") {
      const c = ctimeOf(e.path);
      if (c !== null && (e.since === undefined || c >= e.since - CLOCK_SLACK_MS)) {
        const d = fileDigest(e.path);
        if (d && !digests.has(d)) {
          digests.add(d);
          out.push({ kind: "digest", sha256: d, of: e.path });
        }
      }
    } else if (e.kind === "extract" && !settled.has(e.id)) {
      const members = archiveMembers(e.archive);
      if (members) {
        for (const m of members) {
          const parts = m.split("/").filter((x) => x && x !== ".");
          if (parts.length > e.strip) {
            out.push({
              kind: "file",
              path: path.resolve(e.dest, ...parts.slice(e.strip)),
              since: e.since,
            });
          }
        }
      } else {
        out.push({ kind: "tree", path: e.dest, since: e.since });
      }
      out.push({ kind: "settled", id: e.id });
      settled.add(e.id);
    }
  }
  return out;
}

/** The view a decision consults: the store's entries, with settled extracts by their members only. */
export function taintViewOf(entries: readonly TaintEntry[]): TaintView {
  const settled = new Set(entries.flatMap((e) => (e.kind === "settled" ? [e.id] : [])));
  return TaintView.of(entries.filter((e) => !(e.kind === "extract" && settled.has(e.id))));
}

// ─── Reading a command line ─────────────────────────────────────────────

const norm = (cwd: string, p: string) => path.resolve(cwd, p);

function redirectTarget(words: readonly string[]): string | null {
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (/^(?:\d?>>?|&>|>\|)$/.test(w)) {
      return words[i + 1] ?? null;
    }
    const m = /^(?:\d?>>?|&>)([^&].*)$/.exec(w);
    if (m) {
      return m[1];
    }
  }
  return null;
}

function stdinRedirect(words: readonly string[]): string | null {
  for (let i = 0; i < words.length; i++) {
    if (words[i] === "<") {
      return words[i + 1] ?? null;
    }
    const m = /^<([^<(].*)$/.exec(words[i]);
    if (m) {
      return m[1];
    }
  }
  return null;
}

/** The arguments of a simple command with its redirections removed. */
// The option that gives an interpreter its code as the next word.
const INLINE_CODE_FLAG: Readonly<Record<string, string>> = {
  sh: "-c",
  bash: "-c",
  zsh: "-c",
  dash: "-c",
  ksh: "-c",
  ash: "-c",
  python: "-c",
  python2: "-c",
  python3: "-c",
  node: "-e",
  deno: "eval",
  bun: "-e",
  perl: "-e",
  ruby: "-e",
  php: "-r",
};

/** An interpreter's inline code (`python3 -c CODE`, `node -e CODE`), before any operand or -m. */
function inlineCode(prog: string, args: readonly string[]): string | null {
  const flag = INLINE_CODE_FLAG[prog];
  if (!flag) {
    return null;
  }
  for (let k = 0; k < args.length; k++) {
    const a = args[k];
    if (a === flag || (prog === "perl" && a === "-E")) {
      return args[k + 1] ?? null;
    }
    if (a === "-m" || a === "-" || !a.startsWith("-")) {
      // deno eval CODE: the subcommand is the flag.
      return prog === "deno" && a === "eval" ? (args[k + 1] ?? null) : null;
    }
  }
  return null;
}

function operandsOf(args: readonly string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (/^(?:\d?>>?|&>|>\||<)$/.test(a)) {
      i++;
      continue;
    }
    if (/^(?:\d?>>?|&>|<)./.test(a)) {
      continue;
    }
    out.push(a);
  }
  return out;
}

function urlBasename(args: readonly string[]): string[] {
  const out: string[] = [];
  for (const a of args) {
    if (/^https?:\/\//i.test(a)) {
      try {
        out.push(path.basename(new URL(a).pathname) || "index.html");
      } catch {
        /* not a URL */
      }
    }
  }
  return out;
}

const DECOMPRESSORS: Readonly<Record<string, readonly string[]>> = {
  gunzip: [".tgz", ".gz", ".z"],
  gzip: [".tgz", ".gz", ".z"],
  unxz: [".txz", ".xz"],
  xz: [".txz", ".xz", ".lzma"],
  unlzma: [".lzma"],
  lzma: [".lzma"],
  bunzip2: [".tbz2", ".tbz", ".bz2"],
  bzip2: [".tbz2", ".tbz", ".bz2"],
  zstd: [".tzst", ".zst"],
  unzstd: [".tzst", ".zst"],
  uncompress: [".z"],
  lz4: [".lz4"],
  brotli: [".br"],
};
const ALWAYS_DECOMPRESS = new Set(["gunzip", "unxz", "unlzma", "bunzip2", "unzstd", "uncompress"]);
// Programs that write their input file's bytes (decoded or decompressed) to their output.
const STREAMERS = new Set(["cat", "zcat", "gzcat", "xzcat", "bzcat", "zstdcat", "base64", "xxd"]);
const COPIERS = new Set(["cp", "mv", "install", "ln", "rsync", "ditto", "scp"]);
const TAR = new Set(["tar", "bsdtar", "gtar"]);

type Effects = {
  adds: TaintEntry[];
  runs: string | null;
  /**
   * A downloaded file named in an interpreter's inline code (a here-document,
   * a here-string, -c/-e CODE): it may be run (exec(open(...))) or only read;
   * which is undecidable, so it is asked, not denied.
   */
  mayRun: string | null;
};

let extractSeq = 0;
const extractId = (archive: string, dest: string, now: number) =>
  createHash("sha256")
    .update(`${archive}\0${dest}\0${now}\0${process.pid}\0${extractSeq++}`)
    .digest("hex")
    .slice(0, 32);

type Unpack = { archive: string | null; dest: string; strip: number };

/** What a tar command unpacks (null when it does not unpack; a null archive reads stdin). */
function tarExtract(args: readonly string[], dir: string): Unpack | null {
  let extract = false;
  let archive: string | null = null;
  let dest = dir;
  let strip = 0;
  const ops = operandsOf(args);
  // An option cluster's f takes the rest of the cluster, or the next word.
  const fileOf = (cluster: string, i: number): [string | null, number] => {
    const rest = cluster.slice(cluster.indexOf("f") + 1);
    return rest ? [rest, i] : [ops[i + 1] ?? null, i + 1];
  };
  for (let i = 0; i < ops.length; i++) {
    const a = ops[i];
    if (i === 0 && /^[A-Za-z]+$/.test(a)) {
      // Old-style keys: `tar xzf a.tgz`.
      if (a.includes("x")) {
        extract = true;
      }
      if (a.includes("f")) {
        archive = ops[++i] ?? null;
      }
      continue;
    }
    if (a === "--extract" || a === "--get") {
      extract = true;
    } else if (a === "-C" || a === "--directory") {
      dest = norm(dir, ops[++i] ?? ".");
    } else if (a.startsWith("--directory=")) {
      dest = norm(dir, a.slice(12));
    } else if (a === "--file" || a === "-f") {
      archive = ops[++i] ?? null;
    } else if (a.startsWith("--file=")) {
      archive = a.slice(7);
    } else if (a.startsWith("--strip-components")) {
      const v = a.includes("=") ? a.split("=")[1] : ops[++i];
      strip = Number.parseInt(v ?? "0", 10) || 0;
    } else if (/^-C./.test(a)) {
      dest = norm(dir, a.slice(2));
    } else if (/^-[A-Za-z]+$/.test(a)) {
      const keys = a.includes("f") ? a.slice(0, a.indexOf("f") + 1) : a;
      if (keys.includes("x")) {
        extract = true;
      }
      if (a.includes("f")) {
        [archive, i] = fileOf(a, i);
      }
    }
  }
  return extract ? { archive: archive === "-" ? null : archive, dest, strip } : null;
}

/** Unpackers other than tar: the archive they read (null: stdin) and where they write. */
function otherExtract(prog: string, args: readonly string[], dir: string): Unpack | null {
  const ops = operandsOf(args);
  if (prog === "unzip") {
    // -l, -v, -t, -Z list or test; -p writes to stdout (a stream, handled as one).
    if (ops.some((a) => /^-[A-Za-z]*[lZvtp]/.test(a) && !a.startsWith("-d"))) {
      return null;
    }
    let dest = dir;
    let archive: string | null = null;
    for (let i = 0; i < ops.length; i++) {
      const a = ops[i];
      if (a === "-d") {
        dest = norm(dir, ops[++i] ?? ".");
      } else if (a.startsWith("-d")) {
        dest = norm(dir, a.slice(2));
      } else if (!a.startsWith("-") && archive === null) {
        archive = a;
      }
    }
    return archive === null ? null : { archive, dest, strip: 0 };
  }
  if (prog === "7z" || prog === "7za" || prog === "7zr" || prog === "7zz") {
    if (ops[0] !== "x" && ops[0] !== "e") {
      return null;
    }
    const o = ops.find((a) => a.startsWith("-o"));
    const archive = ops.slice(1).find((a) => !a.startsWith("-")) ?? null;
    return archive === null ? null : { archive, dest: o ? norm(dir, o.slice(2)) : dir, strip: 0 };
  }
  if (prog === "jar") {
    const k = ops[0] ?? "";
    if (!/^-?[a-z]*x/.test(k)) {
      return null;
    }
    return { archive: k.includes("f") ? (ops[1] ?? null) : null, dest: dir, strip: 0 };
  }
  if (prog === "ar") {
    const k = ops[0] ?? "";
    return /^-?[a-z]*x/.test(k) && ops[1] ? { archive: ops[1], dest: dir, strip: 0 } : null;
  }
  if (prog === "cpio") {
    if (!ops.some((a) => /^-[A-Za-z]*i/.test(a) || a === "--extract")) {
      return null;
    }
    const d = ops.indexOf("-D");
    return { archive: null, dest: d >= 0 ? norm(dir, ops[d + 1] ?? ".") : dir, strip: 0 };
  }
  if (prog === "python" || prog === "python3" || prog === "python2") {
    const m = ops.indexOf("-m");
    const mod = m >= 0 ? ops[m + 1] : undefined;
    if ((mod === "zipfile" || mod === "tarfile") && ops[m + 2] === "-e" && ops[m + 3]) {
      return { archive: ops[m + 3], dest: norm(dir, ops[m + 4] ?? "."), strip: 0 };
    }
  }
  return null;
}

/**
 * Read one command line against the session's taint: the network-origin file
 * (or stream) it runs, and the entries it adds (downloads, unpacked archives,
 * copies, renames, decompressed output). `view` is extended in place with
 * what the line adds, so a later part of the same line sees it.
 */
export function taintEffects(
  command: string,
  dialect: "posix" | "powershell",
  cwd: string,
  view: TaintView,
  now: number = Date.now(),
): Effects {
  const out: Effects = { adds: [], runs: null, mayRun: null };
  if (typeof command !== "string" || command.length > 64 * 1024) {
    return out;
  }
  const add = (e: TaintEntry) => {
    out.adds.push(e);
    view.include(e);
  };
  const addFile = (p: string) => add({ kind: "file", path: p, since: now });
  if (dialect === "powershell") {
    powershellEffects(command, cwd, view, now, out, add, addFile);
    return out;
  }
  let dir = cwd;
  // Whether the previous simple command's output is of network origin.
  let streamTainted = false;
  for (const seg of segments(command)) {
    const p = programOf(seg.words);
    const fromStream: boolean = seg.pipedFromPrev && streamTainted;
    streamTainted = false;
    if (!p) {
      continue;
    }
    if (p.prog === "cd" && p.args[0] && !p.args[0].startsWith("-")) {
      dir = norm(dir, p.args[0]);
      continue;
    }
    const t = (w: string) => view.has(norm(dir, w));
    const inRedir = stdinRedirect(seg.words);
    const stdinTainted: boolean = fromStream || (inRedir !== null && t(inRedir));
    const redir = redirectTarget(seg.words);
    const ops = operandsOf(p.args);

    // Runs: a tainted file as the program, as an interpreter's script, or a tainted stream an interpreter reads.
    if (out.runs === null) {
      const argv0 = seg.words.find((w) => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(w)) ?? "";
      if (argv0.includes("/") && t(argv0)) {
        out.runs = norm(dir, argv0);
      } else if (argv0 && !argv0.includes("/") && !view.empty) {
        const onPath = resolveOnPath(argv0);
        if (onPath && view.has(onPath)) {
          out.runs = onPath;
        }
      }
      if (out.runs === null && INTERPRETERS.has(p.prog)) {
        // `-` before any operand: the program is read from standard input (a
        // here-document, a pipe); the operands after it are its arguments.
        const first = ops.find((a) => a === "-" || !a.startsWith("-"));
        const op = first === "-" ? undefined : first;
        if (op && t(op)) {
          out.runs = norm(dir, op);
        } else if (!op && stdinTainted) {
          out.runs = inRedir ? norm(dir, inRedir) : "(a stream of network origin)";
        }
        if (out.runs === null && out.mayRun === null) {
          const codes = (seg.heredocs ?? []).map((h) => h.body);
          const inline = inlineCode(p.prog, p.args);
          if (inline !== null) {
            codes.push(inline);
          }
          const named = codes.flatMap((code) => pathWords(code)).find((w) => t(w));
          if (named !== undefined) {
            out.mayRun = norm(dir, named);
          }
        }
      }
    }

    // Downloads.
    if (FETCHERS.has(p.prog)) {
      const o = outputFileOf(p.prog, p.args);
      if (o) {
        if (o !== "-") {
          addFile(norm(dir, o));
        }
      } else if (p.prog === "curl" && p.args.some((a) => /^-[A-Za-z]*O$|^--remote-name$/.test(a))) {
        for (const b of urlBasename(p.args)) {
          addFile(norm(dir, b));
        }
      } else if (p.prog === "wget" && !p.args.some((a) => /^-[A-Za-z]*O-$/.test(a))) {
        const pIdx = p.args.findIndex((a) => a === "-P" || a === "--directory-prefix");
        const base = pIdx >= 0 && p.args[pIdx + 1] ? norm(dir, p.args[pIdx + 1]) : dir;
        for (const b of urlBasename(p.args)) {
          addFile(norm(base, b));
        }
      }
      if (redir) {
        addFile(norm(dir, redir));
      }
      streamTainted = true;
      continue;
    }

    // Unpacking.
    const x = TAR.has(p.prog) ? tarExtract(p.args, dir) : otherExtract(p.prog, p.args, dir);
    if (x) {
      const archive = x.archive ?? inRedir;
      const tainted = archive !== null ? t(archive) : stdinTainted;
      if (tainted && archive !== null) {
        const a = norm(dir, archive);
        add({
          kind: "extract",
          id: extractId(a, x.dest, now),
          archive: a,
          dest: x.dest,
          strip: x.strip,
          since: now,
        });
      } else if (tainted) {
        add({ kind: "tree", path: x.dest, since: now });
      }
      continue;
    }

    // Decompressing a file to its name without the suffix (a.tgz -> a.tar).
    const suffixes = Object.hasOwn(DECOMPRESSORS, p.prog) ? DECOMPRESSORS[p.prog] : null;
    if (
      suffixes &&
      (ALWAYS_DECOMPRESS.has(p.prog) ||
        ops.some((a) => /^-[A-Za-z]*d/.test(a) || a === "--decompress"))
    ) {
      const toStdout = ops.some((a) => /^-[A-Za-z]*c/.test(a) || a === "--stdout");
      const oIdx = ops.indexOf("-o");
      let any: boolean = stdinTainted;
      for (const f of ops.filter((a, i) => !a.startsWith("-") && (oIdx < 0 || i !== oIdx + 1))) {
        if (!t(f)) {
          continue;
        }
        any = true;
        if (!toStdout && oIdx < 0) {
          const sfx = suffixes.find((s) => f.toLowerCase().endsWith(s));
          if (sfx) {
            const base = f.slice(0, f.length - sfx.length);
            addFile(norm(dir, sfx.length > 3 && sfx.startsWith(".t") ? `${base}.tar` : base));
          }
        }
      }
      if (any && oIdx >= 0 && ops[oIdx + 1]) {
        addFile(norm(dir, ops[oIdx + 1]));
      }
      if (any && redir) {
        addFile(norm(dir, redir));
      }
      streamTainted = any && !redir && (toStdout || stdinTainted);
      continue;
    }

    // Copies, renames, links: the target holds the same bytes.
    if (COPIERS.has(p.prog)) {
      copyEffects(p.prog, ops, dir, view, t, addFile, add, now);
      continue;
    }
    if (p.prog === "dd") {
      const iff = ops.find((a) => a.startsWith("if="))?.slice(3);
      const off = ops.find((a) => a.startsWith("of="))?.slice(3);
      const src = iff !== undefined ? t(iff) : stdinTainted;
      if (off && src) {
        addFile(norm(dir, off));
      }
      streamTainted = !off && src;
      continue;
    }

    // A tainted stream or file written out (cat x > y, curl … | tee y, unzip -p a > y).
    const readsTainted =
      stdinTainted ||
      ((STREAMERS.has(p.prog) || p.prog === "unzip" || TAR.has(p.prog)) &&
        ops.some((a) => !a.startsWith("-") && t(a)));
    if (readsTainted) {
      if (p.prog === "tee") {
        for (const a of ops.filter((w) => !w.startsWith("-"))) {
          addFile(norm(dir, a));
        }
      }
      if (redir) {
        addFile(norm(dir, redir));
      }
      streamTainted = !redir || p.prog === "tee";
    }
  }
  return out;
}

function copyEffects(
  prog: string,
  ops: readonly string[],
  dir: string,
  view: TaintView,
  t: (w: string) => boolean,
  addFile: (p: string) => void,
  add: (e: TaintEntry) => void,
  now: number,
): void {
  // Option words that take a value (install -m 755, rsync -e ssh, cp -S suffix).
  const VALUED = new Set([
    "-m",
    "--mode",
    "-o",
    "--owner",
    "-g",
    "--group",
    "-e",
    "-S",
    "--suffix",
  ]);
  let targetDir: string | null = null;
  const words: string[] = [];
  for (let i = 0; i < ops.length; i++) {
    const a = ops[i];
    if (a === "-t" || a === "--target-directory") {
      targetDir = ops[++i] ?? null;
    } else if (a.startsWith("--target-directory=")) {
      targetDir = a.slice(19);
    } else if (VALUED.has(a)) {
      i++;
    } else if (a === "--") {
      words.push(...ops.slice(i + 1));
      break;
    } else if (!a.startsWith("-")) {
      words.push(a);
    }
  }
  if (prog === "scp") {
    // A remote source (host:path) is network origin too.
    const dest = words.at(-1);
    const srcs = words.slice(0, -1);
    if (dest && !/^[^/]*:/.test(dest) && srcs.some((s) => /^[^/]*:/.test(s) || t(s))) {
      add({ kind: "tree", path: norm(dir, dest), since: now });
    }
    return;
  }
  const dest = targetDir ?? words.at(-1);
  const srcs = targetDir ? words : words.slice(0, -1);
  if (!dest || srcs.length === 0) {
    return;
  }
  const destAbs = norm(dir, dest);
  let destIsDir = targetDir !== null || srcs.length > 1 || dest.endsWith("/");
  if (!destIsDir) {
    try {
      destIsDir = fs.statSync(destAbs).isDirectory();
    } catch {
      /* a new name */
    }
  }
  for (const s of srcs) {
    const sAbs = norm(dir, s);
    const target = destIsDir ? path.join(destAbs, path.basename(sAbs)) : destAbs;
    let sIsDir = false;
    try {
      sIsDir = fs.statSync(sAbs).isDirectory();
    } catch {
      /* gone, or not there yet */
    }
    if (sIsDir && view.hasUnder(sAbs)) {
      add({ kind: "tree", path: target, since: now });
    } else if (!sIsDir && t(s)) {
      addFile(target);
    }
  }
}

function powershellEffects(
  command: string,
  cwd: string,
  view: TaintView,
  now: number,
  out: Effects,
  add: (e: TaintEntry) => void,
  addFile: (p: string) => void,
): void {
  const unq = (s: string) => s.replace(/^["']|["']$/g, "");
  if (
    /\b(iwr|irm|invoke-webrequest|invoke-restmethod|curl|wget|start-bitstransfer)\b/i.test(command)
  ) {
    for (const m of command.matchAll(/-OutFile\s+(?:"([^"]+)"|'([^']+)'|([^\s;|&]+))/gi)) {
      addFile(norm(cwd, m[1] ?? m[2] ?? m[3]));
    }
  }
  for (const stmt of command.split(/[;\n|]/)) {
    const words =
      stmt
        .trim()
        .match(/"[^"]*"|'[^']*'|\S+/g)
        ?.map(unq) ?? [];
    if (!words.length) {
      continue;
    }
    const verb = words[0].toLowerCase();
    const named = (n: string) => {
      const i = words.findIndex((w) => w.toLowerCase() === n);
      return i >= 0 ? words[i + 1] : undefined;
    };
    const positional = words
      .slice(1)
      .filter((w, i, a) => !w.startsWith("-") && !(i > 0 && a[i - 1].startsWith("-")));
    if (verb === "expand-archive") {
      const src = named("-path") ?? named("-literalpath") ?? positional[0];
      const dst = named("-destinationpath") ?? positional[1] ?? ".";
      if (src && view.has(norm(cwd, src))) {
        add({ kind: "tree", path: norm(cwd, dst), since: now });
      }
    } else if (["copy-item", "move-item", "copy", "move", "cp", "mv", "cpi", "mi"].includes(verb)) {
      const src = named("-path") ?? named("-literalpath") ?? positional[0];
      const dst = named("-destination") ?? positional[1];
      if (src && dst && view.has(norm(cwd, src))) {
        let d = norm(cwd, dst);
        try {
          if (fs.statSync(d).isDirectory()) {
            d = path.join(d, path.basename(src));
          }
        } catch {
          /* a new name */
        }
        addFile(d);
      }
    }
    if (out.runs !== null) {
      continue;
    }
    // The program a statement runs: its first word, or the one after the call operator.
    const prog = verb === "&" || verb === "." ? words[1] : words[0];
    if (prog && /[\\/]/.test(prog)) {
      const abs = norm(cwd, prog.replace(/\\/g, "/"));
      if (view.has(abs)) {
        out.runs = abs;
        continue;
      }
    }
    // As before: a downloaded file's name in the statement is running it.
    for (const f of view.files) {
      const base = path.basename(f);
      if (
        base &&
        new RegExp(
          `(^|[\\s&;'"(])\\.?[\\\\/]?[^\\s'"]*${base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
          "i",
        ).test(stmt)
      ) {
        out.runs = f;
        break;
      }
    }
  }
}

function resolveOnPath(name: string): string | null {
  if (!/^[\w.+-]+$/.test(name)) {
    return null;
  }
  for (const d of (process.env.PATH ?? "").split(path.delimiter)) {
    if (!d || !path.isAbsolute(d)) {
      continue;
    }
    const p = path.join(d, name);
    try {
      if (fs.statSync(p).isFile()) {
        return p;
      }
    } catch {
      /* not here */
    }
  }
  return null;
}

/** The files a command line fetches from the network, absolute (no earlier taint consulted). */
export function downloadedFiles(
  command: string,
  dialect: "posix" | "powershell",
  cwd: string,
): string[] {
  return [
    ...new Set(
      taintEffects(command, dialect, cwd, new TaintView()).adds.flatMap((e) =>
        e.kind === "file" ? [e.path] : [],
      ),
    ),
  ];
}

/** The network-origin file a command line runs (as a program, through an interpreter, or sourced), or null. */
export function runsTainted(
  command: string,
  dialect: "posix" | "powershell",
  cwd: string,
  tainted: ReadonlySet<string> | TaintView,
): string | null {
  const view =
    tainted instanceof TaintView
      ? tainted.clone()
      : TaintView.of([...tainted].map((p): TaintEntry => ({ kind: "file", path: p })));
  return taintEffects(command, dialect, cwd, view).runs;
}
