// Secure transaction buffer with rollback.
//
// Records every reversible action with its inverse function, hash-chains
// the records for tamper-evidence, and bounds total memory use to a
// configurable percentage of system RAM (default 50%).
//
// API:
//   record({ description, payload, inverse })  -> Transaction
//   rollback(n)                                -> { rolledBack, failed, errors }
//   commit(n)                                   -> { committed }
//   bytesUsed() / bytesLimit() / size() / verifyChain() / toArray()
//
// Eviction policy: when a new record would exceed the byte cap, the oldest
// records are auto-committed in FIFO order until enough room is free. An
// auto-committed record is no longer in the rollback buffer (its inverse
// is no longer reachable) but its hash remains the chain anchor for
// subsequent records, and it is audited.
//
// "Secure" properties:
//   * Every record is bound to the previous record's hash (SHA-256 chain),
//     so silent tampering of any record breaks verifyChain() at that point.
//   * Records are frozen after construction; the inverse function is the
//     only mutable handle and it is consumed exactly once during rollback.
//   * Audit-log integration: every record / rollback / commit / eviction /
//     failed-rollback emits an audit event when an AuditLogger is wired.

import { createHash, randomUUID } from 'node:crypto';
import { totalmem } from 'node:os';

const GENESIS_HASH = '0'.repeat(64);

function approxByteSize(value) {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'string') return value.length * 2;
  if (typeof value === 'number' || typeof value === 'boolean') return 8;
  if (typeof value === 'bigint') return 16;
  try { return JSON.stringify(value).length * 2; }
  catch { return 64; }
}

function txCanonicalBody(tx) {
  return JSON.stringify({
    id: tx.id, ts: tx.ts, agentId: tx.agentId,
    description: tx.description, payload: tx.payload, byteSize: tx.byteSize,
  });
}

function hashTx(prevHash, body) {
  return createHash('sha256').update(prevHash).update('|').update(body).digest('hex');
}

export class TransactionBuffer {
  constructor({
    ramPercent = 50,
    maxBytes,
    clock = () => Date.now(),
    totalMemory = totalmem(),
    audit = null,
  } = {}) {
    if (typeof ramPercent !== 'number' || ramPercent <= 0 || ramPercent > 100) {
      throw new RangeError('ramPercent must be in (0, 100]');
    }
    this._maxBytes = maxBytes ?? Math.floor(totalMemory * (ramPercent / 100));
    if (typeof this._maxBytes !== 'number' || this._maxBytes <= 0) {
      throw new RangeError('computed maxBytes must be a positive number');
    }
    this._txs = [];
    this._bytesUsed = 0;
    this._lastHash = GENESIS_HASH;
    this._clock = clock;
    this._audit = audit;
    this._totalCommitted = 0;
    this._totalEvicted = 0;
  }

  bytesLimit() { return this._maxBytes; }
  bytesUsed()  { return this._bytesUsed; }
  size()       { return this._txs.length; }
  toArray()    { return [...this._txs]; }
  totalCommitted() { return this._totalCommitted; }
  totalEvicted()   { return this._totalEvicted; }

  record({ description, payload, inverse, agentId = null }) {
    if (typeof description !== 'string' || description.length === 0) {
      throw new TypeError('description must be a non-empty string');
    }
    if (typeof inverse !== 'function') {
      throw new TypeError('inverse must be a function');
    }
    const ts = this._clock();
    const id = randomUUID();
    const byteSize = approxByteSize(description) + approxByteSize(payload) + 256;
    if (byteSize > this._maxBytes) {
      throw new RangeError(
        `single transaction (${byteSize} bytes) exceeds buffer limit (${this._maxBytes} bytes)`,
      );
    }
    // Auto-commit oldest until there is room.
    while (this._bytesUsed + byteSize > this._maxBytes && this._txs.length > 0) {
      const evicted = this._txs.shift();
      this._bytesUsed -= evicted.byteSize;
      this._totalEvicted++;
      this._auditAppend({
        type: 'transaction.evicted', actor: 'transaction-buffer', level: null,
        payload: { id: evicted.id, description: evicted.description },
      });
    }
    const body = { id, ts, agentId, description, payload, byteSize };
    const hash = hashTx(this._lastHash, txCanonicalBody(body));
    const tx = Object.freeze({ ...body, hash, prevHash: this._lastHash, inverse });
    this._txs.push(tx);
    this._bytesUsed += byteSize;
    this._lastHash = hash;
    this._auditAppend({
      type: 'transaction.recorded', actor: 'transaction-buffer', level: null,
      payload: { id, description, byteSize, agentId },
    });
    return tx;
  }

  async rollback(n = 1) {
    if (typeof n !== 'number' || n < 1 || !Number.isFinite(n)) {
      throw new RangeError('n must be a positive integer');
    }
    let rolledBack = 0;
    let failed = 0;
    const errors = [];
    while (rolledBack + failed < n && this._txs.length > 0) {
      const tx = this._txs.pop();
      this._bytesUsed -= tx.byteSize;
      try {
        await tx.inverse();
        rolledBack++;
        this._auditAppend({
          type: 'transaction.rolled-back', actor: 'transaction-buffer', level: null,
          payload: { id: tx.id, description: tx.description },
        });
      } catch (e) {
        failed++;
        errors.push({ id: tx.id, error: String(e && e.message ? e.message : e) });
        this._auditAppend({
          type: 'transaction.rollback-failed', actor: 'transaction-buffer', level: null,
          payload: { id: tx.id, error: String(e && e.message ? e.message : e) },
        });
      }
    }
    // Re-anchor chain to new tail after pops.
    this._lastHash = this._txs.length > 0
      ? this._txs[this._txs.length - 1].hash
      : GENESIS_HASH;
    return { rolledBack, failed, errors };
  }

  commit(n = Infinity) {
    if (typeof n !== 'number' || (n < 1 && n !== Infinity)) {
      throw new RangeError('n must be a positive integer or Infinity');
    }
    let committed = 0;
    while (committed < n && this._txs.length > 0) {
      const tx = this._txs.shift();
      this._bytesUsed -= tx.byteSize;
      committed++;
      this._totalCommitted++;
      this._auditAppend({
        type: 'transaction.committed', actor: 'transaction-buffer', level: null,
        payload: { id: tx.id, description: tx.description },
      });
    }
    // Note: committing from the head does NOT reset _lastHash because new
    // records still chain from the tail. _lastHash is the chain head, which
    // remains valid. If the entire buffer is drained _lastHash is preserved
    // so any subsequent record continues the same chain.
    return { committed };
  }

  verifyChain() {
    if (this._txs.length === 0) return true;
    let prev = this._txs[0].prevHash;
    for (const tx of this._txs) {
      if (tx.prevHash !== prev) return false;
      const expected = hashTx(prev, txCanonicalBody({
        id: tx.id, ts: tx.ts, agentId: tx.agentId,
        description: tx.description, payload: tx.payload, byteSize: tx.byteSize,
      }));
      if (expected !== tx.hash) return false;
      prev = tx.hash;
    }
    return true;
  }

  _auditAppend(record) {
    if (this._audit) {
      this._audit.append(record).catch(() => {});
    }
  }
}
