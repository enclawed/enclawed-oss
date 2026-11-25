// Bounded audit buffer for egress findings. Feeds the base.hardening.audit-log
// surface; kept in-memory and size-capped so a noisy stage cannot exhaust
// memory (CWE-400).

import type { Finding } from "./types.js";

export type AuditRecord = { ts: number; sink: string; finding: Finding };

export type AuditBuffer = {
  /** Record a finding against a sink id. */
  sink(sinkId: string, finding: Finding): void;
  /** Snapshot of retained records (oldest first). */
  records(): readonly AuditRecord[];
  /** Findings retained for a given sink. */
  forSink(sinkId: string): readonly AuditRecord[];
  clear(): void;
};

export function createAuditBuffer(opts?: { maxRecords?: number }): AuditBuffer {
  const maxRecords = opts?.maxRecords ?? 2048;
  const records: AuditRecord[] = [];
  return {
    sink(sinkId: string, finding: Finding): void {
      records.push({ ts: Date.now(), sink: sinkId, finding });
      if (records.length > maxRecords) {
        records.splice(0, records.length - maxRecords);
      }
    },
    records: () => records,
    forSink: (sinkId: string) => records.filter((r) => r.sink === sinkId),
    clear: () => {
      records.length = 0;
    },
  };
}
