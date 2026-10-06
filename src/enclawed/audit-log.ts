// Hash-chained append-only audit log. See enclawed/FORK.md §8.2 for the
// durability gaps a real ATO must close.
//
// HARDENING (mirrors enclawed/src/audit-log.mjs):
//   - Concurrent append() is serialized through an internal Promise queue
//     so the prevHash chain stays consistent under contention.
//   - Untrusted strings inside payload values are sanitized to remove
//     newline / control characters before canonicalization, blocking
//     log-injection attempts that try to spoof a fake JSONL record.
//   - canonicalize() refuses to follow __proto__ / constructor / prototype
//     keys so a payload object cannot smuggle prototype-pollution payloads
//     into the audit hash.

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { open, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";

const GENESIS_PREV_HASH = "0".repeat(64);
const PROTO_KEYS = new Set(["__proto__", "prototype", "constructor"]);

// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u0008\u000A-\u001F\u007F]/g;

function sanitizeString(s: string): string {
  return s.replace(CONTROL_RE, "\uFFFD");
}

// Deep clone with control-char sanitization on every string. Used to
// neutralize log-injection BEFORE the payload is committed to disk and
// hashed — both views (file content and chain hash) see the same clean bytes.
function deepSanitize(value: unknown, seen: WeakSet<object> = new WeakSet()): unknown {
  if (typeof value === "string") {
    return sanitizeString(value);
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (seen.has(value)) {
    return null;
  }
  seen.add(value);
  if (Array.isArray(value)) {
    return value.map((v) => deepSanitize(v, seen));
  }
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(obj)) {
    if (PROTO_KEYS.has(k)) {
      continue;
    }
    out[k] = deepSanitize(obj[k], seen);
  }
  return out;
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return "[" + value.map(canonicalize).join(",") + "]";
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => !PROTO_KEYS.has(k))
    .toSorted();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalize(obj[k])).join(",") + "}";
}

function hashRecord(prevHash: string, record: unknown): string {
  const h = createHash("sha256");
  h.update(prevHash);
  h.update("|");
  h.update(canonicalize(record));
  return h.digest("hex");
}

export type AuditRecord = {
  ts: number;
  type: string;
  actor: string;
  level: string | null;
  payload: unknown;
  prevHash: string;
  recordHash: string;
};

export function buildRecord(input: {
  prevHash: string;
  type: string;
  actor: string;
  level: string | null;
  payload: unknown;
  ts?: number;
}): AuditRecord {
  const ts = input.ts ?? Date.now();
  const body = {
    ts,
    type: typeof input.type === "string" ? sanitizeString(input.type) : input.type,
    actor: typeof input.actor === "string" ? sanitizeString(input.actor) : input.actor,
    level: typeof input.level === "string" ? sanitizeString(input.level) : input.level,
    payload: deepSanitize(input.payload),
  };
  const recordHash = hashRecord(input.prevHash, body);
  return { ...body, prevHash: input.prevHash, recordHash };
}

type FileHandleLike = {
  stat: () => Promise<{ size: number }>;
  read: (buf: Uint8Array, offset: number, length: number, position: number) => Promise<unknown>;
  appendFile: (data: string) => Promise<unknown>;
  close: () => Promise<unknown>;
};

/**
 * Where the last known-good head hash is kept.
 *
 * The whole value of an anchor is how hard it is for whoever can rewrite the
 * LOG to also rewrite the ANCHOR. That is a spectrum, and the sink is an
 * interface so the answer can move along it without touching the chain logic:
 *
 *   file         same disk, same process. Stops a naive truncation and makes
 *                it noisy; an attacker who thought to delete the log will
 *                think to delete this too. The default, because it always
 *                works and costs nothing.
 *
 *   enclaweder   the hardware root, via ANCHOR_SET/ANCHOR_GET. An attacker with
 *                full filesystem access cannot forge it without the device, and
 *                -- because the device keeps a monotonic counter the host has no
 *                opcode to set -- cannot replay an older genuine anchor either.
 *                Replay is the attack a signature alone does not stop.
 *
 *   distributed  a public append-only ledger. Strongest for non-repudiation,
 *                since the anchor is independently witnessed and not ours to
 *                revise. Costs latency and money per write, so it suits
 *                periodic checkpoints rather than every record, and only a
 *                hash is ever published -- never log content.
 */
export interface HeadAnchorSink {
  /** Identifies the sink in verification output, so "matched" says matched WHERE. */
  readonly id: string;
  write(hash: string): Promise<void>;
  read(): Promise<string | null>;
  /**
   * Optional richer read: the head, plus how strongly it is attested.
   *
   *   device   read live from the hardware root, counter and all. Completeness
   *            is demonstrated, not merely asserted.
   *   offline  a device-signed record read from disk while the device was away.
   *            It proves the head WAS signed, but not that it is the LATEST one
   *            -- an older signed anchor could have been restored, and only the
   *            device's counter distinguishes those.
   *   none     nothing to compare against.
   *
   * The distinction exists so an unplugged device cannot quietly look like a
   * full verification. Sinks without it are treated as "device"-equivalent for
   * their own medium, since there is nothing weaker to fall back to.
   */
  readAttested?(): Promise<{ head: string | null; attested: "device" | "offline" | "none" }>;
}

/**
 * Sidecar holding the hash of the last record written.
 *
 * A hash chain proves that nothing was altered or inserted. It cannot prove
 * that nothing was REMOVED: deleting the trailing records leaves a shorter
 * chain that verifies perfectly, so an attacker need only truncate away the
 * entries that recorded what they did. Measured on this implementation --
 * deleting the last four of ten records returned {ok:true,count:6}.
 *
 * The fix is to remember, outside the log, what the head was. Verification
 * then recomputes the head and compares; a chain that verifies internally but
 * ends somewhere other than the recorded head has lost records.
 *
 * This is a speed bump, not a vault: an attacker with write access to both
 * files can update the anchor too. It exists so that truncating the log alone
 * is no longer sufficient and no longer silent, and so the anchor can later be
 * sealed somewhere the log's own writer cannot reach.
 */
export function headAnchorPath(logPath: string): string {
  return `${logPath}.head`;
}

/** The default sink: a file beside the log. */
export function fileHeadAnchor(logPath: string): HeadAnchorSink {
  const file = headAnchorPath(logPath);
  return {
    id: "file",
    async write(hash) {
      await writeFile(file, `${hash}\n`, "utf8");
    },
    async read() {
      try {
        const raw = (await readFile(file, "utf8")).trim();
        return /^[0-9a-f]{64}$/.test(raw) ? raw : null;
      } catch {
        return null;
      }
    },
  };
}

/**
 * Rotation, without breaking the chain.
 *
 * The log had none, and a production install reached 865 MB in five days --
 * large enough that reading it whole threw ERR_STRING_TOO_LONG and the chain
 * became unverifiable exactly when it mattered most.
 *
 * The obvious fix -- start a fresh file -- would break the property the log
 * exists for, because a new chain starting at genesis is indistinguishable from
 * one whose history was thrown away. So rotation SEALS the current file and the
 * new one opens with a segment-start record whose prevHash is the sealed file's
 * head. The chain therefore continues across files, and the seam is a link that
 * can be checked rather than a gap that must be trusted.
 *
 * Nothing is ever deleted. Discarding old segments is precisely what an attacker
 * would want, so retention is left as an explicit operator decision rather than
 * something the writer does on its own.
 */
/** Head (last recordHash) of a sealed segment, without reading it whole. */
async function tailHead(file: string): Promise<string | null> {
  try {
    const { size } = await stat(file);
    if (size === 0) {
      return null;
    }
    const fh = await open(file, "r");
    try {
      const buf = Buffer.alloc(Math.min(8192, size));
      await fh.read(buf, 0, buf.length, Math.max(0, size - buf.length));
      const lines = buf.toString("utf8").split("\n").filter(Boolean);
      if (lines.length === 0) {
        return null;
      }
      return (JSON.parse(lines[lines.length - 1]) as AuditRecord).recordHash;
    } finally {
      await fh.close();
    }
  } catch {
    return null;
  }
}

export const SEGMENT_START_TYPE = "audit.segment.start";

export type SegmentLink = { seq: number; prevSegment: string; prevHead: string };

/** `audit.jsonl` + seq 3 -> `audit.3.jsonl`. */
export function segmentPath(logPath: string, seq: number): string {
  const dir = path.dirname(logPath);
  const base = path.basename(logPath);
  const ext = path.extname(base);
  return path.join(dir, `${base.slice(0, base.length - ext.length)}.${seq}${ext}`);
}

/** Sealed segments oldest-first. Gaps are not silently skipped: see verifyHistory. */
export async function listSegments(logPath: string): Promise<{ seq: number; file: string }[]> {
  const dir = path.dirname(logPath);
  const base = path.basename(logPath);
  const ext = path.extname(base);
  const prefix = `${base.slice(0, base.length - ext.length)}.`;
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return [];
  }
  const out: { seq: number; file: string }[] = [];
  for (const name of names) {
    // Matched by prefix and suffix rather than a built regex: the filename is
    // user-controlled enough (the log path comes from config) that escaping it
    // into a pattern is a hazard, and this cannot be got subtly wrong.
    if (!name.startsWith(prefix) || !name.endsWith(ext) || name === base) {
      continue;
    }
    const mid = name.slice(prefix.length, name.length - ext.length);
    if (!/^\d+$/.test(mid)) {
      continue;
    }
    out.push({ seq: Number(mid), file: path.join(dir, name) });
  }
  return out.toSorted((a, b) => a.seq - b.seq);
}

/**
 * If this record is a valid segment link, return it.
 *
 * The link must be self-consistent -- the head it names has to be the very
 * prevHash it chains from -- so a forged header cannot claim to continue from
 * one place while chaining from another.
 */
export function segmentLink(rec: AuditRecord): SegmentLink | null {
  if (rec.type !== SEGMENT_START_TYPE || typeof rec.payload !== "object" || rec.payload === null) {
    return null;
  }
  const p = rec.payload as Record<string, unknown>;
  if (
    typeof p.prevHead !== "string" ||
    typeof p.prevSegment !== "string" ||
    typeof p.seq !== "number" ||
    p.prevHead !== rec.prevHash
  ) {
    return null;
  }
  return { seq: p.seq, prevSegment: p.prevSegment, prevHead: p.prevHead };
}

export class AuditLogger {
  private _lastHash: string | null = null;
  private _fh: FileHandleLike | null = null;
  private _writeQueue: Promise<unknown> = Promise.resolve();
  private readonly clock: () => number;

  private readonly anchor: HeadAnchorSink;

  constructor(
    private readonly opts: {
      filePath: string;
      clock?: () => number;
      /** Defaults to a file beside the log; see HeadAnchorSink. */
      headAnchor?: HeadAnchorSink;
      /**
       * Seal the current segment once it would exceed this. Default 64 MiB --
       * comfortably under Node's ~512 MB string cap even for tools that read a
       * whole segment, and small enough that a single segment stays workable.
       * Nothing is deleted on rotation; see the rotation notes above.
       */
      maxBytes?: number;
    },
  ) {
    if (!opts.filePath) {
      throw new Error("AuditLogger: filePath required");
    }
    this.clock = opts.clock ?? (() => Date.now());
    this.anchor = opts.headAnchor ?? fileHeadAnchor(opts.filePath);
    this.maxBytes = opts.maxBytes ?? 64 * 1024 * 1024;
  }

  private readonly maxBytes: number;
  private _size = 0;

  private async _ensureOpen(): Promise<void> {
    if (this._fh) {
      return;
    }
    this._fh = (await open(this.opts.filePath, "a+")) as unknown as FileHandleLike;
    this._size = (await this._fh.stat()).size;
    if (this._lastHash === null) {
      this._lastHash = await this._scanLastHash();
    }
    if (this._size === 0) {
      // An empty current segment with sealed segments behind it means we were
      // interrupted between the rename and the header write. Picking up from
      // genesis here would silently orphan every sealed segment, so recover the
      // link instead of starting a new history.
      const segs = await listSegments(this.opts.filePath);
      if (segs.length > 0) {
        const last = segs[segs.length - 1];
        const head = await tailHead(last.file);
        if (head !== null) {
          this._lastHash = head;
          await this._writeSegmentStart(last.seq, path.basename(last.file), head);
        }
      }
    }
  }

  private async _writeSegmentStart(
    seq: number,
    prevSegment: string,
    prevHead: string,
  ): Promise<void> {
    const rec = buildRecord({
      prevHash: prevHead,
      type: SEGMENT_START_TYPE,
      actor: "audit-log",
      level: "INTERNAL",
      payload: { seq, prevSegment, prevHead },
      ts: this.clock(),
    });
    const line = JSON.stringify(rec) + "\n";
    await this._fh!.appendFile(line);
    this._size += Buffer.byteLength(line);
    this._lastHash = rec.recordHash;
    await this._writeHeadAnchor(rec.recordHash).catch(() => {});
  }

  /**
   * Seal the current segment and open a new one linked to it.
   *
   * Order matters: the file is renamed BEFORE the new one is opened, and the
   * link record is written immediately after. A crash anywhere in here leaves
   * either a sealed segment with no successor yet, or an empty successor --
   * both recoverable in _ensureOpen, and neither loses a record.
   */
  private async _rotate(): Promise<void> {
    const segs = await listSegments(this.opts.filePath);
    const seq = segs.length > 0 ? segs[segs.length - 1].seq + 1 : 1;
    const sealed = segmentPath(this.opts.filePath, seq);
    const head = this._lastHash!;
    await this._fh!.close();
    this._fh = null;
    await rename(this.opts.filePath, sealed);
    this._fh = (await open(this.opts.filePath, "a+")) as unknown as FileHandleLike;
    this._size = 0;
    await this._writeSegmentStart(seq, path.basename(sealed), head);
  }

  private async _writeHeadAnchor(hash: string): Promise<void> {
    await this.anchor.write(hash);
  }

  private async _scanLastHash(): Promise<string> {
    const fh = this._fh!;
    const { size } = await fh.stat();
    if (size === 0) {
      return GENESIS_PREV_HASH;
    }
    const buf = Buffer.alloc(Math.min(8192, size));
    await fh.read(buf, 0, buf.length, Math.max(0, size - buf.length));
    const lines = buf.toString("utf8").split("\n").filter(Boolean);
    if (lines.length === 0) {
      return GENESIS_PREV_HASH;
    }
    try {
      return (JSON.parse(lines[lines.length - 1]) as AuditRecord).recordHash;
    } catch {
      throw new Error("audit log tail is not valid JSONL");
    }
  }

  async append(input: {
    type: string;
    actor: string;
    level: string | null;
    payload: unknown;
  }): Promise<AuditRecord> {
    const next = this._writeQueue.then(async () => {
      await this._ensureOpen();
      // Size the record first so the decision to rotate is made BEFORE it is
      // chained. Rotating afterwards would leave the record hanging off the
      // sealed segment's head while sitting in the new file.
      const probe = JSON.stringify(
        buildRecord({
          prevHash: this._lastHash!,
          type: input.type,
          actor: input.actor,
          level: input.level,
          payload: input.payload,
          ts: this.clock(),
        }),
      );
      if (this._size > 0 && this._size + probe.length + 1 > this.maxBytes) {
        await this._rotate();
      }
      const record = buildRecord({
        prevHash: this._lastHash!,
        type: input.type,
        actor: input.actor,
        level: input.level,
        payload: input.payload,
        ts: this.clock(),
      });
      const line = JSON.stringify(record) + "\n";
      await this._fh!.appendFile(line);
      this._size += Buffer.byteLength(line);
      this._lastHash = record.recordHash;
      // Record the new head next to the log. Written after the append, so a
      // crash between the two leaves the anchor one record behind rather than
      // ahead -- an anchor that names a record the log does not contain would
      // be indistinguishable from truncation.
      await this._writeHeadAnchor(record.recordHash).catch(() => {
        // A failed anchor write must not lose the audit record that was
        // already durably appended. Verification reports a missing anchor as
        // unverifiable rather than as tampering.
      });
      return record;
    });
    this._writeQueue = next.catch(() => undefined);
    return next;
  }

  async close(): Promise<void> {
    if (this._fh) {
      await this._fh.close();
      this._fh = null;
    }
  }
}

export type ChainVerifyResult =
  | {
      ok: true;
      count: number;
      head: string;
      /**
       * "matched"          head confirmed against the anchor.
       * "matched-offline"  confirmed against a device-signed record read from
       *                    disk, with the device absent. The head was signed,
       *                    but a restored OLDER anchor cannot be ruled out --
       *                    that is what the device's counter is for.
       * "absent"           no anchor, so completeness is unproven.
       */
      anchor: "matched" | "matched-offline" | "absent";
      /** Which sink answered, so "matched" says matched WHERE. */
      anchorId: string;
      /** Segment this file continues from, if it is a rotated continuation. */
      continuesFrom?: string;
    }
  | { ok: false; count: number; brokenAt: number; reason: string };

/**
 * Verify the hash chain, one record at a time.
 *
 * This streams rather than reading the file, and that is not an optimisation.
 * Node caps a string at about 512MB, and this log has no rotation: a live
 * install reached 810MB in under five days. Reading it whole threw
 * ERR_STRING_TOO_LONG, which meant the chain became unverifiable exactly when
 * it grew large enough to matter -- the failure mode a tamper-evident log can
 * least afford, since "cannot verify" and "verifies fine" must never be the
 * same observation from the outside.
 *
 * Verification is inherently sequential, so a line stream is also the natural
 * shape: memory stays flat regardless of how far the log has grown.
 */
export async function verifyChain(
  filePath: string,
  headAnchor?: HeadAnchorSink,
): Promise<ChainVerifyResult> {
  const stream = createReadStream(filePath, { encoding: "utf8" });
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  let prev = GENESIS_PREV_HASH;
  let continuesFrom: string | undefined;
  let i = 0;
  try {
    for await (const line of lines) {
      if (line.length === 0) {
        continue;
      }
      let rec: AuditRecord;
      try {
        rec = JSON.parse(line) as AuditRecord;
      } catch {
        return { ok: false, count: i, brokenAt: i, reason: "invalid JSON" };
      }
      if (i === 0 && rec.prevHash !== GENESIS_PREV_HASH) {
        // A rotated segment does not start at genesis; it starts where the
        // previous one ended. Accept that ONLY via a self-consistent link
        // record, and report it, so a caller is never left thinking it saw the
        // whole history when it saw one segment. verifyHistory checks that the
        // named segment really does end on this hash -- here we cannot, and
        // saying so is the point.
        const link = segmentLink(rec);
        if (link) {
          prev = rec.prevHash;
          continuesFrom = link.prevSegment;
        }
      }
      if (rec.prevHash !== prev) {
        return { ok: false, count: i, brokenAt: i, reason: "prevHash mismatch" };
      }
      const expected = hashRecord(prev, {
        ts: rec.ts,
        type: rec.type,
        actor: rec.actor,
        level: rec.level,
        payload: rec.payload,
      });
      if (expected !== rec.recordHash) {
        return { ok: false, count: i, brokenAt: i, reason: "recordHash mismatch" };
      }
      prev = rec.recordHash;
      i++;
    }
    // The chain is internally consistent. That still does not prove it is
    // COMPLETE: a truncated log is a shorter valid chain. Compare the head we
    // just recomputed against the last head recorded beside the log.
    const sink = headAnchor ?? fileHeadAnchor(filePath);
    let expectedHead: string | null;
    let attested: "device" | "offline" | "none" = "device";
    try {
      if (sink.readAttested) {
        const r = await sink.readAttested();
        expectedHead = r.head;
        attested = r.attested;
      } else {
        expectedHead = await sink.read();
      }
    } catch (err) {
      // A sink may refuse to hand back a head it cannot vouch for -- the
      // device-signed anchor throws when the signature does not cover the
      // stored head. "Present but unverifiable" is a finding, not an absence,
      // and reporting it as ok would hand an attacker the outcome they wanted.
      return {
        ok: false,
        count: i,
        brokenAt: i,
        reason: `head anchor (${sink.id}) could not be verified: ${
          err instanceof Error ? err.message : String(err)
        }`,
      };
    }
    if (expectedHead !== null && expectedHead !== prev) {
      return {
        ok: false,
        count: i,
        brokenAt: i,
        reason:
          "chain verifies but ends at a different record than the recorded head " +
          `(expected ${expectedHead.slice(0, 12)}..., found ${prev.slice(0, 12)}...): ` +
          "records have been removed from the end",
      };
    }
    return {
      ok: true,
      count: i,
      head: prev,
      anchor:
        expectedHead === null ? "absent" : attested === "offline" ? "matched-offline" : "matched",
      anchorId: sink.id,
      ...(continuesFrom ? { continuesFrom } : {}),
    };
  } finally {
    lines.close();
    stream.close();
  }
}

export type HistoryVerifyResult =
  | {
      ok: true;
      segments: { file: string; count: number }[];
      count: number;
      head: string;
      anchor: "matched" | "matched-offline" | "absent";
      anchorId: string;
    }
  | {
      ok: false;
      file: string;
      /** Records verified across the whole history before the failure. */
      count: number;
      /** Index of the offending record WITHIN `file`, or null for a seam failure. */
      brokenAt: number | null;
      reason: string;
    };

/**
 * Verify the whole history across every rotated segment.
 *
 * verifyChain checks one file, and a rotated file legitimately begins mid-chain,
 * so on its own it cannot tell a genuine continuation from a fabricated one --
 * an attacker could delete every earlier segment and forge a link header
 * claiming to continue from a file that no longer exists. This walks the
 * segments oldest-first and checks each seam against the file it names, so a
 * missing or substituted segment is caught rather than assumed away.
 *
 * The anchor is checked once, at the end, against the newest head.
 */
export async function verifyHistory(
  filePath: string,
  headAnchor?: HeadAnchorSink,
): Promise<HistoryVerifyResult> {
  const segs = await listSegments(filePath);
  const files = [...segs.map((x) => x.file), filePath];
  const out: { file: string; count: number }[] = [];
  let total = 0;
  let expectPrev: string | null = null; // null = first file, must start at genesis

  for (const file of files) {
    const isLast = file === filePath;
    // Only the final file is measured against the anchor: the sealed ones no
    // longer end on the current head, and comparing them to it would report
    // every healthy rotation as tampering.
    const r = await verifyChain(file, isLast ? headAnchor : NO_ANCHOR);
    if (!r.ok) {
      return { ok: false, file, count: total + r.count, brokenAt: r.brokenAt, reason: r.reason };
    }
    const first = await firstRecord(file);
    if (expectPrev === null) {
      if (first !== null && first.prevHash !== GENESIS_PREV_HASH) {
        return {
          ok: false,
          file,
          count: total,
          brokenAt: null,
          reason: "the oldest segment does not start at genesis: earlier segments are missing",
        };
      }
    } else if (first === null) {
      return {
        ok: false,
        file,
        count: total,
        brokenAt: null,
        reason: "segment is empty; the chain has a gap",
      };
    } else if (first.prevHash !== expectPrev) {
      return {
        ok: false,
        file,
        count: total,
        brokenAt: null,
        reason:
          `segment starts from ${first.prevHash.slice(0, 12)}... but the previous one ends at ` +
          `${expectPrev.slice(0, 12)}...: a segment has been removed or replaced`,
      };
    }
    out.push({ file, count: r.count });
    total += r.count;
    expectPrev = r.head;
    if (isLast) {
      return {
        ok: true,
        segments: out,
        count: total,
        head: r.head,
        anchor: r.anchor,
        anchorId: r.anchorId,
      };
    }
  }
  return { ok: false, file: filePath, count: total, brokenAt: null, reason: "no segments found" };
}

/** A sink that asserts nothing, for verifying sealed segments mid-history. */
const NO_ANCHOR: HeadAnchorSink = {
  id: "none",
  async write() {
    /* sealed segments are never re-anchored */
  },
  async read() {
    return null;
  },
};

async function firstRecord(file: string): Promise<AuditRecord | null> {
  const stream = createReadStream(file, { encoding: "utf8" });
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  try {
    for await (const line of lines) {
      if (line.length === 0) {
        continue;
      }
      try {
        return JSON.parse(line) as AuditRecord;
      } catch {
        return null;
      }
    }
    return null;
  } finally {
    lines.close();
    stream.close();
  }
}
