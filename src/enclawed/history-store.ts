// Customer-local, content-addressed history of file content that agent
// writes replaced or deleted. It is what makes those writes reversible: the
// prior content of a target is stored here BEFORE the write runs, under the
// SHA-256 of its bytes, and `enclawed history restore <hash>` puts it back
// after verifying the bytes still hash to their name.
//
// Layout under the enclawed state dir (default ~/.enclawed/history, or
// ENCLAWED_HISTORY_DIR):
//   objects/<sha256>   prior content, mode 0600, written via rename
//   index.jsonl        one line per snapshot (what was written, when, by whom)
//
// Nothing here leaves the host. Retention: snapshots older than
// history.maxAgeDays are pruned; the store never evicts by size. A snapshot
// that would push the store past history.maxTotalBytes is refused instead,
// so the write that needed it becomes irreversible and waits for a person.

import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveStateDir } from "../config/paths.js";
import { HISTORY_MIN_AGE_DAYS, type HistoryPolicy } from "./policy.js";

export const SNAPSHOT_HASH_RE = /^[0-9a-f]{64}$/;

export type HistoryOp = "write" | "edit" | "delete" | "restore";

export type HistoryEntry = Readonly<{
  v: 1;
  ts: number;
  /** The path the tool was asked to write. */
  path: string;
  /** Its resolved location on disk (symlinks followed). */
  realPath: string;
  op: HistoryOp;
  /** Content hash of the prior content; null when the file did not exist. */
  hash: string | null;
  size: number;
  tool: string;
  toolCallId: string | null;
  agentId: string | null;
  /**
   * Not a file's history: this session copied `source` (content hash
   * `contentHash`, sha256) to a path whose name has a part unknown when it was
   * decided (`pattern`, a regular expression over real paths; nothing matched
   * it then). hash stays null and path names no file, so restore ignores it.
   */
  copyPattern?: Readonly<{ pattern: string; source: string; contentHash: string }>;
  /**
   * The prior state was a symbolic link, not a file: the snapshot (hash) holds
   * the link's own target text, and restore makes the link again (it never
   * follows it).
   */
  kind?: "symlink";
  /** Set when the file lives in a sandbox: restore writes back through it. */
  sandbox?: Readonly<{
    backendId: string;
    runtimeId: string;
    sessionKey: string;
    containerPath: string;
    /** The path and cwd the file tool handed the bridge, replayed on restore. */
    bridgePath: string;
    bridgeCwd: string;
  }>;
}>;

export type PutResult =
  | { ok: true; hash: string; stored: boolean }
  | { ok: false; code: "over-retention-budget" | "store-failed"; detail?: string };

export class HistoryTamperedError extends Error {
  readonly code = "tampered" as const;
  constructor(hash: string) {
    super(`snapshot ${hash} does not match its content hash; refusing to use it`);
    this.name = "HistoryTamperedError";
  }
}

export function resolveHistoryDir(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.ENCLAWED_HISTORY_DIR?.trim();
  return explicit ? path.resolve(explicit) : path.join(resolveStateDir(env), "history");
}

export function sha256Hex(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

const PRUNE_INTERVAL_MS = 10 * 60 * 1000;
// Objects younger than this are never deleted as unreferenced: another
// process may have stored one and not yet indexed it.
const UNREFERENCED_GRACE_MS = 60 * 1000;

// Snapshots this process stored and has not indexed yet. A prune (from any
// store instance in this process) never deletes one, however long the write
// that depends on it takes; other processes are covered by the grace period.
const pinnedSnapshots = new Map<string, number>();

function pinSnapshot(hash: string): void {
  pinnedSnapshots.set(hash, (pinnedSnapshots.get(hash) ?? 0) + 1);
}

function unpinSnapshot(hash: string): void {
  const n = pinnedSnapshots.get(hash) ?? 0;
  if (n <= 1) {
    pinnedSnapshots.delete(hash);
  } else {
    pinnedSnapshots.set(hash, n - 1);
  }
}

export class HistoryStore {
  readonly dir: string;
  private readonly limits: HistoryPolicy;
  private readonly now: () => number;
  private totalBytes: number | null = null;
  private lastPrune = 0;

  constructor(opts: { dir?: string; limits: HistoryPolicy; now?: () => number }) {
    this.dir = opts.dir ?? resolveHistoryDir();
    this.limits = opts.limits;
    this.now = opts.now ?? Date.now;
  }

  private get objectsDir(): string {
    return path.join(this.dir, "objects");
  }

  private get indexPath(): string {
    return path.join(this.dir, "index.jsonl");
  }

  objectPath(hash: string): string {
    return path.join(this.objectsDir, hash);
  }

  private async ensureDirs(): Promise<void> {
    await fs.mkdir(this.objectsDir, { recursive: true, mode: 0o700 });
  }

  private async scanTotal(): Promise<number> {
    let total = 0;
    let names: string[] = [];
    try {
      names = await fs.readdir(this.objectsDir);
    } catch {
      return 0;
    }
    for (const name of names) {
      if (!SNAPSHOT_HASH_RE.test(name)) {
        continue;
      }
      try {
        total += (await fs.stat(this.objectPath(name))).size;
      } catch {
        /* removed concurrently */
      }
    }
    return total;
  }

  /** Bytes the store holds now. */
  async usedBytes(): Promise<number> {
    if (this.totalBytes === null) {
      this.totalBytes = await this.scanTotal();
    }
    return this.totalBytes;
  }

  /** Store content under its hash, unless that would exceed the budget. */
  async put(content: Buffer): Promise<PutResult> {
    const hash = sha256Hex(content);
    try {
      await this.maybePrune();
      await this.ensureDirs();
      const target = this.objectPath(hash);
      try {
        await fs.access(target);
        pinSnapshot(hash);
        return { ok: true, hash, stored: false };
      } catch {
        /* not stored yet */
      }
      const used = await this.usedBytes();
      if (used + content.length > this.limits.maxTotalBytes) {
        return { ok: false, code: "over-retention-budget" };
      }
      const tmp = `${target}.${randomBytes(6).toString("hex")}.tmp`;
      await fs.writeFile(tmp, content, { mode: 0o600, flag: "wx" });
      await fs.rename(tmp, target);
      pinSnapshot(hash);
      this.totalBytes = used + content.length;
      return { ok: true, hash, stored: true };
    } catch (err) {
      return { ok: false, code: "store-failed", detail: String(err) };
    }
  }

  async record(entry: Omit<HistoryEntry, "v" | "ts">): Promise<HistoryEntry> {
    const full: HistoryEntry = { v: 1, ts: this.now(), ...entry };
    await this.ensureDirs();
    await fs.appendFile(this.indexPath, `${JSON.stringify(full)}\n`, { mode: 0o600 });
    // Indexed now: the entry itself keeps the snapshot from being pruned.
    if (full.hash !== null) {
      unpinSnapshot(full.hash);
    }
    return full;
  }

  async list(filterPath?: string): Promise<HistoryEntry[]> {
    let raw = "";
    try {
      raw = await fs.readFile(this.indexPath, "utf8");
    } catch {
      return [];
    }
    const out: HistoryEntry[] = [];
    const wanted = filterPath ? path.resolve(filterPath) : null;
    for (const line of raw.split("\n")) {
      if (!line.trim()) {
        continue;
      }
      let entry: HistoryEntry;
      try {
        entry = JSON.parse(line) as HistoryEntry;
      } catch {
        continue;
      }
      if (
        wanted &&
        path.resolve(entry.path) !== wanted &&
        path.resolve(entry.realPath) !== wanted
      ) {
        continue;
      }
      out.push(entry);
    }
    return out;
  }

  /** The content of a snapshot, after checking it still hashes to its name. */
  async readVerified(hash: string): Promise<Buffer> {
    if (!SNAPSHOT_HASH_RE.test(hash)) {
      throw new TypeError(`not a snapshot hash: ${hash}`);
    }
    const content = await fs.readFile(this.objectPath(hash));
    if (sha256Hex(content) !== hash) {
      throw new HistoryTamperedError(hash);
    }
    return content;
  }

  private async maybePrune(): Promise<void> {
    if (this.now() - this.lastPrune < PRUNE_INTERVAL_MS) {
      return;
    }
    await this.prune();
  }

  /**
   * The person accepted these files as they are (a commit they approved, an
   * acceptance outside the agent): drop every entry of theirs recorded at or
   * before `upTo` (matched by path or real path, resolved), whatever its age,
   * and the objects no entry references any more. The retention floor does
   * not apply: the accepted content is held elsewhere (git, or the file
   * itself as accepted). Returns what it removed and the bytes freed.
   */
  async pruneFor(
    paths: readonly string[],
    upTo: number,
  ): Promise<{ removedEntries: number; removedObjects: number; freedBytes: number }> {
    const wanted = new Set(paths.map((p) => path.resolve(p)));
    if (!wanted.size) {
      return { removedEntries: 0, removedObjects: 0, freedBytes: 0 };
    }
    const entries = await this.list();
    const kept = entries.filter(
      (e) =>
        e.ts > upTo ||
        e.sandbox !== undefined ||
        !(wanted.has(path.resolve(e.path)) || wanted.has(path.resolve(e.realPath))),
    );
    if (kept.length !== entries.length) {
      await this.writeIndex(kept);
    }
    const r = await this.removeUnreferenced(kept);
    return { removedEntries: entries.length - kept.length, ...r };
  }

  private async writeIndex(entries: readonly HistoryEntry[]): Promise<void> {
    const tmp = `${this.indexPath}.${randomBytes(6).toString("hex")}.tmp`;
    await fs.writeFile(tmp, entries.map((e) => `${JSON.stringify(e)}\n`).join(""), {
      mode: 0o600,
    });
    await fs.rename(tmp, this.indexPath);
  }

  // Objects no kept entry references, pinned by no write of this process and
  // older than the grace period (another process may not have indexed one yet).
  private async removeUnreferenced(
    kept: readonly HistoryEntry[],
  ): Promise<{ removedObjects: number; freedBytes: number }> {
    const referenced = new Set(kept.map((e) => e.hash).filter((h): h is string => h !== null));
    let removedObjects = 0;
    let freedBytes = 0;
    let names: string[] = [];
    try {
      names = await fs.readdir(this.objectsDir);
    } catch {
      names = [];
    }
    for (const name of names) {
      if (!SNAPSHOT_HASH_RE.test(name) || referenced.has(name) || pinnedSnapshots.has(name)) {
        continue;
      }
      try {
        const st = await fs.stat(this.objectPath(name));
        if (this.now() - st.mtimeMs < UNREFERENCED_GRACE_MS) {
          continue;
        }
        await fs.rm(this.objectPath(name));
        removedObjects++;
        freedBytes += st.size;
      } catch {
        /* removed concurrently */
      }
    }
    this.totalBytes = null;
    return { removedObjects, freedBytes };
  }

  /** Drop entries older than maxAgeDays and the objects nothing references. */
  async prune(): Promise<{ removedEntries: number; removedObjects: number }> {
    this.lastPrune = this.now();
    // The floor applies even when a caller passes its own limits: a restore
    // point is kept at least HISTORY_MIN_AGE_DAYS.
    const ageDays = Math.max(this.limits.maxAgeDays, HISTORY_MIN_AGE_DAYS);
    const cutoff = this.now() - ageDays * 24 * 60 * 60 * 1000;
    const entries = await this.list();
    const kept = entries.filter((e) => e.ts >= cutoff);
    if (kept.length !== entries.length) {
      await this.writeIndex(kept);
    }
    const { removedObjects } = await this.removeUnreferenced(kept);
    return { removedEntries: entries.length - kept.length, removedObjects };
  }
}
