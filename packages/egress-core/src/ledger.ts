// Per-sink capacity ledger — a leaky/token bucket bounding the covert bit-rate
// any single destination can sustain. Stages measure information density and
// consume from the ledger; when it is exhausted the behavioral-invariants
// stage delays or cancels.

import type { CapacityLedger } from "./types.js";

export type LedgerOptions = {
  /** Bucket size — peak burst of covert bits tolerated. */
  capacityBits: number;
  /** Steady-state refill rate. */
  refillBitsPerSec: number;
  /** Injectable clock. */
  now?: () => number;
};

export function createCapacityLedger(opts: LedgerOptions): CapacityLedger {
  const now = opts.now ?? Date.now;
  const capacity = Math.max(0, opts.capacityBits);
  const rate = Math.max(0, opts.refillBitsPerSec);
  let tokens = capacity;
  let last = now();
  let observed = 0;

  function refill(nowMs: number): void {
    const elapsedSec = Math.max(0, (nowMs - last) / 1000);
    tokens = Math.min(capacity, tokens + elapsedSec * rate);
    last = nowMs;
  }

  return {
    tryConsume(bits: number): boolean {
      refill(now());
      const need = Math.max(0, bits);
      if (need <= tokens) {
        tokens -= need;
        return true;
      }
      return false;
    },
    available(): number {
      refill(now());
      return tokens;
    },
    refill,
    observe(bits: number): void {
      observed += Math.max(0, bits);
    },
    observedTotal(): number {
      return observed;
    },
  };
}

/**
 * Bounded store of per-sink ledgers. Capped to defend against unbounded growth
 * from attacker-chosen sink ids (CWE-400) — the same concern the gateway
 * control-plane rate limiter guards against.
 *
 * At the cap the store never resets a ledger that still holds spend: that
 * would hand a drained sink a fresh budget. It first evicts ledgers whose
 * bucket is full again (they carry no spend history). If none can go, new
 * sinks share one overflow ledger, so flooding the store with fresh sink ids
 * buys no extra capacity.
 */
export function createLedgerStore(opts: LedgerOptions & { maxSinks?: number }): {
  get(sinkId: string): CapacityLedger;
  size(): number;
  clear(): void;
} {
  const store = new Map<string, CapacityLedger>();
  const maxSinks = Math.max(1, opts.maxSinks ?? 4096);
  const capacity = Math.max(0, opts.capacityBits);
  let overflow: CapacityLedger | null = null;

  function evictRefilled(): boolean {
    for (const [id, ledger] of store) {
      if (ledger.available() >= capacity) {
        store.delete(id);
        return true;
      }
    }
    return false;
  }

  return {
    get(sinkId: string): CapacityLedger {
      const existing = store.get(sinkId);
      if (existing) {
        return existing;
      }
      if (store.size >= maxSinks && !evictRefilled()) {
        overflow ??= createCapacityLedger(opts);
        return overflow;
      }
      const ledger = createCapacityLedger(opts);
      store.set(sinkId, ledger);
      return ledger;
    },
    size: () => store.size,
    clear: () => {
      store.clear();
      overflow = null;
    },
  };
}
