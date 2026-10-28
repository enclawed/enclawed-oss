// Write-ahead record of what a coordinator has signed.
//
// A coordinator that restarts mid-height and forgets its votes could sign a
// different block for a round it already voted in. That is a double-sign, and
// the chain would evict it for it. The guard is written BEFORE the device signs
// and refuses to sign behind or across its own record, and it carries the lock
// so a restart cannot unlock a block the coordinator committed to.

import { readFileSync, renameSync, writeFileSync } from "node:fs";
import type { Block, StatementKind } from "./types.js";

export type SignGuardRecord = {
  height: number;
  round: number;
  kind: StatementKind;
  blockHash: string | null;
  lockedRound: number;
  lockedHash: string | null;
  validRound: number;
  validBlock: Block | null;
};

export interface SignGuardStore {
  load(): SignGuardRecord | null;
  save(record: SignGuardRecord): void;
}

export function memorySignGuardStore(): SignGuardStore & { record: SignGuardRecord | null } {
  const store = {
    record: null as SignGuardRecord | null,
    load: () => store.record,
    save: (r: SignGuardRecord) => {
      store.record = structuredClone(r);
    },
  };
  return store;
}

export function fileSignGuardStore(path: string): SignGuardStore {
  return {
    load() {
      try {
        return JSON.parse(readFileSync(path, "utf8")) as SignGuardRecord;
      } catch {
        return null;
      }
    },
    save(record) {
      // Write then rename, so a crash leaves either the old record or the new one.
      writeFileSync(`${path}.tmp`, JSON.stringify(record));
      renameSync(`${path}.tmp`, path);
    },
  };
}

const KIND_ORDER: Record<StatementKind, number> = {
  proposal: 0,
  prevote: 1,
  precommit: 2,
  final: 3,
};

// A final comes after every round of its height: once signed, nothing more
// may be signed at that height.
function roundOf(s: { round: number; kind: StatementKind }): number {
  return s.kind === "final" ? Number.MAX_SAFE_INTEGER : s.round;
}

function compare(
  a: { height: number; round: number; kind: StatementKind },
  b: { height: number; round: number; kind: StatementKind },
): number {
  return a.height - b.height || roundOf(a) - roundOf(b) || KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
}

export class SignGuard {
  private record: SignGuardRecord | null;

  constructor(private readonly store: SignGuardStore) {
    this.record = store.load();
  }

  get last(): SignGuardRecord | null {
    return this.record;
  }

  /**
   * Records the intent to sign and says whether it is safe. Re-signing the
   * exact same statement is allowed (a restart may re-send it); anything at or
   * behind the last signed slot with a different block is refused.
   */
  admit(
    next: { height: number; round: number; kind: StatementKind; blockHash: string | null },
    lock: Pick<SignGuardRecord, "lockedRound" | "lockedHash" | "validRound" | "validBlock">,
  ): boolean {
    const prev = this.record;
    if (prev) {
      const c = compare(next, prev);
      if (c < 0 || (c === 0 && next.blockHash !== prev.blockHash)) {
        return false;
      }
    }
    this.record = { ...next, ...lock };
    this.store.save(this.record);
    return true;
  }
}
