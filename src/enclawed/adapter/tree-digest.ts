// enclawed adapter kit: content digests of directory trees and file lists
// (the pins of local code, package-runner trees and Python environments).
//
// Large trees (a uv project's environment, a data-science stack) are measured
// with an incremental cache: a file's SHA-256 is reused only while its stat
// identity is unchanged (device, inode, size, modification AND change time in
// nanoseconds; the change time cannot be set back by a user, so a file
// rewritten and re-dated is hashed again). At pin time the cache is not read
// (every file is hashed again, once, and the cache refilled), so a pin never
// rests on a cached hash it did not make. Files are hashed by streaming, so
// size is bounded by time, not memory.

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

// The bounds are internal constants (not settings): a tree larger than this
// cannot be pinned, and the server does not start.
const MAX_TREE_FILES = 1_000_000;
const MAX_TREE_BYTES = 64 * 1024 * 1024 * 1024;
const CHUNK = 1024 * 1024;
export const SKIP_DIRS: ReadonlySet<string> = new Set([".git", ".hg", ".svn", "__pycache__"]);

export type TreeDigest = Readonly<{ digest: string; files: number; bytes: number }>;

/** A cache of file hashes keyed by stat identity. */
export interface TreeHashCache {
  get(file: string, identity: string): string | undefined;
  set(file: string, identity: string, sha256: string): void;
}

/** A file's stat identity: any write, rename over it or re-dating changes it. */
function identityOf(st: fs.BigIntStats): string {
  return `${st.dev}:${st.ino}:${st.size}:${st.mtimeNs}:${st.ctimeNs}`;
}

/** The SHA-256 of a file, read in chunks (no whole-file buffer). */
export function sha256File(p: string): string {
  const h = createHash("sha256");
  const fd = fs.openSync(p, "r");
  try {
    const buf = Buffer.allocUnsafe(CHUNK);
    for (;;) {
      const n = fs.readSync(fd, buf, 0, CHUNK, null);
      if (n === 0) {
        break;
      }
      h.update(n === CHUNK ? buf : buf.subarray(0, n));
    }
  } finally {
    fs.closeSync(fd);
  }
  return h.digest("hex");
}

/**
 * A file's SHA-256 through the cache: a hit only for the same stat identity;
 * a fresh hash is recorded only when the file did not change while it was read.
 */
export function cachedSha256(p: string, cache: TreeHashCache | undefined): string {
  if (!cache) {
    return sha256File(p);
  }
  const before = identityOf(fs.lstatSync(p, { bigint: true }));
  const hit = cache.get(p, before);
  if (hit) {
    return hit;
  }
  const sha = sha256File(p);
  if (identityOf(fs.lstatSync(p, { bigint: true })) === before) {
    cache.set(p, before, sha);
  }
  return sha;
}

/**
 * A hash cache, optionally loaded from and saved to `file` (in the adapter's
 * protected state). `refresh` (pin time): nothing is loaded, so every file is
 * hashed again, once, and the cache refilled.
 */
export function treeHashCache(
  file: string | null,
  o: Readonly<{ refresh?: boolean }> = {},
): TreeHashCache & { save(): void } {
  const entries = new Map<string, { id: string; sha: string }>();
  if (file && o.refresh !== true) {
    try {
      const raw = JSON.parse(fs.readFileSync(file, "utf8")) as {
        v?: unknown;
        files?: Record<string, unknown>;
      };
      if (raw?.v === 1 && raw.files && typeof raw.files === "object") {
        for (const [f, e] of Object.entries(raw.files)) {
          if (
            Array.isArray(e) &&
            typeof e[0] === "string" &&
            typeof e[1] === "string" &&
            /^[0-9a-f]{64}$/.test(e[1])
          ) {
            entries.set(f, { id: e[0], sha: e[1] });
          }
        }
      }
    } catch {
      // No cache (or an unreadable one): every file is hashed.
    }
  }
  let dirty = false;
  return {
    get: (f, id) => {
      const e = entries.get(f);
      return e && e.id === id ? e.sha : undefined;
    },
    set: (f, id, sha) => {
      const e = entries.get(f);
      if (!e || e.id !== id || e.sha !== sha) {
        entries.set(f, { id, sha });
        dirty = true;
      }
    },
    save: () => {
      if (!file || !dirty) {
        return;
      }
      fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
      const tmp = `${file}.${process.pid}.tmp`;
      const files: Record<string, [string, string]> = {};
      for (const [f, e] of entries) {
        files[f] = [e.id, e.sha];
      }
      fs.writeFileSync(tmp, JSON.stringify({ v: 1, files }), { mode: 0o600 });
      fs.renameSync(tmp, file);
      dirty = false;
    },
  };
}

function tooLarge(what: string): Error {
  return new Error(
    `${what} holds more than ${MAX_TREE_FILES} files or ${MAX_TREE_BYTES} bytes; its code cannot be pinned`,
  );
}

/** The digest of every file below `root` (or of `root` itself when it is a file). Throws over the bounds. */
export function treeDigest(
  root: string,
  o: Readonly<{ skip?: (rel: string) => boolean; cache?: TreeHashCache }> = {},
): TreeDigest {
  const entries: string[] = [];
  let files = 0;
  let bytes = 0;
  const base = fs.statSync(root).isDirectory() ? root : path.dirname(root);
  const visit = (p: string) => {
    const st = fs.lstatSync(p);
    const rel = path.relative(base, p) || path.basename(p);
    if (o.skip && p !== root && o.skip(path.relative(root, p))) {
      return;
    }
    if (st.isSymbolicLink()) {
      entries.push(`l\0${rel}\0${fs.readlinkSync(p)}`);
      return;
    }
    if (st.isDirectory()) {
      for (const n of fs.readdirSync(p).toSorted()) {
        if (!SKIP_DIRS.has(n)) {
          visit(path.join(p, n));
        }
      }
      return;
    }
    if (!st.isFile() || p.endsWith(".pyc")) {
      return;
    }
    files++;
    bytes += st.size;
    if (files > MAX_TREE_FILES || bytes > MAX_TREE_BYTES) {
      throw tooLarge(root);
    }
    entries.push(`f\0${rel}\0${st.size}\0${cachedSha256(p, o.cache)}`);
  };
  visit(root);
  return {
    digest: createHash("sha256").update(entries.toSorted().join("\n")).digest("hex"),
    files,
    bytes,
  };
}

/** The digest of an explicit file list (a distribution's files), by absolute path. */
export function filesDigest(
  paths: readonly string[],
  o: Readonly<{ cache?: TreeHashCache }> = {},
): TreeDigest {
  const entries: string[] = [];
  let bytes = 0;
  let files = 0;
  for (const p of [...new Set(paths)].toSorted()) {
    let st: fs.Stats;
    try {
      st = fs.lstatSync(p);
    } catch {
      entries.push(`m\0${p}`);
      continue;
    }
    if (!st.isFile() || p.endsWith(".pyc")) {
      continue;
    }
    files++;
    bytes += st.size;
    if (files > MAX_TREE_FILES || bytes > MAX_TREE_BYTES) {
      throw tooLarge("the distribution");
    }
    entries.push(`f\0${p}\0${st.size}\0${cachedSha256(p, o.cache)}`);
  }
  return {
    digest: createHash("sha256").update(entries.join("\n")).digest("hex"),
    files,
    bytes,
  };
}
