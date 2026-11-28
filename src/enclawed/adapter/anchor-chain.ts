// enclawed adapter kit: anchor only heads that extend the chain the launcher
// followed (audit-log tamper detection during a session).
//
// The attack: during a session a same-user process deletes the anchor file
// and the anchor history, replaces the audit log (and its .head) with a
// fabricated chain, and the launcher's authenticated anchor session anchors
// the forged head on its next tick; the device then vouches for the forgery.
// The device stops a foreign anchor session; it cannot tell a laundered head
// from a genuine one. The launcher can, because it saw the log before.
//
// So the launcher follows the log (followChain): it keeps, in memory only, the
// offset just past the last record it verified, that record's hash, the
// number of records, and a SHA-256 of every byte before that offset. Each
// advance()
//   - re-hashes the bytes up to that offset (the prefix must be unchanged; the
//     file must be the same inode, or a sealed rotation segment of it followed
//     by segments whose records link on from it),
//   - checks every record after it: it parses, its recordHash recomputes, its
//     prevHash is the previous record's hash,
// and anchorFilesGuard checks that the anchor file it wrote and the anchor
// history it appended to are still there, byte for byte. Any failure throws
// AnchorTamper: the adapter raises its alarm, stops the host and anchors
// nothing more.
//
// The history before the session is taken as found (the framework's verify
// judges it, gaps included); every record from the session's start on must
// chain. Rotation follows the framework's AuditLogger naming
// (`audit.jsonl` -> sealed `audit.<n>.jsonl`).
//
// Ported from codenclawed's anchor-chain.mjs (followChain, anchorFilesGuard).

import { createHash, type Hash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { buildRecord, type AuditRecord } from "../audit-log.js";

const CHUNK = 1 << 20;

export type AnchorTamperCode =
  | "log-deleted"
  | "log-replaced"
  | "sealed-segment-changed"
  | "log-shrank"
  | "log-rewritten"
  | "record-not-json"
  | "record-hash-mismatch"
  | "record-link-broken"
  | "anchor-file-deleted"
  | "anchor-file-rewritten"
  | "history-deleted"
  | "history-rewritten";

export class AnchorTamper extends Error {
  override name = "AnchorTamper";
  /** The adapter's alarm code (kept from codenclawed). */
  readonly code = "ANCHOR_TAMPER";
  constructor(
    readonly reason: AnchorTamperCode,
    message: string,
  ) {
    super(message);
  }
}

/** The sealed rotation segments of `logFile`, oldest first (`audit.jsonl` -> `audit.<n>.jsonl`). */
export function sealedSegmentsSync(logFile: string): { seq: number; file: string }[] {
  const dir = path.dirname(logFile);
  const base = path.basename(logFile);
  const ext = path.extname(base);
  const prefix = `${base.slice(0, base.length - ext.length)}.`;
  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }
  const out: { seq: number; file: string }[] = [];
  for (const n of names) {
    if (!n.startsWith(prefix) || !n.endsWith(ext) || n === base) {
      continue;
    }
    const mid = n.slice(prefix.length, n.length - ext.length);
    if (/^\d+$/.test(mid)) {
      out.push({ seq: Number(mid), file: path.join(dir, n) });
    }
  }
  return out.toSorted((a, b) => a.seq - b.seq);
}

function recordHashOf(rec: AuditRecord): string {
  return buildRecord({
    prevHash: rec.prevHash,
    type: rec.type,
    actor: rec.actor,
    level: rec.level,
    payload: rec.payload,
    ts: rec.ts,
  }).recordHash;
}

function readRange(fd: number, from: number, to: number, onChunk: (b: Buffer) => void): boolean {
  const buf = Buffer.alloc(Math.min(CHUNK, Math.max(1, to - from)));
  for (let p = from; p < to;) {
    const n = fs.readSync(fd, buf, 0, Math.min(buf.length, to - p), p);
    if (n <= 0) {
      return false;
    }
    onChunk(buf.subarray(0, n));
    p += n;
  }
  return true;
}

function readFileSafe(p: string): Buffer | null {
  try {
    return fs.readFileSync(p);
  } catch {
    return null;
  }
}

export type ChainState = Readonly<{ offset: number; head: string | null; records: number }>;

export type ChainFollower = Readonly<{
  /** Verify everything appended since the last call; the newest verified head. Throws AnchorTamper. */
  advance: () => Readonly<{ head: string | null; records: number }>;
  state: () => ChainState;
}>;

/** Follow the hash-chained log `file` from its current end. */
export function followChain(file: string): ChainFollower {
  let ino: number | null = null;
  let dev: number | null = null;
  // The followed file's birth time (statx btime, ns; null where the filesystem keeps none): an
  // inode number is free again the moment the log is deleted, so a new log can carry the old
  // (dev, ino); its birth time is new.
  let born: bigint | null = null;
  const bornOf = (fd: number): bigint | null => {
    const b = fs.fstatSync(fd, { bigint: true }).birthtimeNs;
    return b > 0n ? b : null;
  };
  const sameBirth = (a: bigint | null, b: bigint | null) => a === null || b === null || a === b;
  let offset = 0;
  let head: string | null = null;
  let records = 0;
  let prefix: Hash = createHash("sha256");

  const open = (): number | null => {
    try {
      return fs.openSync(file, "r");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }
      throw err;
    }
  };

  // Verify the complete lines of fd[from, size); returns the offset after them.
  // `lenient`: the pre-session history, taken as found.
  const consume = (fd: number, from: number, size: number, hash: Hash, lenient = false): number => {
    let rest: Buffer = Buffer.alloc(0);
    let at = from;
    readRange(fd, from, size, (chunk) => {
      let buf: Buffer = rest.length ? Buffer.concat([rest, chunk]) : Buffer.from(chunk);
      for (;;) {
        const nl = buf.indexOf(0x0a);
        if (nl < 0) {
          break;
        }
        const line = buf.subarray(0, nl + 1);
        const text = line.toString("utf8").trim();
        if (text) {
          let rec: AuditRecord | null = null;
          try {
            rec = JSON.parse(text) as AuditRecord;
          } catch {
            if (!lenient) {
              throw new AnchorTamper("record-not-json", `audit record ${records + 1} is not JSON`);
            }
          }
          if (!lenient) {
            if (
              !rec ||
              typeof rec.recordHash !== "string" ||
              recordHashOf(rec) !== rec.recordHash
            ) {
              throw new AnchorTamper(
                "record-hash-mismatch",
                `audit record ${records + 1} does not hash to its recordHash`,
              );
            }
            if (head !== null && rec.prevHash !== head) {
              throw new AnchorTamper(
                "record-link-broken",
                `audit record ${records + 1} does not link to the record before it (${JSON.stringify(rec.prevHash).slice(1, 13)}… after ${head.slice(0, 12)}…)`,
              );
            }
          }
          head = rec && typeof rec.recordHash === "string" ? rec.recordHash : head;
          records++;
        }
        hash.update(line);
        at += line.length;
        buf = buf.subarray(nl + 1);
      }
      rest = buf;
    });
    return at;
  };

  // The bytes [0, upTo) of fd must hash to the remembered prefix.
  const prefixUnchanged = (fd: number, upTo: number): boolean => {
    const h = createHash("sha256");
    if (!readRange(fd, 0, upTo, (c) => h.update(c))) {
      return false;
    }
    return h.digest("hex") === prefix.copy().digest("hex");
  };

  const fd0 = open();
  if (fd0 !== null) {
    try {
      const st = fs.fstatSync(fd0);
      ino = st.ino;
      dev = st.dev;
      born = bornOf(fd0);
      offset = consume(fd0, 0, st.size, prefix, true);
    } finally {
      fs.closeSync(fd0);
    }
  }

  const advance = () => {
    const fd = open();
    if (fd === null) {
      if (offset > 0) {
        throw new AnchorTamper("log-deleted", "the audit log was deleted");
      }
      return { head, records };
    }
    try {
      const st = fs.fstatSync(fd);
      const stBorn = bornOf(fd);
      if (ino === null) {
        ino = st.ino;
        dev = st.dev;
        born = stBorn;
      }
      if (st.ino !== ino || st.dev !== dev || !sameBirth(stBorn, born)) {
        // Rotation renames the file to a sealed segment and starts a new one
        // whose first record links to it. Anything else replaced the log.
        const segs = sealedSegmentsSync(file);
        const sealed = segs.find((s) => {
          try {
            const x = fs.statSync(s.file, { bigint: true });
            const xBorn = x.birthtimeNs > 0n ? x.birthtimeNs : null;
            return Number(x.ino) === ino && Number(x.dev) === dev && sameBirth(xBorn, born);
          } catch {
            return false;
          }
        });
        if (!sealed) {
          throw new AnchorTamper(
            "log-replaced",
            "the audit log file was replaced (a new file, not a rotation of the one this session followed)",
          );
        }
        const sfd = fs.openSync(sealed.file, "r");
        try {
          const sst = fs.fstatSync(sfd);
          if (sst.size < offset || !prefixUnchanged(sfd, offset)) {
            throw new AnchorTamper(
              "sealed-segment-changed",
              "the sealed segment of the audit log changed before the last anchored record",
            );
          }
          consume(sfd, offset, sst.size, prefix);
        } finally {
          fs.closeSync(sfd);
        }
        // Several rotations between two checks: every later sealed segment, in order.
        for (const later of segs.filter((x) => x.seq > sealed.seq)) {
          const lfd = fs.openSync(later.file, "r");
          try {
            consume(lfd, 0, fs.fstatSync(lfd).size, createHash("sha256"));
          } finally {
            fs.closeSync(lfd);
          }
        }
        ino = st.ino;
        dev = st.dev;
        born = stBorn;
        offset = 0;
        prefix = createHash("sha256");
      } else if (st.size < offset) {
        throw new AnchorTamper(
          "log-shrank",
          `the audit log shrank below the last verified record (${st.size} < ${offset} bytes)`,
        );
      } else if (offset > 0 && !prefixUnchanged(fd, offset)) {
        throw new AnchorTamper(
          "log-rewritten",
          "the audit log was rewritten before the last verified record",
        );
      }
      offset = consume(fd, offset, st.size, prefix);
      return { head, records };
    } finally {
      fs.closeSync(fd);
    }
  };

  return { advance, state: () => ({ offset, head, records }) };
}

export type AnchorFilesGuard = Readonly<{
  /** Throws AnchorTamper when either file is missing or not what was written. */
  check: () => void;
  /** Record what the launcher just wrote. */
  wrote: () => void;
}>;

/**
 * The anchor file and anchor history as the launcher left them: the file must
 * still hold exactly what it wrote, the history must still begin with exactly
 * what it held (appends are fine).
 */
export function anchorFilesGuard(anchorPath: string, historyPath: string): AnchorFilesGuard {
  let anchor = readFileSafe(anchorPath);
  let history = readFileSafe(historyPath) ?? Buffer.alloc(0);
  return {
    check() {
      const a = readFileSafe(anchorPath);
      if (anchor !== null && (a === null || !a.equals(anchor))) {
        throw a === null
          ? new AnchorTamper(
              "anchor-file-deleted",
              "the anchor file was deleted during the session",
            )
          : new AnchorTamper(
              "anchor-file-rewritten",
              "the anchor file was rewritten during the session",
            );
      }
      const h = readFileSafe(historyPath);
      if (
        history.length > 0 &&
        (h === null || h.length < history.length || !h.subarray(0, history.length).equals(history))
      ) {
        throw h === null
          ? new AnchorTamper("history-deleted", "the anchor history was deleted during the session")
          : new AnchorTamper(
              "history-rewritten",
              "the anchor history was rewritten during the session",
            );
      }
    },
    wrote() {
      anchor = readFileSafe(anchorPath);
      history = readFileSafe(historyPath) ?? Buffer.alloc(0);
    },
  };
}
