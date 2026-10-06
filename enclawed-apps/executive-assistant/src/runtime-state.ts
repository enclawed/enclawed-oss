// In-memory shared state for one executive assistant run.
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
  /** Non-contact handled under the public-mailbox policy: recorded for
   *  the principal, nothing sent back to the sender. */
  | "non-contact-triaged"
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
  // Per-thread last-processed IMAP UID. A poll's thread summary
  // carries the UID of the newest message in the thread; we mark
  // that uid here after handling so a subsequent poll knows whether
  // a follow-up has arrived (uid' > uid → new content) or whether
  // the search hit is the same content we already handled.
  // Pre-this-design, dedup was a Set<threadId> which conflated
  // "already processed" with "no new content" — that's why
  // multi-message threads stopped getting responses after the first
  // reply.
  private readonly lastUidByThread = new Map<string, number>();
  private readonly recordedThreadIds = new Set<string>();
  private readonly inFlight = new Set<string>();
  private readonly startedAtMs = Date.now();
  /**
   * Per-thread cache of executed tool calls, keyed on a deterministic
   * signature of (name, args). When the LLM tries to re-issue the
   * same call within the same thread (typical pattern: principal's
   * follow-up reply contains the original request in the quoted
   * history → LLM sees it and re-executes), the dispatcher returns
   * the cached result without going through the network/keyring/
   * audit chain again. Limited to read-only tools so the LLM can't
   * dodge a re-confirm on irreversible writes.
   */
  private readonly toolCallCacheByThread = new Map<string, Map<string, unknown>>();

  // Last remote SHA we have already notified the principal about.
  // The update-check tick consults this so the same pending update
  // does not produce a fresh email on every check cycle. In-memory
  // only — after a restart the executive assistant will re-notify once if the
  // update is still pending. That is acceptable: a single duplicate
  // email is far cheaper than persisted state that could go stale
  // against an actually-applied update.
  private lastNotifiedUpdateRemoteRev: string | null = null;

  getLastNotifiedUpdateRemoteRev(): string | null {
    return this.lastNotifiedUpdateRemoteRev;
  }

  markUpdateNotified(remoteRev: string): void {
    this.lastNotifiedUpdateRemoteRev = remoteRev;
  }

  toolCallCacheGet(threadId: string, signature: string): unknown {
    return this.toolCallCacheByThread.get(threadId)?.get(signature);
  }

  toolCallCachePut(threadId: string, signature: string, result: unknown): void {
    let bucket = this.toolCallCacheByThread.get(threadId);
    if (!bucket) {
      bucket = new Map();
      this.toolCallCacheByThread.set(threadId, bucket);
    }
    bucket.set(signature, result);
  }

  isInFlight(threadId: string): boolean {
    return this.inFlight.has(threadId);
  }

  inFlightCount(): number {
    return this.inFlight.size;
  }

  markInFlight(threadId: string): void {
    this.inFlight.add(threadId);
  }

  clearInFlight(threadId: string): void {
    this.inFlight.delete(threadId);
  }

  /** Last UID we've marked seen for the thread, or undefined if never. */
  lastUidSeen(threadId: string): number | undefined {
    return this.lastUidByThread.get(threadId);
  }

  isProcessed(threadId: string, lastUid: number): boolean {
    const seen = this.lastUidByThread.get(threadId);
    if (seen === undefined) {
      return false;
    }
    // If the search returned the SAME or OLDER lastUid we've already
    // handled, the thread has no new content. Strictly less-than
    // would never happen on Gmail (UIDs are monotonically increasing)
    // but the >= check is defensive against UIDVALIDITY changes.
    return lastUid <= seen;
  }

  markSeenAt(threadId: string, lastUid: number): void {
    const prev = this.lastUidByThread.get(threadId) ?? -1;
    if (lastUid > prev) {
      this.lastUidByThread.set(threadId, lastUid);
    }
  }

  record(entry: ThreadRecord): void {
    if (this.recordedThreadIds.has(entry.threadId)) {
      return;
    }
    this.recordedThreadIds.add(entry.threadId);
    this.threads.push(entry);
  }

  threadCount(): number {
    return this.threads.length;
  }

  countByOutcome(): Readonly<Record<TriageOutcome, number>> {
    const out: Record<TriageOutcome, number> = {
      "replied-to-contact": 0,
      "refused-non-contact": 0,
      "non-contact-triaged": 0,
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
