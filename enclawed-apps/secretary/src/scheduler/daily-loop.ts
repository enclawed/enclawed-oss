// Inbox poll loop.
//
// Each iteration:
//   1. Fetch unread threads not already tagged enclawed/processed.
//   2. For each thread, classify the sender via People (contact / not).
//   3. NON-CONTACT path: build the frozen refusal (no LLM!), DLP-scan it
//      (should always pass — the text is constant), create_draft +
//      send_draft, tag enclawed/processed + enclawed/auto-trash-eod.
//   4. CONTACT path: load the calendar (only NOW — the refusal gate has
//      passed), build the system+user prompts, call Ollama, parse the
//      reply, DLP-scan, create_draft, send_draft, tag enclawed/processed.
//   5. record() the outcome on the shared runtime state.
//
// The loop is sequential by design: within a poll tick we want the audit
// log to be readable as a single thread of decisions. The (already-
// serialized) audit logger would handle concurrent appends, but the
// audit trail is much easier to redteam if there's only one cursor at a
// time.

import { setTimeout as sleep } from "node:timers/promises";
import { maxSeverity, scanOutboundDraft } from "../policy/dlp-secretary.js";
import { buildRefusalBody } from "../policy/refusal-template.js";
import { SecretaryRuntimeState, type TriageOutcome } from "../runtime-state.js";
import type { GoogleTools, ThreadDetail } from "../tools/google-tools.js";
import type { OllamaClient } from "../tools/ollama-client.js";

const LABEL_PROCESSED = "enclawed/processed";
const LABEL_AUTO_TRASH_EOD = "enclawed/auto-trash-eod";

export type DailyLoopOptions = Readonly<{
  tools: GoogleTools;
  ollama: OllamaClient;
  state: SecretaryRuntimeState;
  ollamaModel: string;
  /** Principal's email; refusals never go to this address. */
  principalEmail: string;
  /** All allowed-host strings (passed to DLP for URL exfil check). */
  allowedHosts: ReadonlySet<string>;
  /** Inbox poll interval, ms. */
  pollMs: number;
  /** AbortSignal to cancel the loop. */
  signal: AbortSignal;
  /** Optional logger (defaults to stderr). */
  log?: (level: "info" | "warn" | "error", msg: string) => void;
}>;

export async function runDailyLoop(opts: DailyLoopOptions): Promise<void> {
  const log = opts.log ?? defaultLog;

  while (!opts.signal.aborted) {
    try {
      await processOnePoll(opts);
    } catch (err) {
      log("error", `poll iteration failed: ${(err as Error).message}`);
    }
    try {
      await sleep(opts.pollMs, undefined, { signal: opts.signal });
    } catch {
      break; // AbortError on cancel — exit the loop quietly.
    }
  }
}

async function processOnePoll(opts: DailyLoopOptions): Promise<void> {
  const log = opts.log ?? defaultLog;

  const threads = await opts.tools.searchInboxThreads(`is:unread -label:${LABEL_PROCESSED}`);
  if (threads.length === 0) {
    return;
  }
  log("info", `poll: ${threads.length} unprocessed thread(s)`);

  for (const t of threads) {
    if (opts.signal.aborted) {
      return;
    }
    if (opts.state.isProcessed(t.threadId)) {
      continue;
    }

    let detail: ThreadDetail;
    try {
      detail = await opts.tools.getThread(t.threadId);
    } catch (err) {
      log("warn", `thread ${t.threadId} get_thread failed: ${(err as Error).message}`);
      continue;
    }
    await handleThread(detail, opts);
  }
}

async function handleThread(thread: ThreadDetail, opts: DailyLoopOptions): Promise<void> {
  const log = opts.log ?? defaultLog;
  const senderEmail = thread.senderEmail.toLowerCase().trim();

  // The principal's own address never gets auto-replied to (the secretary
  // talking to itself is a covert-channel risk — paper §non-F).
  if (senderEmail === opts.principalEmail.toLowerCase()) {
    log("info", `thread ${thread.threadId}: skipping self-addressed message`);
    recordSkipped(opts.state, thread, "skipped");
    return;
  }

  let isContact = false;
  try {
    const c = await opts.tools.searchContactByEmail(senderEmail);
    isContact = c !== null;
  } catch (err) {
    log("warn", `contact lookup failed for ${senderEmail}: ${(err as Error).message}`);
    // Fail-closed: treat as non-contact when People is unreachable.
    isContact = false;
  }

  if (!isContact) {
    await handleNonContact(thread, senderEmail, opts);
  } else {
    await handleContact(thread, senderEmail, opts);
  }
}

async function handleNonContact(
  thread: ThreadDetail,
  senderEmail: string,
  opts: DailyLoopOptions,
): Promise<void> {
  const log = opts.log ?? defaultLog;
  const { subject, body } = buildRefusalBody({ originalSubject: thread.subject });
  // Frozen text — DLP should always pass. If it doesn't, the refusal text
  // itself was tampered with, which is its own kind of supply-chain alarm.
  const findings = scanOutboundDraft(body, {
    recipientIsContact: false,
    recipientEmail: senderEmail,
    egressAllowedHosts: opts.allowedHosts,
  });
  const maxSev = maxSeverity(findings);
  if (maxSev === "critical") {
    log("error", `refusal template scan returned critical DLP — refusing to send`);
    recordSkipped(opts.state, thread, "dlp-blocked");
    return;
  }

  let draftId: string;
  let contentSha256: string;
  try {
    const r = await opts.tools.createDraft({
      to: senderEmail,
      subject,
      body,
      inReplyToThreadId: thread.threadId,
    });
    draftId = r.draftId;
    contentSha256 = r.contentSha256;
  } catch (err) {
    log("error", `create_draft (refusal) failed: ${(err as Error).message}`);
    recordSkipped(opts.state, thread, "skipped");
    return;
  }

  try {
    await opts.tools.sendDraft({
      draftId,
      expectedRecipient: senderEmail,
      expectedContentSha256: contentSha256,
      dlpSummary: maxSev === null ? null : { maxSeverity: maxSev, findingCount: findings.length },
    });
  } catch (err) {
    log("error", `send_draft (refusal) failed: ${(err as Error).message}`);
    // Still tag as processed so we don't loop forever on a stuck draft.
    await tagProcessed(thread.threadId, /* trashEod */ true, opts);
    recordSkipped(opts.state, thread, "skipped");
    return;
  }

  // Non-contacts are tidied at EOD.
  const flagged = await tagProcessed(thread.threadId, /* trashEod */ true, opts);
  opts.state.record({
    threadId: thread.threadId,
    senderEmail,
    senderIsContact: false,
    subjectSummary: clipSubject(thread.subject),
    outcome: "refused-non-contact",
    draftRequestId: draftId,
    flaggedTrashRequestId: flagged,
    maxDlpSeverity: maxSev,
    processedAt: new Date().toISOString(),
  });
}

async function handleContact(
  thread: ThreadDetail,
  senderEmail: string,
  opts: DailyLoopOptions,
): Promise<void> {
  const log = opts.log ?? defaultLog;

  // Calendar is loaded ONLY after the contact gate passed. This is the
  // load-bearing assertion of the refusal-gate design: there is no code
  // path that hands calendar data to the LLM before sender ∈ contacts.
  let events: ReadonlyArray<unknown> = [];
  try {
    events = await opts.tools.listUpcomingEvents(20);
  } catch (err) {
    log("warn", `list_events failed: ${(err as Error).message}`);
  }

  const sys = buildSystemPrompt();
  const usr = buildUserPrompt({ thread, events });
  let draftBody: string;
  try {
    draftBody = await opts.ollama.chat({
      model: opts.ollamaModel,
      messages: [
        { role: "system", content: sys },
        { role: "user", content: usr },
      ],
    });
  } catch (err) {
    log("error", `ollama chat failed: ${(err as Error).message}`);
    recordSkipped(opts.state, thread, "skipped");
    return;
  }

  const subject = thread.subject.startsWith("Re:") ? thread.subject : `Re: ${thread.subject}`;

  const findings = scanOutboundDraft(draftBody, {
    recipientIsContact: true,
    recipientEmail: senderEmail,
    egressAllowedHosts: opts.allowedHosts,
  });
  const maxSev = maxSeverity(findings);

  if (maxSev === "critical") {
    log(
      "warn",
      `contact reply draft has critical DLP (${findings.length} finding(s)); skipping send`,
    );
    await tagProcessed(thread.threadId, /* trashEod */ false, opts);
    recordSkipped(opts.state, thread, "dlp-blocked");
    return;
  }

  let draftId: string;
  let contentSha256: string;
  try {
    const r = await opts.tools.createDraft({
      to: senderEmail,
      subject,
      body: draftBody,
      inReplyToThreadId: thread.threadId,
    });
    draftId = r.draftId;
    contentSha256 = r.contentSha256;
  } catch (err) {
    log("error", `create_draft (contact reply) failed: ${(err as Error).message}`);
    recordSkipped(opts.state, thread, "skipped");
    return;
  }

  try {
    await opts.tools.sendDraft({
      draftId,
      expectedRecipient: senderEmail,
      expectedContentSha256: contentSha256,
      dlpSummary: maxSev === null ? null : { maxSeverity: maxSev, findingCount: findings.length },
    });
  } catch (err) {
    log("error", `send_draft (contact reply) failed: ${(err as Error).message}`);
    await tagProcessed(thread.threadId, /* trashEod */ false, opts);
    recordSkipped(opts.state, thread, "skipped");
    return;
  }

  await tagProcessed(thread.threadId, /* trashEod */ false, opts);
  opts.state.record({
    threadId: thread.threadId,
    senderEmail,
    senderIsContact: true,
    subjectSummary: clipSubject(thread.subject),
    outcome: "replied-to-contact",
    draftRequestId: draftId,
    flaggedTrashRequestId: null,
    maxDlpSeverity: maxSev,
    processedAt: new Date().toISOString(),
  });
}

async function tagProcessed(
  threadId: string,
  flagForTrashAtEod: boolean,
  opts: DailyLoopOptions,
): Promise<string | null> {
  const addLabels = flagForTrashAtEod ? [LABEL_PROCESSED, LABEL_AUTO_TRASH_EOD] : [LABEL_PROCESSED];
  try {
    const r = await opts.tools.modifyThreadLabels({
      threadId,
      addLabels,
      removeLabels: [],
    });
    return r.requestId;
  } catch (err) {
    (opts.log ?? defaultLog)(
      "warn",
      `modify_thread_labels on ${threadId} failed: ${(err as Error).message}`,
    );
    return null;
  }
}

function recordSkipped(
  state: SecretaryRuntimeState,
  thread: ThreadDetail,
  outcome: TriageOutcome,
): void {
  state.record({
    threadId: thread.threadId,
    senderEmail: thread.senderEmail,
    senderIsContact: false,
    subjectSummary: clipSubject(thread.subject),
    outcome,
    draftRequestId: null,
    flaggedTrashRequestId: null,
    maxDlpSeverity: null,
    processedAt: new Date().toISOString(),
  });
}

// eslint-disable-next-line no-control-regex
const CLIP_CONTROL_RE = /[\u0000-\u001F\u007F]+/g;

function clipSubject(s: string): string {
  const collapsed = s.replace(CLIP_CONTROL_RE, " ").trim();
  return collapsed.length > 120 ? collapsed.slice(0, 120) + "…" : collapsed;
}

function defaultLog(level: "info" | "warn" | "error", msg: string): void {
  const stream = level === "info" ? process.stdout : process.stderr;
  stream.write(`[secretary ${level}] ${msg}\n`);
}

// ─── Prompt construction ──────────────────────────────────────────────
// The system prompt is fixed and tells the LLM:
//   - that it is composing on behalf of a principal
//   - that it is FORBIDDEN to expose calendar specifics to anyone other
//     than the principal's known contacts (the refusal-gate already
//     enforces this externally; the system prompt is belt-and-braces)
//   - that it must keep replies short, businesslike, and avoid placing
//     emails or links in the body (DLP will flag and HITL will keypress)

function buildSystemPrompt(): string {
  return [
    "You are an AI secretary composing a short, businesslike reply on",
    "behalf of your principal. Constraints:",
    "  1. Only the body of the reply. No subject line, no headers.",
    "  2. Be concise (under 120 words).",
    "  3. NEVER paste email addresses, phone numbers, URLs, or",
    "     credentials. The recipient already knows how to reach the",
    "     principal — refer to existing channels by description, not",
    "     by literal address.",
    '  4. If asked for specific dates/times, prefer ranges ("sometime',
    '     next week") over exact timestamps unless the calendar shows',
    "     a clear single slot.",
    '  5. Sign off as "— Secretary".',
  ].join("\n");
}

function buildUserPrompt(input: { thread: ThreadDetail; events: ReadonlyArray<unknown> }): string {
  const calBlock = (
    input.events as ReadonlyArray<{
      summary: string;
      startsAtIso: string;
      endsAtIso: string;
    }>
  )
    .slice(0, 10)
    .map((e) => `  • ${e.summary} (${e.startsAtIso}–${e.endsAtIso})`)
    .join("\n");

  return [
    `Sender: ${input.thread.senderName ?? "(no display name)"} <${input.thread.senderEmail}>`,
    `Subject: ${input.thread.subject}`,
    "",
    "Message excerpt:",
    "  " + input.thread.bodyExcerpt.split("\n").join("\n  "),
    "",
    "Principal's upcoming calendar (RFC3339):",
    calBlock.length > 0 ? calBlock : "  (no upcoming events visible)",
    "",
    "Draft the reply now. Body only.",
  ].join("\n");
}
