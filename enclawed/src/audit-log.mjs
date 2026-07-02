// Append-only, hash-chained audit log. Each record commits the hash of the
// previous record, so any in-place tampering of a middle record breaks chain
// verification of everything after it.
//
// HARDENING:
//   - All concurrent .append() calls are serialized through an internal
//     Promise queue so the prevHash chain stays consistent under contention.
//   - Untrusted strings inside payload values are sanitized to remove
//     newline / control characters before canonicalization, blocking
//     log-injection attempts that try to spoof a fake JSONL record.
//   - canonicalize() refuses to follow __proto__ / constructor / prototype
//     keys so a payload object cannot smuggle prototype-pollution payloads
//     into the audit hash.
//
// LIMITATION: chain verification protects against silent edits but does NOT
// protect against deletion of trailing records, or rewriting from a chosen
// prefix forward. A real audit trail requires WORM storage and off-host
// shipping (e.g. signed records replicated to an isolated audit server).
// See enclawed/FORK.md "Audit log durability".

import { createHash } from 'node:crypto';
import { open } from 'node:fs/promises';

const GENESIS_PREV_HASH = '0'.repeat(64);

const PROTO_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u0008\u000A-\u001F\u007F]/g;

function sanitizeString(s) {
  return s.replace(CONTROL_RE, '\uFFFD');
}

// Deep clone with control-char sanitization on every string. Used to
// neutralize log-injection BEFORE the payload is committed to disk and
// hashed — both views (file content and chain hash) see the same clean
// bytes.
function deepSanitize(value, seen = new WeakSet()) {
  if (typeof value === 'string') return sanitizeString(value);
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return null;  // break cycles
  seen.add(value);
  if (Array.isArray(value)) return value.map((v) => deepSanitize(v, seen));
  const out = {};
  for (const k of Object.keys(value)) {
    if (PROTO_KEYS.has(k)) continue;
    out[k] = deepSanitize(value[k], seen);
  }
  return out;
}

function canonicalize(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalize).join(',') + ']';
  const keys = Object.keys(value).filter((k) => !PROTO_KEYS.has(k)).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalize(value[k])).join(',') + '}';
}

function hashRecord(prevHash, record) {
  const h = createHash('sha256');
  h.update(prevHash);
  h.update('|');
  h.update(canonicalize(record));
  return h.digest('hex');
}

export function buildRecord({ prevHash, type, actor, level, payload, ts = Date.now() }) {
  const body = {
    ts,
    type: typeof type === 'string' ? sanitizeString(type) : type,
    actor: typeof actor === 'string' ? sanitizeString(actor) : actor,
    level: typeof level === 'string' ? sanitizeString(level) : level,
    payload: deepSanitize(payload),
  };
  const recordHash = hashRecord(prevHash, body);
  return { ...body, prevHash, recordHash };
}

export class AuditLogger {
  constructor({ filePath, clock = () => Date.now() }) {
    if (!filePath) throw new Error('AuditLogger: filePath required');
    this.filePath = filePath;
    this.clock = clock;
    this._lastHash = null;
    this._fh = null;
    // Serialization queue: every append() chains onto _writeQueue so concurrent
    // callers cannot race on _lastHash / appendFile. Without this, two
    // simultaneous appends would both read the same prevHash and produce a
    // broken chain.
    this._writeQueue = Promise.resolve();
  }

  async _ensureOpen() {
    if (this._fh) return;
    this._fh = await open(this.filePath, 'a+');
    if (this._lastHash === null) {
      this._lastHash = await this._scanLastHash();
    }
  }

  async _scanLastHash() {
    const fh = this._fh;
    const { size } = await fh.stat();
    if (size === 0) return GENESIS_PREV_HASH;
    const buf = Buffer.alloc(Math.min(8192, size));
    await fh.read(buf, 0, buf.length, Math.max(0, size - buf.length));
    const lines = buf.toString('utf8').split('\n').filter(Boolean);
    if (lines.length === 0) return GENESIS_PREV_HASH;
    try {
      return JSON.parse(lines[lines.length - 1]).recordHash;
    } catch {
      throw new Error('audit log tail is not valid JSONL');
    }
  }

  async append({ type, actor, level, payload }) {
    const next = this._writeQueue.then(async () => {
      await this._ensureOpen();
      const record = buildRecord({
        prevHash: this._lastHash,
        type,
        actor,
        level,
        payload,
        ts: this.clock(),
      });
      await this._fh.appendFile(JSON.stringify(record) + '\n');
      this._lastHash = record.recordHash;
      return record;
    });
    // Keep the queue alive even when an individual append rejects so a
    // failure does not deadlock subsequent writers.
    this._writeQueue = next.catch(() => undefined);
    return next;
  }

  async close() {
    // Drain the write queue before closing. Callers may have fired-and-
    // forgotten an append() — the per-extension egress guard does this for
    // biconditional.violation records — and without the drain, close() can
    // race ahead of the queued append's _ensureOpen() so the on-disk file
    // is never created. A subsequent verifyChain() then ENOENTs. Slow CI
    // runners hit this race deterministically.
    await this._writeQueue.catch(() => undefined);
    if (this._fh) {
      await this._fh.close();
      this._fh = null;
    }
  }
}

// Independently verify a log file. Returns { ok, count, brokenAt? }.
export async function verifyChain(filePath) {
  const fh = await open(filePath, 'r');
  try {
    const data = await fh.readFile('utf8');
    const lines = data.split('\n').filter(Boolean);
    let prev = GENESIS_PREV_HASH;
    for (let i = 0; i < lines.length; i++) {
      let rec;
      try { rec = JSON.parse(lines[i]); }
      catch { return { ok: false, count: i, brokenAt: i, reason: 'invalid JSON' }; }
      if (rec.prevHash !== prev) {
        return { ok: false, count: i, brokenAt: i, reason: 'prevHash mismatch' };
      }
      const expected = hashRecord(prev, {
        ts: rec.ts, type: rec.type, actor: rec.actor, level: rec.level, payload: rec.payload,
      });
      if (expected !== rec.recordHash) {
        return { ok: false, count: i, brokenAt: i, reason: 'recordHash mismatch' };
      }
      prev = rec.recordHash;
    }
    return { ok: true, count: lines.length };
  } finally {
    await fh.close();
  }
}
