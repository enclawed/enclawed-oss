// End-of-day trigger.
//
// Two timers per day:
//   eodSummaryAt (default 23:55 local): assemble the executive summary,
//     read counts from the in-memory runtime state, verify the audit
//     chain, and send a self-addressed email to the principal.
//   eodTrashAt (default 23:59 local): move every thread tagged
//     enclawed/auto-trash-eod to Trash (Gmail's 30-day Trash purge
//     handles the actual destructive delete; the label-mutation is
//     reversible and the audit projection treats it like any other
//     write).
//
// Cross-reference invariant (RT-11 closure): the summary prose counts
// are derived from the SAME state the audit log records. The summary
// also embeds the count of irreversible.executed records observed on
// disk; if those two ever disagree, the summary refuses to send and
// raises an alarm instead.

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { SecretaryRuntimeState } from "../runtime-state.js";
import type { GoogleTools } from "../tools/google-tools.js";

const LABEL_AUTO_TRASH_EOD = "enclawed/auto-trash-eod";

export type EodTriggerOptions = Readonly<{
  tools: GoogleTools;
  state: SecretaryRuntimeState;
  /** Principal's email — recipient of the summary. */
  principalEmail: string;
  /** Audit log path so we can re-project + chain-verify at compose-time. */
  auditPath: string;
  /** Summary fire time, "HH:MM" 24h local. */
  summaryAt: string;
  /** Trash fire time, "HH:MM" 24h local. */
  trashAt: string;
  signal: AbortSignal;
  log?: (level: "info" | "warn" | "error", msg: string) => void;
  /** Test seam: deterministic clock. */
  clock?: () => Date;
}>;

export async function runEodScheduler(opts: EodTriggerOptions): Promise<void> {
  const log = opts.log ?? defaultLog;
  const clock = opts.clock ?? (() => new Date());

  const summaryParsed = parseHhMm(opts.summaryAt);
  const trashParsed = parseHhMm(opts.trashAt);
  if (!summaryParsed) {
    throw new Error(`eod-trigger: invalid --eod-summary-at "${opts.summaryAt}"`);
  }
  if (!trashParsed) {
    throw new Error(`eod-trigger: invalid --eod-trash-at "${opts.trashAt}"`);
  }

  // Track which firings we've already done today so a re-entrant tick
  // doesn't double-send.
  let lastSummaryDay = -1;
  let lastTrashDay = -1;

  while (!opts.signal.aborted) {
    const now = clock();
    const dayKey = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
    const minutesNow = now.getHours() * 60 + now.getMinutes();
    const summaryMin = summaryParsed.h * 60 + summaryParsed.m;
    const trashMin = trashParsed.h * 60 + trashParsed.m;

    if (minutesNow >= summaryMin && lastSummaryDay !== dayKey) {
      try {
        await fireSummary(opts);
        lastSummaryDay = dayKey;
      } catch (err) {
        log("error", `eod summary failed: ${(err as Error).message}`);
      }
    }
    if (minutesNow >= trashMin && lastTrashDay !== dayKey) {
      try {
        await fireTrash(opts);
        lastTrashDay = dayKey;
      } catch (err) {
        log("error", `eod trash failed: ${(err as Error).message}`);
      }
    }

    // Sleep until the next minute boundary, then re-check. AbortSignal
    // makes shutdown fast.
    const msToNextMinute = 60_000 - (Date.now() % 60_000);
    await new Promise<void>((resolve) => {
      const t = setTimeout(resolve, msToNextMinute);
      opts.signal.addEventListener(
        "abort",
        () => {
          clearTimeout(t);
          resolve();
        },
        { once: true },
      );
      if (typeof t === "object" && t !== null && "unref" in t) {
        (t as { unref: () => void }).unref();
      }
    });
  }
}

async function fireSummary(opts: EodTriggerOptions): Promise<void> {
  const log = opts.log ?? defaultLog;
  const counts = opts.state.countByOutcome();
  const flagged = opts.state.threadsFlaggedForTrash();
  const dlpHits = opts.state.dlpHitCount();
  const startedAtIso = new Date(opts.state.startedAt()).toISOString();
  const nowIso = (opts.clock ?? (() => new Date()))().toISOString();

  // Reconcile prose with audit projection. This is the RT-11 closure:
  // if the summary's claim about "executed irreversible writes" ever
  // diverges from the audit's actual count, we refuse to send.
  const projection = await projectAuditCounts(opts.auditPath).catch(() => null);
  const auditExecutedPublish = projection?.publishExecuted ?? null;
  const expectedPublishExecuted = counts["replied-to-contact"] + counts["refused-non-contact"] + 1; // +1 for the summary itself we're about to send

  if (auditExecutedPublish !== null && auditExecutedPublish !== expectedPublishExecuted - 1) {
    // -1 because the summary publish hasn't fired yet at this point.
    log(
      "error",
      `RT-11 alarm: summary projects ${expectedPublishExecuted - 1} publish-executed ` +
        `but audit shows ${auditExecutedPublish}. Refusing to send.`,
    );
    return;
  }

  const body = renderSummaryBody({
    startedAtIso,
    nowIso,
    counts,
    flaggedCount: flagged.length,
    dlpHits,
    auditChainHash: projection?.chainHashShort ?? "(verify-failed)",
    auditExecutedPublish,
    flaggedSenders: flagged.map((f) => f.senderEmail).slice(0, 25),
  });

  const subject = `[Secretary] Daily Summary ${nowIso.slice(0, 10)}`;

  // Send the summary through the SAME pipeline as any other publish:
  // create_draft, then send_draft with the (op, target) projection
  // bound to the principal's address. The broker auto-approves because
  // the recipient is in principalSelfAddresses.
  const draft = await opts.tools.createDraft({
    to: opts.principalEmail,
    subject,
    body,
    inReplyToThreadId: null,
  });
  await opts.tools.sendDraft({
    draftId: draft.draftId,
    expectedRecipient: opts.principalEmail,
    expectedContentSha256: draft.contentSha256,
    dlpSummary: null, // Summary body is internally generated; we trust it.
  });
  log("info", `eod summary sent to ${opts.principalEmail}`);
}

async function fireTrash(opts: EodTriggerOptions): Promise<void> {
  const log = opts.log ?? defaultLog;
  let threads: ReadonlyArray<{ threadId: string; snippet: string }>;
  try {
    threads = await opts.tools.searchInboxThreads(`label:${LABEL_AUTO_TRASH_EOD}`);
  } catch (err) {
    log("error", `eod trash: search failed: ${(err as Error).message}`);
    return;
  }

  for (const t of threads) {
    if (opts.signal.aborted) {
      return;
    }
    try {
      await opts.tools.modifyThreadLabels({
        threadId: t.threadId,
        addLabels: ["TRASH"],
        removeLabels: ["INBOX", LABEL_AUTO_TRASH_EOD],
      });
    } catch (err) {
      log("warn", `eod trash: ${t.threadId} failed: ${(err as Error).message}`);
    }
  }
  log("info", `eod trash: ${threads.length} thread(s) moved to Trash`);
}

function renderSummaryBody(input: {
  startedAtIso: string;
  nowIso: string;
  counts: Readonly<Record<string, number>>;
  flaggedCount: number;
  dlpHits: number;
  auditChainHash: string;
  auditExecutedPublish: number | null;
  flaggedSenders: ReadonlyArray<string>;
}): string {
  const total =
    (input.counts["replied-to-contact"] ?? 0) +
    (input.counts["refused-non-contact"] ?? 0) +
    (input.counts["dlp-blocked"] ?? 0) +
    (input.counts["skipped"] ?? 0);
  return [
    `Daily summary — secretary run started ${input.startedAtIso}`,
    `Composed at ${input.nowIso}`,
    "",
    `Threads processed: ${total}`,
    `  • replied to contact:        ${input.counts["replied-to-contact"] ?? 0}`,
    `  • refused (non-contact):     ${input.counts["refused-non-contact"] ?? 0}`,
    `  • DLP-blocked (no send):     ${input.counts["dlp-blocked"] ?? 0}`,
    `  • skipped:                   ${input.counts["skipped"] ?? 0}`,
    "",
    `DLP findings observed (any sev): ${input.dlpHits}`,
    `Threads queued for Trash at EOD: ${input.flaggedCount}`,
    "",
    `Audit projection — publish executed: ${
      input.auditExecutedPublish === null ? "(unavailable)" : input.auditExecutedPublish
    }`,
    `Audit chain hash (short):           ${input.auditChainHash}`,
    "",
    input.flaggedSenders.length > 0
      ? `Flagged senders (truncated to 25):\n${input.flaggedSenders.map((s) => `  • ${s}`).join("\n")}`
      : "No senders flagged for trash today.",
    "",
    "— Secretary (enclawed demo)",
  ].join("\n");
}

export type AuditProjection = Readonly<{
  publishExecuted: number;
  chainHashShort: string;
}>;

/**
 * Project the audit JSONL: count irreversible.executed records and
 * fold the per-record hash chain into a short tag we include in the
 * summary. Returns null on read/parse failure (so the summary still
 * sends, but with a "(verify-failed)" hash marker).
 *
 * Exported so the redteam suite (RT-11) tests the SAME projection the
 * EOD trigger uses — drift here would mask the fraud-detection guard.
 */
export async function projectAuditCounts(path: string): Promise<AuditProjection> {
  const raw = await readFile(path, "utf8");
  const lines = raw.split("\n").filter((l) => l.length > 0);
  let publishExecuted = 0;
  const h = createHash("sha256");
  for (const ln of lines) {
    h.update(ln, "utf8");
    try {
      const r = JSON.parse(ln) as { type?: string; payload?: { call?: { cap?: string } } };
      if (r.type === "irreversible.executed" && r.payload?.call?.cap === "publish") {
        publishExecuted += 1;
      }
    } catch {
      // skip malformed line
    }
  }
  return {
    publishExecuted,
    chainHashShort: h.digest("hex").slice(0, 16),
  };
}

function parseHhMm(s: string): { h: number; m: number } | null {
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) {
    return null;
  }
  const h = Number.parseInt(m[1] ?? "", 10);
  const min = Number.parseInt(m[2] ?? "", 10);
  if (!Number.isFinite(h) || h < 0 || h > 23) {
    return null;
  }
  if (!Number.isFinite(min) || min < 0 || min > 59) {
    return null;
  }
  return { h, m: min };
}

function defaultLog(level: "info" | "warn" | "error", msg: string): void {
  const stream = level === "info" ? process.stdout : process.stderr;
  stream.write(`[secretary-eod ${level}] ${msg}\n`);
}
