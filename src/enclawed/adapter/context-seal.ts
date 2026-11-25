// enclawed adapter kit: the person's session context, sealed at rest between sessions.
//
// A coding host keeps the person's session context in plaintext in its state directory: the
// conversation transcripts it resumes from, todo lists, plans, prompt history, the per-project
// memory the agent writes, backups of edited files, pasted text and images. Root on the computer
// (or any process of the person's user) that runs the host directly, with its own login or the
// person's, resumes that context outside Enclawed and outside the device-anchored record. With an
// Enclaweder bound (command set 0.5), the context is therefore kept SEALED:
//
//   open        at launch, after the launch's device-verified activation, the sealed context is
//               opened with the launch's context box (credential-keys.ts boxes.context: an X25519
//               key pair derived from KEY_DERIVE under its own purpose) into a directory made fresh
//               for the session (0700, preferably on a memory-backed filesystem), which the adapter
//               points its host at. The launch then closes the box: from here on the launcher can
//               seal context and open none.
//   seal        at the end of the session (and at a halt or a detach), every file the host left
//               under the context's names is sealed to the box's public key, one record per file
//               (a file unchanged since the launch keeps its record), the records of files the
//               session removed are erased, and the session's directory is erased (each file
//               overwritten, links unlinked, never followed).
//   record      the set of sealed records has a digest (sealedContextDigest), which the adapter
//               appends to its audit log under the store's lock with every seal, adoption and
//               discard (CONTEXT_SEAL_RECORD). The log is hash-chained and anchored in the device:
//               a launch opens the context only when the sealed set is exactly the one the log
//               last recorded (contextSealVerdict), so a record added, removed, replaced or rolled
//               back by anything else is refused, never resumed.
//
// Configuration the adapter admits at launch (the host's settings, skills, plugins) is not
// context: the adapter links it into the session's directory from where the person keeps it, and
// it is never sealed. Anything else the host writes there (caches, shell snapshots, lock files)
// does not outlive the session.
//
// What this does not do, said plainly: while a session runs its context is plaintext in the
// session's directory, which root can read and copy (as it can read the launcher's memory).

import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { type BoxRecord, isBoxRecord, type SealBox, sealToBox } from "./sealed-box.js";

const KIND = "enclawed.adapter.context-seal.v1";
const SET_TAG = "enclawed.adapter.context-seal.set.v1";
const MANIFEST = ".enclawed-context.json";
const LOCK = ".lock";
const BLOB = /^[0-9a-f]{32}\.ctx$/;

/** A context file larger than this is not sealed (it is erased all the same; a fixed bound). */
export const CONTEXT_FILE_MAX = 256 * 1024 * 1024;
/** How deep the context's directories are walked (a fixed bound). */
export const CONTEXT_DEPTH_MAX = 32;

/** The audit record types of the context seal (an adapter may prefix them with its own name). */
export const CONTEXT_SEAL_RECORD = Object.freeze({
  sealed: "context.sealed",
  adopted: "context.adopted",
  discarded: "context.discarded",
  refused: "context.refused",
} as const);

/** Where the host keeps what, in its state directory: names at the top of the directory. */
export type ContextLayout = Readonly<{
  /** The person's session context: sealed between sessions. */
  context: readonly string[];
  /** Configuration admitted at launch, linked from where the person keeps it: never sealed. */
  linked: Readonly<Record<string, string>>;
  /** Files copied from where the person keeps them (0600), discarded at the end. */
  copied: Readonly<Record<string, string>>;
}>;

export type ContextSealCode =
  | "layout-invalid"
  | "store-invalid"
  | "not-as-recorded"
  | "unrecorded"
  | "box-closed"
  | "does-not-open"
  | "record-invalid"
  | "dir-failed"
  | "locked";

export type ContextSealFailure = Readonly<{ ok: false; code: ContextSealCode; message: string }>;

const fail = (code: ContextSealCode, message: string): ContextSealFailure => ({
  ok: false,
  code,
  message,
});

type ContextBlob = BoxRecord & { v: 1; kind: typeof KIND; label: string };

/** What the session's directory held at launch: each context file's digest and its record. */
export type ContextBaseline = Readonly<{
  files: Readonly<Record<string, Readonly<{ sha256: string; blob: string }>>>;
  /** Records of a path that a newer record of the same path replaces (two sessions sealed it). */
  superseded: readonly string[];
}>;

const sha256 = (b: Buffer | string) => createHash("sha256").update(b).digest("hex");
const aad = (label: string, key: string, blob: string) =>
  Buffer.from(`${KIND}\0${label}\0${key}\0${blob}`, "utf8");

function layoutProblem(layout: ContextLayout): string | null {
  const names = [...layout.context, ...Object.keys(layout.linked), ...Object.keys(layout.copied)];
  const ok = (n: string) =>
    n !== "" &&
    n !== "." &&
    n !== ".." &&
    !n.includes("/") &&
    !n.includes("\\") &&
    !n.includes("\0");
  if (!names.every(ok) || names.includes(MANIFEST) || names.includes(LOCK)) {
    return "a layout name is not a plain name";
  }
  if (new Set(names).size !== names.length) {
    return "a name is in two parts of the layout";
  }
  for (const p of [...Object.values(layout.linked), ...Object.values(layout.copied)]) {
    if (!path.isAbsolute(p)) {
      return `${p} is not an absolute path`;
    }
  }
  return null;
}

/** A relative path of a context file: plain segments under one of the context's names. */
function validRel(rel: unknown, layout: ContextLayout): rel is string {
  if (typeof rel !== "string" || rel.length === 0 || rel.length > 4096 || rel.includes("\0")) {
    return false;
  }
  const segs = rel.split("/");
  return (
    segs.length <= CONTEXT_DEPTH_MAX + 1 &&
    segs.every((s) => s !== "" && s !== "." && s !== ".." && !s.includes("\\")) &&
    layout.context.includes(segs[0])
  );
}

/** Overwrite once, then remove; a link or anything else is unlinked, never followed. */
function eraseFile(file: string): boolean {
  let st: fs.Stats;
  try {
    st = fs.lstatSync(file);
  } catch {
    return true;
  }
  if (st.isFile()) {
    try {
      const fd = fs.openSync(file, fs.constants.O_WRONLY | fs.constants.O_NOFOLLOW);
      try {
        const n = Math.max(st.size, 1);
        // Large files are overwritten in chunks (never one buffer of the file's size).
        const chunk = randomBytes(Math.min(n, 1024 * 1024));
        for (let off = 0; off < n; off += chunk.length) {
          fs.writeSync(fd, chunk, 0, Math.min(chunk.length, n - off), off);
        }
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
    } catch {
      /* removal below still matters */
    }
  }
  try {
    if (st.isDirectory()) {
      fs.rmdirSync(file);
    } else {
      fs.unlinkSync(file);
    }
  } catch {
    /* reported below */
  }
  try {
    fs.lstatSync(file);
    return false;
  } catch {
    return true;
  }
}

/** Erase a directory tree: files overwritten, links unlinked (never followed), then the directories. */
export function eraseTree(dir: string): { erased: number; remaining: string[] } {
  let erased = 0;
  const remaining: string[] = [];
  const walk = (p: string, depth: number) => {
    let st: fs.Stats;
    try {
      st = fs.lstatSync(p);
    } catch {
      return;
    }
    if (st.isDirectory() && depth <= CONTEXT_DEPTH_MAX + 2) {
      let names: string[] = [];
      try {
        names = fs.readdirSync(p);
      } catch {
        names = [];
      }
      for (const n of names.toSorted()) {
        walk(path.join(p, n), depth + 1);
      }
    }
    if (eraseFile(p)) {
      erased++;
    } else {
      remaining.push(p);
    }
  };
  walk(dir, 0);
  return { erased, remaining };
}

/** The blobs of the store (regular files named as records) and anything else found there. */
function listStore(sealedDir: string): { blobs: string[]; foreign: string[] } | null {
  let entries: fs.Dirent[];
  try {
    const st = fs.lstatSync(sealedDir);
    if (!st.isDirectory()) {
      return null;
    }
    entries = fs.readdirSync(sealedDir, { withFileTypes: true });
  } catch (err) {
    return (err as NodeJS.ErrnoException)?.code === "ENOENT" ? { blobs: [], foreign: [] } : null;
  }
  const blobs: string[] = [];
  const foreign: string[] = [];
  for (const e of entries) {
    if (e.name === LOCK) {
      continue;
    }
    if (e.isFile() && BLOB.test(e.name)) {
      blobs.push(e.name);
    } else if (!e.name.endsWith(".tmp")) {
      foreign.push(e.name);
    }
  }
  return { blobs: blobs.toSorted(), foreign: foreign.toSorted() };
}

/**
 * The digest of the sealed set: SHA-256 over the tag and every record's name and the SHA-256 of
 * its bytes, in name order. An empty or absent store has the digest of the tag alone; a store
 * holding anything that is not a record has none (null).
 */
export function sealedContextDigest(sealedDir: string): string | null {
  const s = listStore(sealedDir);
  if (!s || s.foreign.length > 0) {
    return null;
  }
  const h = createHash("sha256").update(`${SET_TAG}\n`);
  for (const b of s.blobs) {
    let bytes: Buffer;
    try {
      bytes = fs.readFileSync(path.join(sealedDir, b));
    } catch {
      return null;
    }
    h.update(`${b} ${sha256(bytes)}\n`);
  }
  return h.digest("hex");
}

/** The digest of an empty store. */
export const EMPTY_CONTEXT_DIGEST = createHash("sha256").update(`${SET_TAG}\n`).digest("hex");

/**
 * The digest the audit log last recorded for `label` (records of CONTEXT_SEAL_RECORD's sealed,
 * adopted and discarded types, any adapter's prefix), or null when the log records none.
 */
export function lastRecordedContextDigest(
  records: Iterable<unknown>,
  label: string,
): string | null {
  let last: string | null = null;
  const types = new Set<string>([
    CONTEXT_SEAL_RECORD.sealed,
    CONTEXT_SEAL_RECORD.adopted,
    CONTEXT_SEAL_RECORD.discarded,
  ]);
  for (const r of records) {
    const rec = r as { type?: unknown; payload?: unknown } | null;
    if (!rec || typeof rec.type !== "string" || !rec.payload || typeof rec.payload !== "object") {
      continue;
    }
    const base = [...types].find((t) => rec.type === t || (rec.type as string).endsWith(`.${t}`));
    const p = rec.payload as Record<string, unknown>;
    if (
      base &&
      p.label === label &&
      typeof p.digest === "string" &&
      /^[0-9a-f]{64}$/.test(p.digest)
    ) {
      last = p.digest;
    }
  }
  return last;
}

export type ContextSealVerdict =
  | Readonly<{ ok: true; digest: string; empty: boolean }>
  | ContextSealFailure;

/**
 * Whether the sealed set may be opened: it must be exactly the set the log last recorded. No
 * record and an empty store is a first launch; no record and a non-empty store is refused (records
 * the log never saw sealed).
 */
export function contextSealVerdict(
  o: Readonly<{ sealedDir: string; recorded: string | null }>,
): ContextSealVerdict {
  const found = sealedContextDigest(o.sealedDir);
  if (found === null) {
    return fail(
      "store-invalid",
      `${o.sealedDir} holds something that is not a sealed context record; it is not opened`,
    );
  }
  if (o.recorded === null) {
    return found === EMPTY_CONTEXT_DIGEST
      ? { ok: true, digest: found, empty: true }
      : fail(
          "unrecorded",
          "sealed context records are present that the audit log never recorded; they are not opened",
        );
  }
  return found === o.recorded
    ? { ok: true, digest: found, empty: found === EMPTY_CONTEXT_DIGEST }
    : fail(
        "not-as-recorded",
        "the sealed context is not the one the audit log last recorded (a record was added, removed, replaced or rolled back outside Enclawed); it is not opened",
      );
}

/** Hold the store's lock (an exclusive lock file; one left by a process that is gone is taken over). */
export async function withContextLock<T>(sealedDir: string, fn: () => Promise<T> | T): Promise<T> {
  fs.mkdirSync(sealedDir, { recursive: true, mode: 0o700 });
  const lock = path.join(sealedDir, LOCK);
  const deadline = Date.now() + 30_000;
  for (;;) {
    try {
      fs.writeFileSync(lock, String(process.pid), { flag: "wx", mode: 0o600 });
      break;
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code !== "EEXIST") {
        throw err;
      }
      const holder = Number(fs.readFileSync(lock, "utf8").trim());
      let alive = false;
      try {
        process.kill(holder, 0);
        alive = Number.isInteger(holder) && holder > 0 && holder !== process.pid;
      } catch {
        alive = false;
      }
      if (!alive) {
        fs.rmSync(lock, { force: true });
        continue;
      }
      if (Date.now() > deadline) {
        throw new Error(`the sealed context store ${sealedDir} is locked by process ${holder}`, {
          cause: err,
        });
      }
      await new Promise((r) => setTimeout(r, 50));
    }
  }
  try {
    return await fn();
  } finally {
    fs.rmSync(lock, { force: true });
  }
}

function readBlob(file: string, label: string): ContextBlob | null {
  try {
    const st = fs.lstatSync(file);
    if (!st.isFile() || st.size > CONTEXT_FILE_MAX * 2) {
      return null;
    }
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<ContextBlob>;
    return raw?.v === 1 && raw.kind === KIND && raw.label === label && isBoxRecord(raw)
      ? (raw as ContextBlob)
      : null;
  } catch {
    return null;
  }
}

/** One context file as a record's plaintext: a header (path, time) and the file's bytes. */
function framePlain(rel: string, at: number, bytes: Buffer): Buffer {
  const head = Buffer.from(JSON.stringify({ path: rel, at }), "utf8");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(head.length);
  return Buffer.concat([len, head, bytes]);
}

function unframePlain(plain: Buffer): { rel: unknown; at: unknown; bytes: Buffer } | null {
  if (plain.length < 4) {
    return null;
  }
  const n = plain.readUInt32BE(0);
  if (n > 8192 || 4 + n > plain.length) {
    return null;
  }
  try {
    const h = JSON.parse(plain.subarray(4, 4 + n).toString("utf8")) as Record<string, unknown>;
    return { rel: h.path, at: h.at, bytes: plain.subarray(4 + n) };
  } catch {
    return null;
  }
}

function writeBlob(
  sealedDir: string,
  box: Pick<SealBox, "id" | "publicKey">,
  label: string,
  rel: string,
  bytes: Buffer,
): string {
  const name = `${randomBytes(16).toString("hex")}.ctx`;
  const plain = framePlain(rel, Date.now(), bytes);
  const rec: ContextBlob = {
    v: 1,
    kind: KIND,
    label,
    ...sealToBox(box, plain, aad(label, box.id, name)),
  };
  plain.fill(0);
  const file = path.join(sealedDir, name);
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(rec), { mode: 0o600, flag: "wx" });
  fs.renameSync(tmp, file);
  return name;
}

/**
 * Make the session's directory: fresh under `parent` (0700), with the layout's linked
 * configuration (a link to each path that exists) and copied files (regular files only, 0600).
 */
export function prepareContextDir(
  o: Readonly<{ parent: string; layout: ContextLayout }>,
): { ok: true; dir: string } | ContextSealFailure {
  const problem = layoutProblem(o.layout);
  if (problem) {
    return fail("layout-invalid", problem);
  }
  let dir: string;
  try {
    dir = fs.mkdtempSync(path.join(o.parent, "c-"));
    fs.chmodSync(dir, 0o700);
  } catch (err) {
    return fail(
      "dir-failed",
      `the session's context directory could not be made (${(err as Error).message})`,
    );
  }
  for (const [name, from] of Object.entries(o.layout.linked)) {
    try {
      fs.lstatSync(from);
    } catch {
      continue;
    }
    fs.symlinkSync(from, path.join(dir, name));
  }
  for (const [name, from] of Object.entries(o.layout.copied)) {
    let bytes: Buffer;
    try {
      const st = fs.lstatSync(from);
      if (!st.isFile() || st.size > CONTEXT_FILE_MAX) {
        continue;
      }
      bytes = fs.readFileSync(from);
    } catch {
      continue;
    }
    fs.writeFileSync(path.join(dir, name), bytes, { mode: 0o600, flag: "wx" });
    bytes.fill(0);
  }
  return { ok: true, dir };
}

/**
 * Open the sealed context into the session's directory (prepareContextDir's): the verdict first
 * (contextSealVerdict against the digest the log last recorded), then every record with the open
 * context box. Returns what was opened (the baseline the end of the session seals against), also
 * written to the directory's manifest so a session that ended without sealing can be sealed later
 * (recoverContextDirs). Call it under withContextLock.
 */
export function openContextInto(
  o: Readonly<{
    sealedDir: string;
    dir: string;
    box: SealBox;
    label: string;
    layout: ContextLayout;
    recorded: string | null;
  }>,
): { ok: true; baseline: ContextBaseline; files: number; digest: string } | ContextSealFailure {
  const problem = layoutProblem(o.layout);
  if (problem) {
    return fail("layout-invalid", problem);
  }
  const verdict = contextSealVerdict({ sealedDir: o.sealedDir, recorded: o.recorded });
  if (!verdict.ok) {
    return verdict;
  }
  const store = listStore(o.sealedDir);
  if (!store) {
    return fail("store-invalid", `${o.sealedDir} is not a sealed context store`);
  }
  if (store.blobs.length > 0 && !o.box.canOpen()) {
    return fail("box-closed", "the context box no longer opens (the launch closed it)");
  }
  // Every record is opened before anything is written: one that does not open refuses them all.
  const best = new Map<string, { blob: string; at: number; bytes: Buffer }>();
  const superseded: string[] = [];
  for (const b of store.blobs) {
    const rec = readBlob(path.join(o.sealedDir, b), o.label);
    if (!rec || rec.key !== o.box.id) {
      return fail("record-invalid", `the sealed context record ${b} is not one of this box's`);
    }
    const plain = o.box.open(rec, aad(o.label, rec.key, b));
    const f = plain ? unframePlain(plain) : null;
    if (!plain || !f || !validRel(f.rel, o.layout) || typeof f.at !== "number") {
      plain?.fill(0);
      return fail(
        "does-not-open",
        `the sealed context record ${b} does not open (changed after it was sealed)`,
      );
    }
    const prev = best.get(f.rel);
    const cur = { blob: b, at: f.at, bytes: Buffer.from(f.bytes) };
    plain.fill(0);
    if (!prev || prev.at < cur.at || (prev.at === cur.at && prev.blob < cur.blob)) {
      if (prev) {
        superseded.push(prev.blob);
        prev.bytes.fill(0);
      }
      best.set(f.rel, cur);
    } else {
      superseded.push(b);
      cur.bytes.fill(0);
    }
  }
  const files: Record<string, { sha256: string; blob: string }> = {};
  try {
    for (const [rel, v] of [...best.entries()].toSorted(([a], [b]) => (a < b ? -1 : 1))) {
      // A path whose parent is a file (or a link prepared from the layout) is not written.
      const target = path.join(o.dir, ...rel.split("/"));
      let parent = o.dir;
      for (const seg of rel.split("/").slice(0, -1)) {
        parent = path.join(parent, seg);
        try {
          fs.mkdirSync(parent, { mode: 0o700 });
        } catch (err) {
          if (
            (err as NodeJS.ErrnoException)?.code !== "EEXIST" ||
            !fs.lstatSync(parent).isDirectory()
          ) {
            throw new Error(`${rel} has no directory to be opened into`, { cause: err });
          }
        }
      }
      const fd = fs.openSync(
        target,
        fs.constants.O_WRONLY |
          fs.constants.O_CREAT |
          fs.constants.O_EXCL |
          fs.constants.O_NOFOLLOW,
        0o600,
      );
      try {
        fs.writeSync(fd, v.bytes);
      } finally {
        fs.closeSync(fd);
      }
      files[rel] = { sha256: sha256(v.bytes), blob: v.blob };
      v.bytes.fill(0);
    }
  } catch (err) {
    eraseTree(o.dir);
    return fail(
      "dir-failed",
      `the context could not be opened into ${o.dir} (${(err as Error).message})`,
    );
  }
  const baseline: ContextBaseline = { files, superseded };
  fs.writeFileSync(
    path.join(o.dir, MANIFEST),
    JSON.stringify({ v: 1, pid: process.pid, label: o.label, sealedDir: o.sealedDir, baseline }),
    { mode: 0o600, flag: "wx" },
  );
  return { ok: true, baseline, files: Object.keys(files).length, digest: verdict.digest };
}

/** The regular files under the context's names in `dir`, and what was not sealed (links, devices, too large). */
function contextFiles(dir: string, layout: ContextLayout): { files: string[]; skipped: string[] } {
  const files: string[] = [];
  const skipped: string[] = [];
  const walk = (rel: string, depth: number) => {
    const p = path.join(dir, ...rel.split("/"));
    let st: fs.Stats;
    try {
      st = fs.lstatSync(p);
    } catch {
      return;
    }
    if (st.isDirectory() && depth < CONTEXT_DEPTH_MAX) {
      for (const n of fs.readdirSync(p).toSorted()) {
        walk(`${rel}/${n}`, depth + 1);
      }
    } else if (st.isFile() && st.size <= CONTEXT_FILE_MAX && validRel(rel, layout)) {
      files.push(rel);
    } else {
      skipped.push(rel);
    }
  };
  for (const name of layout.context) {
    walk(name, 0);
  }
  return { files, skipped };
}

export type ContextSealResult = Readonly<{
  ok: true;
  sealed: number;
  kept: number;
  removed: number;
  skipped: readonly string[];
  digest: string;
  erased: number;
  remaining: readonly string[];
}>;

/**
 * The end of a session: seal what the host left under the context's names in `dir` to the box's
 * public key (no private key, and no device, is needed), against the launch's baseline, then erase
 * `dir` entirely. Returns the store's new digest, for the adapter to record in its audit log.
 * Call it under withContextLock (the digest is the store as this call left it).
 */
export function sealContextFrom(
  o: Readonly<{
    dir: string;
    sealedDir: string;
    box: Pick<SealBox, "id" | "publicKey">;
    label: string;
    layout: ContextLayout;
    baseline: ContextBaseline;
  }>,
): ContextSealResult | (ContextSealFailure & { erased: number; remaining: readonly string[] }) {
  const problem = layoutProblem(o.layout);
  if (problem) {
    const e = eraseTree(o.dir);
    return { ...fail("layout-invalid", problem), erased: e.erased, remaining: e.remaining };
  }
  fs.mkdirSync(o.sealedDir, { recursive: true, mode: 0o700 });
  const { files, skipped } = contextFiles(o.dir, o.layout);
  let sealed = 0;
  let kept = 0;
  let removed = 0;
  const stale = new Set<string>(o.baseline.superseded);
  const seen = new Set<string>();
  for (const rel of files) {
    seen.add(rel);
    const p = path.join(o.dir, ...rel.split("/"));
    let bytes: Buffer;
    try {
      const fd = fs.openSync(p, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
      try {
        bytes = fs.readFileSync(fd);
      } finally {
        fs.closeSync(fd);
      }
    } catch {
      skipped.push(rel);
      continue;
    }
    const base = o.baseline.files[rel];
    if (base && base.sha256 === sha256(bytes)) {
      // Unchanged here. Its record is kept; when another session has since replaced that record
      // (it is gone), the other session's newer file stands and this copy is not sealed again.
      kept++;
    } else {
      writeBlob(o.sealedDir, o.box, o.label, rel, bytes);
      sealed++;
      if (base) {
        stale.add(base.blob);
      }
    }
    bytes.fill(0);
  }
  for (const [rel, base] of Object.entries(o.baseline.files)) {
    if (!seen.has(rel)) {
      stale.add(base.blob);
    }
  }
  for (const b of stale) {
    if (BLOB.test(b) && fs.existsSync(path.join(o.sealedDir, b))) {
      eraseFile(path.join(o.sealedDir, b));
      removed++;
    }
  }
  const e = eraseTree(o.dir);
  return {
    ok: true,
    sealed,
    kept,
    removed,
    skipped: skipped.toSorted(),
    digest: sealedContextDigest(o.sealedDir) ?? "",
    erased: e.erased,
    remaining: e.remaining,
  };
}

/** The context's names that hold plaintext in the person's own directory `sourceDir`. */
export function plaintextContextAt(
  o: Readonly<{ sourceDir: string; layout: ContextLayout }>,
): string[] {
  return o.layout.context
    .filter((n) => {
      try {
        fs.lstatSync(path.join(o.sourceDir, n));
        return true;
      } catch {
        return false;
      }
    })
    .toSorted();
}

/**
 * Adopt the context the person's own directory holds in plaintext (a person's step, with the
 * launch's box): each file is sealed into the store, then the plaintext erased. Call it under
 * withContextLock, with the store's verdict checked first; record the returned digest.
 */
export function adoptPlaintextContext(
  o: Readonly<{
    sourceDir: string;
    sealedDir: string;
    box: Pick<SealBox, "id" | "publicKey">;
    label: string;
    layout: ContextLayout;
  }>,
): ContextSealResult | ContextSealFailure {
  const problem = layoutProblem(o.layout);
  if (problem) {
    return fail("layout-invalid", problem);
  }
  fs.mkdirSync(o.sealedDir, { recursive: true, mode: 0o700 });
  const { files, skipped } = contextFiles(o.sourceDir, o.layout);
  let sealed = 0;
  for (const rel of files) {
    const p = path.join(o.sourceDir, ...rel.split("/"));
    const fd = fs.openSync(p, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    let bytes: Buffer;
    try {
      bytes = fs.readFileSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    writeBlob(o.sealedDir, o.box, o.label, rel, bytes);
    bytes.fill(0);
    sealed++;
  }
  let erased = 0;
  const remaining: string[] = [];
  for (const n of plaintextContextAt({ sourceDir: o.sourceDir, layout: o.layout })) {
    const e = eraseTree(path.join(o.sourceDir, n));
    erased += e.erased;
    remaining.push(...e.remaining);
  }
  return {
    ok: true,
    sealed,
    kept: 0,
    removed: 0,
    skipped: skipped.toSorted(),
    digest: sealedContextDigest(o.sealedDir) ?? "",
    erased,
    remaining,
  };
}

/** Erase every sealed record (a person's discard of a context the log does not vouch for). Record the empty digest. */
export function discardSealedContext(sealedDir: string): { erased: number; remaining: string[] } {
  const s = listStore(sealedDir);
  let erased = 0;
  const remaining: string[] = [];
  for (const n of [...(s?.blobs ?? []), ...(s?.foreign ?? [])]) {
    const e = eraseTree(path.join(sealedDir, n));
    erased += e.erased;
    remaining.push(...e.remaining);
  }
  return { erased, remaining };
}

/**
 * Session directories under `parent` whose launcher is gone (it ended without sealing: killed, or
 * the computer stopped): each is sealed with its manifest's baseline and erased. `onSealed` (under
 * the store's lock) records each new digest. A directory without a readable manifest is erased.
 */
export async function recoverContextDirs(
  o: Readonly<{
    parent: string;
    sealedDir: string;
    box: Pick<SealBox, "id" | "publicKey">;
    label: string;
    layout: ContextLayout;
    onSealed: (r: ContextSealResult, dir: string) => Promise<void>;
  }>,
): Promise<number> {
  let names: string[] = [];
  try {
    names = fs.readdirSync(o.parent).filter((n) => n.startsWith("c-"));
  } catch {
    return 0;
  }
  let n = 0;
  for (const name of names.toSorted()) {
    const dir = path.join(o.parent, name);
    let m: {
      pid?: unknown;
      label?: unknown;
      sealedDir?: unknown;
      baseline?: ContextBaseline;
    } | null = null;
    try {
      if (!fs.lstatSync(dir).isDirectory()) {
        continue;
      }
      m = JSON.parse(fs.readFileSync(path.join(dir, MANIFEST), "utf8"));
    } catch {
      m = null;
    }
    const pid = typeof m?.pid === "number" ? m.pid : null;
    let alive = false;
    if (pid !== null) {
      try {
        process.kill(pid, 0);
        alive = pid !== process.pid;
      } catch {
        alive = false;
      }
    }
    if (alive) {
      continue;
    }
    if (m?.label !== o.label || m?.sealedDir !== o.sealedDir || !m?.baseline?.files) {
      // Not this store's, or no manifest yet (a launch that stopped before opening): only a
      // directory that holds no context is erased; another's is left for its own store.
      if (m === null && plaintextContextAt({ sourceDir: dir, layout: o.layout }).length === 0) {
        eraseTree(dir);
      }
      continue;
    }
    const baseline = m.baseline;
    await withContextLock(o.sealedDir, async () => {
      const r = sealContextFrom({
        dir,
        sealedDir: o.sealedDir,
        box: o.box,
        label: o.label,
        layout: o.layout,
        baseline,
      });
      if (r.ok) {
        await o.onSealed(r, dir);
        n++;
      }
    });
  }
  return n;
}
