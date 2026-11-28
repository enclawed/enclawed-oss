// enclawed adapter kit: the file-integrity record on disk, sharded so a call
// reads and writes only what it touches (./file-integrity.ts).
//
// A record holds one entry per project file (its digest and stat identity)
// and where its recorded content is kept: at 50,000 files that is about
// 17 MB of JSON, and reading and writing it whole cost every tool call
// 0.1-0.3 s. Here the record is split:
//
//   <file>                     everything but the two large maps (changes,
//                              approvals, running actions, events, counters),
//                              plus the directory prefixes present;
//   <file>.shards/f<NN>.json   the `files` entries of the paths whose
//   <file>.shards/k<NN>.json   directory prefix (first two segments of the
//                              directory) hashes to NN (of 64), and their
//                              `kept` references.
//
// The maps are loaded shard by shard on first access, and a save writes the
// main file and only the shards that changed. The main file is written
// first: a write cut short leaves shards older than the main file, so a path
// can only look changed when it was not (never the reverse). Every write
// happens under the record's lock; each file is written to a temporary name,
// synced and renamed. A record in the earlier single-file form is read as it
// is and written sharded at its next save.

import fs from "node:fs";
import path from "node:path";
import type { KeptRef } from "./file-baseline.js";
import type { FileEntry, LedgerState } from "./file-integrity.js";

const SHARDS = 64;
const LAYOUT = "sharded-1";

/** A lazily loaded map: the paths (relative) under these roots, without loading every shard. */
export const KEYS_UNDER: unique symbol = Symbol("enclawed.fileIntegrity.keysUnder");

type Kind = "f" | "k";
type Shard = { obj: Record<string, unknown>; dirty: boolean };

function fnv(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/** The directory prefix of a path: the first two segments of its directory ("" at the top). */
function prefixOf(rel: string): string {
  const parts = rel.split("/");
  parts.pop();
  return parts.slice(0, 2).join("/");
}

const bucketOf = (prefix: string) => fnv(prefix) % SHARDS;

type StatKey = string;
const keyOf = (st: fs.BigIntStats): StatKey =>
  `${st.dev}:${st.ino}:${st.size}:${st.mtimeNs}:${st.ctimeNs}`;

/** Reads a JSON file with its stat identity; null when absent. */
function readJson(file: string): { key: StatKey; value: unknown } | null {
  let fd: number;
  try {
    fd = fs.openSync(file, "r");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw err;
  }
  try {
    const key = keyOf(fs.fstatSync(fd, { bigint: true }));
    return { key, value: JSON.parse(fs.readFileSync(fd, "utf8")) as unknown };
  } finally {
    fs.closeSync(fd);
  }
}

/** Writes a JSON file through a temporary file, synced, renamed; returns its stat identity. */
function writeJson(file: string, value: unknown): StatKey {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
  const fd = fs.openSync(tmp, "wx", 0o600);
  let key: StatKey;
  try {
    fs.writeSync(fd, JSON.stringify(value));
    fs.fsyncSync(fd);
    key = keyOf(fs.fstatSync(fd, { bigint: true }));
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, file);
  return key;
}

/** The map of one kind, loaded shard by shard; `prefixes` grows as paths are added. */
class LazyMap {
  readonly shards: (Shard | null)[] = Array.from({ length: SHARDS }, () => null);
  constructor(
    private readonly dir: string,
    private readonly kind: Kind,
    readonly prefixes: Set<string>,
    private readonly shardCache: Map<string, { key: StatKey; obj: Record<string, unknown> }>,
  ) {}

  shard(i: number): Shard {
    let s = this.shards[i];
    if (!s) {
      const file = path.join(this.dir, `${this.kind}${String(i).padStart(2, "0")}.json`);
      const cached = this.shardCache.get(file);
      let obj: Record<string, unknown>;
      let st: fs.BigIntStats | null = null;
      try {
        st = fs.statSync(file, { bigint: true });
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
          throw err;
        }
      }
      if (!st) {
        obj = {};
      } else if (cached && cached.key === keyOf(st)) {
        // A shard object is changed in place only under the lock, and written at once.
        obj = cached.obj;
      } else {
        const r = readJson(file);
        const v = r?.value;
        if (!v || typeof v !== "object" || Array.isArray(v)) {
          throw new Error(`the file-integrity record shard ${file} is not an object`);
        }
        obj = v as Record<string, unknown>;
        if (r) {
          this.shardCache.set(file, { key: r.key, obj });
        }
      }
      s = { obj, dirty: false };
      this.shards[i] = s;
    }
    return s;
  }

  of(rel: string): Shard {
    return this.shard(bucketOf(prefixOf(rel)));
  }

  allKeys(): string[] {
    const out: string[] = [];
    for (let i = 0; i < SHARDS; i++) {
      out.push(...Object.keys(this.shard(i).obj));
    }
    return out;
  }

  keysUnder(roots: readonly string[]): string[] {
    const buckets = new Set<number>();
    for (const r of roots) {
      const segs = r.split("/");
      // The root itself (as a file), and every path below it.
      buckets.add(bucketOf(prefixOf(r)));
      if (segs.length >= 2) {
        buckets.add(bucketOf(segs.slice(0, 2).join("/")));
      } else {
        buckets.add(bucketOf(r));
        for (const p of this.prefixes) {
          if (p.startsWith(`${r}/`)) {
            buckets.add(bucketOf(p));
          }
        }
      }
    }
    const within = (k: string) => roots.some((r) => k === r || k.startsWith(`${r}/`));
    const out: string[] = [];
    for (const b of buckets) {
      out.push(...Object.keys(this.shard(b).obj).filter(within));
    }
    return out;
  }

  proxy(): Record<string, unknown> {
    return proxyOf(this);
  }
}

function proxyOf(map: LazyMap): Record<string, unknown> {
  return new Proxy({} as Record<string, unknown>, {
    get(_t, k) {
      if (k === KEYS_UNDER) {
        return (roots: readonly string[]) => map.keysUnder(roots);
      }
      if (k === LAZY) {
        return map;
      }
      if (typeof k !== "string") {
        return undefined;
      }
      const o = map.of(k).obj;
      return Object.hasOwn(o, k) ? o[k] : undefined;
    },
    set(_t, k, v) {
      if (typeof k !== "string") {
        return false;
      }
      const s = map.of(k);
      s.obj[k] = v;
      s.dirty = true;
      map.prefixes.add(prefixOf(k));
      return true;
    },
    deleteProperty(_t, k) {
      if (typeof k !== "string") {
        return true;
      }
      const s = map.of(k);
      if (Object.hasOwn(s.obj, k)) {
        delete s.obj[k];
        s.dirty = true;
      }
      return true;
    },
    has(_t, k) {
      return typeof k === "string" && Object.hasOwn(map.of(k).obj, k);
    },
    getOwnPropertyDescriptor(_t, k) {
      if (typeof k !== "string") {
        return undefined;
      }
      const o = map.of(k).obj;
      return Object.hasOwn(o, k)
        ? { value: o[k], writable: true, enumerable: true, configurable: true }
        : undefined;
    },
    ownKeys() {
      return map.allKeys();
    },
  });
}

const LAZY: unique symbol = Symbol("enclawed.fileIntegrity.lazy");

/** The lazily loaded map behind a record map, or null for a plain object. */
function lazyOf(o: unknown): LazyMap | null {
  return o && typeof o === "object"
    ? (((o as Record<symbol, unknown>)[LAZY] as LazyMap) ?? null)
    : null;
}

/** The paths under these roots of a record map (all of them for null), loading only the shards needed. */
export function keysOf(map: Readonly<Record<string, unknown>>, roots: readonly string[] | null) {
  if (!roots) {
    return Object.keys(map);
  }
  const f = (map as Record<symbol, unknown>)[KEYS_UNDER];
  if (typeof f === "function") {
    return (f as (r: readonly string[]) => string[])(roots);
  }
  return Object.keys(map).filter((k) => roots.some((r) => k === r || k.startsWith(`${r}/`)));
}

type Main = Omit<LedgerState, "files" | "kept"> & {
  layout?: string;
  prefixes?: string[];
  files?: Record<string, FileEntry>;
  kept?: Record<string, KeptRef>;
};

/**
 * The record's storage (load, save, invalidate) for the ledger's file
 * backend; the lock is the caller's. `validate` checks and completes a main
 * record (version, required maps).
 */
export function shardedRecord(file: string, validate: (s: LedgerState) => LedgerState) {
  const dir = `${file}.shards`;
  const shardCache = new Map<string, { key: StatKey; obj: Record<string, unknown> }>();
  let cache: { key: StatKey; s: LedgerState } | null = null;

  const materialize = (s: LedgerState): LedgerState =>
    structuredClone({
      ...s,
      files: Object.fromEntries(Object.entries(s.files)),
      kept: Object.fromEntries(Object.entries(s.kept ?? {})),
    } as LedgerState);

  return {
    load(o?: { shared?: boolean }): LedgerState | null {
      let st: fs.BigIntStats;
      try {
        st = fs.statSync(file, { bigint: true });
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") {
          cache = null;
          return null;
        }
        throw err;
      }
      if (!cache || cache.key !== keyOf(st)) {
        cache = null;
        const r = readJson(file);
        if (!r) {
          return null;
        }
        const m = r.value as Main;
        let s: LedgerState;
        if (m && typeof m === "object" && m.layout === LAYOUT) {
          const prefixes = new Set(Array.isArray(m.prefixes) ? m.prefixes : []);
          const { layout: _l, prefixes: _p, ...rest } = m;
          s = validate({
            ...rest,
            files: new LazyMap(dir, "f", prefixes, shardCache).proxy() as Record<string, FileEntry>,
            kept: new LazyMap(dir, "k", prefixes, shardCache).proxy() as Record<string, KeptRef>,
          } as LedgerState);
        } else {
          s = validate(m as LedgerState); // the earlier single-file form
        }
        cache = { key: r.key, s };
      }
      return o?.shared ? cache.s : materialize(cache.s);
    },

    save(s: LedgerState): void {
      const lf = lazyOf(s.files);
      const lk = lazyOf(s.kept);
      const prefixes = new Set<string>([...(lf?.prefixes ?? []), ...(lk?.prefixes ?? [])]);
      // Plain maps (a first record, a replaced map, the earlier form): every shard is written.
      const split = (m: Record<string, unknown> | undefined) => {
        const out: Record<string, unknown>[] = Array.from({ length: SHARDS }, () => ({}));
        for (const [k, v] of Object.entries(m ?? {})) {
          const p = prefixOf(k);
          prefixes.add(p);
          out[bucketOf(p)][k] = v;
        }
        return out;
      };
      const plainF = lf ? null : split(s.files as Record<string, unknown>);
      const plainK = lk ? null : split(s.kept as Record<string, unknown> | undefined);
      const { files: _f, kept: _k, ...rest } = s;
      const mainKey = writeJson(file, {
        ...rest,
        layout: LAYOUT,
        prefixes: [...prefixes].toSorted(),
      });
      const writeShards = (
        kind: Kind,
        lazy: LazyMap | null,
        plain: Record<string, unknown>[] | null,
      ) => {
        for (let i = 0; i < SHARDS; i++) {
          const f = path.join(dir, `${kind}${String(i).padStart(2, "0")}.json`);
          if (plain) {
            shardCache.set(f, { key: writeJson(f, plain[i]), obj: plain[i] });
            continue;
          }
          const sh = lazy?.shards[i];
          if (sh?.dirty) {
            shardCache.set(f, { key: writeJson(f, sh.obj), obj: sh.obj });
            sh.dirty = false;
          }
        }
      };
      writeShards("f", lf, plainF);
      writeShards("k", lk, plainK);
      // The saved record, held for the next load while the main file is this one.
      const files = lf
        ? s.files
        : (new LazyMap(dir, "f", prefixes, shardCache).proxy() as Record<string, FileEntry>);
      const kept = lk
        ? s.kept
        : (new LazyMap(dir, "k", prefixes, shardCache).proxy() as Record<string, KeptRef>);
      if (lf) {
        for (const p of prefixes) {
          lf.prefixes.add(p);
        }
      }
      s.files = files;
      s.kept = kept;
      cache = { key: mainKey, s };
    },

    invalidate(): void {
      cache = null;
      shardCache.clear();
    },
  };
}
