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
import { open } from "node:fs/promises";

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
  if (typeof value === "string") return sanitizeString(value);
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value as object)) return null;
  seen.add(value as object);
  if (Array.isArray(value)) return value.map((v) => deepSanitize(v, seen));
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(obj)) {
    if (PROTO_KEYS.has(k)) continue;
    out[k] = deepSanitize(obj[k], seen);
  }
  return out;
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonicalize).join(",") + "]";
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).filter((k) => !PROTO_KEYS.has(k)).sort();
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
  read: (
    buf: Uint8Array,
    offset: number,
    length: number,
    position: number,
  ) => Promise<unknown>;
  appendFile: (data: string) => Promise<unknown>;
  close: () => Promise<unknown>;
};

export class AuditLogger {
  private _lastHash: string | null = null;
  private _fh: FileHandleLike | null = null;
  private _writeQueue: Promise<unknown> = Promise.resolve();
  private readonly clock: () => number;

  constructor(private readonly opts: { filePath: string; clock?: () => number }) {
    if (!opts.filePath) throw new Error("AuditLogger: filePath required");
    this.clock = opts.clock ?? (() => Date.now());
  }

  private async _ensureOpen(): Promise<void> {
    if (this._fh) return;
    this._fh = (await open(this.opts.filePath, "a+")) as unknown as FileHandleLike;
    if (this._lastHash === null) {
      this._lastHash = await this._scanLastHash();
    }
  }

  private async _scanLastHash(): Promise<string> {
    const fh = this._fh!;
    const { size } = await fh.stat();
    if (size === 0) return GENESIS_PREV_HASH;
    const buf = Buffer.alloc(Math.min(8192, size));
    await fh.read(buf, 0, buf.length, Math.max(0, size - buf.length));
    const lines = buf.toString("utf8").split("\n").filter(Boolean);
    if (lines.length === 0) return GENESIS_PREV_HASH;
    try {
      return (JSON.parse(lines[lines.length - 1]!) as AuditRecord).recordHash;
    } catch {
      throw new Error("audit log tail is not valid JSONL");
    }
  }

  async append(input: { type: string; actor: string; level: string | null; payload: unknown }): Promise<AuditRecord> {
    const next = this._writeQueue.then(async () => {
      await this._ensureOpen();
      const record = buildRecord({
        prevHash: this._lastHash!,
        type: input.type,
        actor: input.actor,
        level: input.level,
        payload: input.payload,
        ts: this.clock(),
      });
      await this._fh!.appendFile(JSON.stringify(record) + "\n");
      this._lastHash = record.recordHash;
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
  | { ok: true; count: number }
  | { ok: false; count: number; brokenAt: number; reason: string };

export async function verifyChain(filePath: string): Promise<ChainVerifyResult> {
  const fh = await open(filePath, "r");
  try {
    const data = await fh.readFile("utf8");
    const lines = data.split("\n").filter(Boolean);
    let prev = GENESIS_PREV_HASH;
    for (let i = 0; i < lines.length; i++) {
      let rec: AuditRecord;
      try {
        rec = JSON.parse(lines[i]!) as AuditRecord;
      } catch {
        return { ok: false, count: i, brokenAt: i, reason: "invalid JSON" };
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
    }
    return { ok: true, count: lines.length };
  } finally {
    await fh.close();
  }
}
