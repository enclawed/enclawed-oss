// Secure transaction buffer with rollback. See enclawed/src/transaction-buffer.mjs
// for the canonical reference; this is the TypeScript twin used by the
// upstream build. Same semantics, same hash chain.

import { createHash, randomUUID } from "node:crypto";
import { totalmem } from "node:os";
import type { AuditLogger } from "./audit-log.js";

const GENESIS_HASH = "0".repeat(64);

function approxByteSize(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "string") return value.length * 2;
  if (typeof value === "number" || typeof value === "boolean") return 8;
  if (typeof value === "bigint") return 16;
  try { return JSON.stringify(value).length * 2; }
  catch { return 64; }
}

export type Transaction = Readonly<{
  id: string;
  ts: number;
  agentId: string | null;
  description: string;
  payload: unknown;
  byteSize: number;
  hash: string;
  prevHash: string;
  inverse: () => void | Promise<void>;
}>;

function txCanonicalBody(tx: Pick<Transaction, "id" | "ts" | "agentId" | "description" | "payload" | "byteSize">): string {
  return JSON.stringify({
    id: tx.id, ts: tx.ts, agentId: tx.agentId,
    description: tx.description, payload: tx.payload, byteSize: tx.byteSize,
  });
}

function hashTx(prevHash: string, body: string): string {
  return createHash("sha256").update(prevHash).update("|").update(body).digest("hex");
}

export type RollbackResult = {
  rolledBack: number;
  failed: number;
  errors: Array<{ id: string; error: string }>;
};

export type TransactionBufferOpts = {
  ramPercent?: number;
  maxBytes?: number;
  clock?: () => number;
  totalMemory?: number;
  audit?: AuditLogger | null;
};

export class TransactionBuffer {
  private readonly _maxBytes: number;
  private _txs: Transaction[] = [];
  private _bytesUsed = 0;
  private _lastHash = GENESIS_HASH;
  private readonly _clock: () => number;
  private readonly _audit: AuditLogger | null;
  private _totalCommitted = 0;
  private _totalEvicted = 0;

  constructor(opts: TransactionBufferOpts = {}) {
    const ramPercent = opts.ramPercent ?? 50;
    if (typeof ramPercent !== "number" || ramPercent <= 0 || ramPercent > 100) {
      throw new RangeError("ramPercent must be in (0, 100]");
    }
    const total = opts.totalMemory ?? totalmem();
    this._maxBytes = opts.maxBytes ?? Math.floor(total * (ramPercent / 100));
    if (typeof this._maxBytes !== "number" || this._maxBytes <= 0) {
      throw new RangeError("computed maxBytes must be a positive number");
    }
    this._clock = opts.clock ?? (() => Date.now());
    this._audit = opts.audit ?? null;
  }

  bytesLimit(): number { return this._maxBytes; }
  bytesUsed():  number { return this._bytesUsed; }
  size():       number { return this._txs.length; }
  toArray():    Transaction[] { return [...this._txs]; }
  totalCommitted(): number { return this._totalCommitted; }
  totalEvicted():   number { return this._totalEvicted; }

  record(input: {
    description: string;
    payload: unknown;
    inverse: () => void | Promise<void>;
    agentId?: string | null;
  }): Transaction {
    if (typeof input.description !== "string" || input.description.length === 0) {
      throw new TypeError("description must be a non-empty string");
    }
    if (typeof input.inverse !== "function") {
      throw new TypeError("inverse must be a function");
    }
    const ts = this._clock();
    const id = randomUUID();
    const byteSize = approxByteSize(input.description) + approxByteSize(input.payload) + 256;
    if (byteSize > this._maxBytes) {
      throw new RangeError(
        `single transaction (${byteSize} bytes) exceeds buffer limit (${this._maxBytes} bytes)`,
      );
    }
    while (this._bytesUsed + byteSize > this._maxBytes && this._txs.length > 0) {
      const evicted = this._txs.shift()!;
      this._bytesUsed -= evicted.byteSize;
      this._totalEvicted++;
      this._auditAppend("transaction.evicted", { id: evicted.id, description: evicted.description });
    }
    const body = {
      id, ts, agentId: input.agentId ?? null,
      description: input.description, payload: input.payload, byteSize,
    };
    const hash = hashTx(this._lastHash, txCanonicalBody(body));
    const tx: Transaction = Object.freeze({ ...body, hash, prevHash: this._lastHash, inverse: input.inverse });
    this._txs.push(tx);
    this._bytesUsed += byteSize;
    this._lastHash = hash;
    this._auditAppend("transaction.recorded", { id, description: input.description, byteSize, agentId: body.agentId });
    return tx;
  }

  async rollback(n: number = 1): Promise<RollbackResult> {
    if (typeof n !== "number" || n < 1 || !Number.isFinite(n)) {
      throw new RangeError("n must be a positive integer");
    }
    let rolledBack = 0;
    let failed = 0;
    const errors: Array<{ id: string; error: string }> = [];
    while (rolledBack + failed < n && this._txs.length > 0) {
      const tx = this._txs.pop()!;
      this._bytesUsed -= tx.byteSize;
      try {
        await tx.inverse();
        rolledBack++;
        this._auditAppend("transaction.rolled-back", { id: tx.id, description: tx.description });
      } catch (e) {
        failed++;
        const err = (e as Error)?.message ?? String(e);
        errors.push({ id: tx.id, error: err });
        this._auditAppend("transaction.rollback-failed", { id: tx.id, error: err });
      }
    }
    this._lastHash = this._txs.length > 0
      ? this._txs[this._txs.length - 1]!.hash
      : GENESIS_HASH;
    return { rolledBack, failed, errors };
  }

  commit(n: number = Infinity): { committed: number } {
    if (typeof n !== "number" || (n < 1 && n !== Infinity)) {
      throw new RangeError("n must be a positive integer or Infinity");
    }
    let committed = 0;
    while (committed < n && this._txs.length > 0) {
      const tx = this._txs.shift()!;
      this._bytesUsed -= tx.byteSize;
      committed++;
      this._totalCommitted++;
      this._auditAppend("transaction.committed", { id: tx.id, description: tx.description });
    }
    return { committed };
  }

  verifyChain(): boolean {
    if (this._txs.length === 0) return true;
    let prev = this._txs[0]!.prevHash;
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

  private _auditAppend(type: string, payload: unknown): void {
    if (this._audit) {
      this._audit.append({ type, actor: "transaction-buffer", level: null, payload }).catch(() => {});
    }
  }
}
