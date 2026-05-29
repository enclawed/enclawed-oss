// In-memory shared state for one secretary run.
//
// The state is intentionally write-once-per-event: each handler appends a
// record describing what happened, and the EOD summary projects over the
// records to produce the executive summary. This makes the summary
// arithmetic exactly match the audit projection (the same multiset
// equality the paper's biconditional relies on) — so a "claimed 42
// deleted, executed 3" fraud (RT-11) is detected at compose-time, not
// just at verifyChain-time.

export type TriageOutcome =
  | "replied-to-contact"
  | "refused-non-contact"
  | "dlp-blocked"
  | "skipped";

export type ThreadRecord = Readonly<{
  threadId: string;
  senderEmail: string;
  senderIsContact: boolean;
  subjectSummary: string; // length-capped, control-stripped
  outcome: TriageOutcome;
  /** requestId of the create_draft gate dispatch (or null if no draft). */
  draftRequestId: string | null;
  /** requestId of the label-mutation that flagged for trash, if any. */
  flaggedTrashRequestId: string | null;
  /** Highest DLP severity observed on the draft, or null if clean/no draft. */
  maxDlpSeverity: "low" | "medium" | "high" | "critical" | null;
  /** Local-time ISO timestamp of when this thread was processed. */
  processedAt: string;
}>;

export class SecretaryRuntimeState {
  private readonly threads: ThreadRecord[] = [];
  private readonly seenThreadIds = new Set<string>();
  private readonly startedAtMs = Date.now();

  isProcessed(threadId: string): boolean {
    return this.seenThreadIds.has(threadId);
  }

  record(entry: ThreadRecord): void {
    if (this.seenThreadIds.has(entry.threadId)) {
      return;
    }
    this.seenThreadIds.add(entry.threadId);
    this.threads.push(entry);
  }

  threadCount(): number {
    return this.threads.length;
  }

  countByOutcome(): Readonly<Record<TriageOutcome, number>> {
    const out: Record<TriageOutcome, number> = {
      "replied-to-contact": 0,
      "refused-non-contact": 0,
      "dlp-blocked": 0,
      skipped: 0,
    };
    for (const t of this.threads) {
      out[t.outcome] += 1;
    }
    return Object.freeze(out);
  }

  threadsFlaggedForTrash(): ReadonlyArray<ThreadRecord> {
    return Object.freeze(this.threads.filter((t) => t.flaggedTrashRequestId !== null));
  }

  dlpHitCount(): number {
    return this.threads.filter((t) => t.maxDlpSeverity !== null).length;
  }

  snapshot(): ReadonlyArray<ThreadRecord> {
    return Object.freeze([...this.threads]);
  }

  startedAt(): number {
    return this.startedAtMs;
  }
}
