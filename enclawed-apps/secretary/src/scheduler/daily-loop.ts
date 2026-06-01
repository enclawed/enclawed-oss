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
import { logTimestamp } from "../log-timestamp.js";
import { maxSeverity, scanOutboundDraft } from "../policy/dlp-secretary.js";
import { buildRefusalBody } from "../policy/refusal-template.js";
import { SecretaryRuntimeState, type TriageOutcome } from "../runtime-state.js";
import type { CalendarEvent, GoogleTools, ThreadDetail } from "../tools/google-tools.js";
import type {
  OllamaClient,
  OllamaMessage,
  OllamaToolCall,
  OllamaToolSchema,
} from "../tools/ollama-client.js";
import { extractDatetimeCandidates, renderDatetimeCandidates } from "./datetime-extract.js";

const LABEL_PROCESSED = "enclawed/processed";
const LABEL_AUTO_TRASH_EOD = "enclawed/auto-trash-eod";
// HITL request/response emails the broker sends to and receives from
// the principal. The daily loop skips anything tagged with this label
// so the secretary doesn't try to refuse / reply to / schedule from
// its own approval traffic.
const LABEL_HITL = "enclawed/hitl";
// Subject prefix the email HITL prompt uses. The daily loop also
// secondary-filters on this so even an un-labelled HITL message (label
// failed to STORE on a non-Gmail provider) is still skipped.
const HITL_SUBJECT_PREFIX_LOWER = "enclawed hitl";

export type DailyLoopOptions = Readonly<{
  tools: GoogleTools;
  ollama: OllamaClient;
  state: SecretaryRuntimeState;
  ollamaModel: string;
  /**
   * Mailbox identity — the IMAP/SMTP login (e.g. testenclawed@gmail.com).
   * Senders matching this address are the SECRETARY itself emailing
   * itself; those threads are skipped to avoid an inference loop.
   * Variable name kept as `principalEmail` for backwards-compat with
   * call sites; the value is the mailbox.
   */
  principalEmail: string;
  /**
   * Set of addresses to treat as the OPERATOR'S OWN identity for the
   * contact-classification gate. Always includes the mailbox identity
   * (so self-loops still skip). When the operator's HITL reply-from
   * address (the real human principal) differs from the mailbox, it's
   * also in this set — and a sender matching it is routed to the
   * contact path (tool-use loop) instead of the non-contact refusal
   * path. This is what makes "I email my own secretary from my
   * personal address asking it to schedule something" work even when
   * that personal address isn't in the mailbox's Google Contacts.
   */
  principalSelfAddresses: ReadonlySet<string>;
  /**
   * Display name the secretary signs replies with and stamps on the
   * From: header. Frozen at install time; never mutated at runtime.
   */
  personaDisplayName: string;
  /**
   * Optional single-sentence persona prompt the principal supplied at
   * install. Injected into the LLM system prompt as the FIRST line of
   * the persona block; the hard constraints (no PII, brief, etc.)
   * always follow and cannot be overridden by this string because
   * they're appended after. Frozen at runtime.
   */
  personaSystemPrompt: string;
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

  // Heartbeat: periodically emit a "still alive, no new mail" line
  // so the operator can tell the difference between "secretary is
  // happily idle" and "secretary has frozen / lost its connection."
  // Cadence chosen so the line lands every ~5 minutes regardless of
  // the operator's --inbox-poll-ms value: at the default 5 s it's
  // every 60 polls, at 60 s it's every 5 polls.
  const heartbeatEverySec = 300;
  const heartbeatEveryPolls = Math.max(1, Math.floor(heartbeatEverySec / (opts.pollMs / 1000)));
  let pollsSinceHeartbeat = heartbeatEveryPolls; // emit one immediately at start
  let pollsSinceActivity = 0;

  while (!opts.signal.aborted) {
    let activity = false;
    try {
      activity = await processOnePoll(opts);
    } catch (err) {
      log("error", `poll iteration failed: ${(err as Error).message}`);
    }
    if (activity) {
      pollsSinceActivity = 0;
    } else {
      pollsSinceActivity += 1;
    }
    pollsSinceHeartbeat += 1;
    if (pollsSinceHeartbeat >= heartbeatEveryPolls) {
      log(
        "info",
        `heartbeat: polled inbox ${pollsSinceActivity} time(s) since last activity; still listening`,
      );
      pollsSinceHeartbeat = 0;
    }
    try {
      await sleep(opts.pollMs, undefined, { signal: opts.signal });
    } catch {
      break; // AbortError on cancel — exit the loop quietly.
    }
  }
}

async function processOnePoll(opts: DailyLoopOptions): Promise<boolean> {
  const log = opts.log ?? defaultLog;

  // Search filter intentionally excludes only HITL chatter; the
  // older `-label:${LABEL_PROCESSED}` filter blocked follow-up
  // messages because Gmail labels are thread-level, so a contact's
  // reply in an already-processed thread inherited the processed
  // label and never came back through search. We now rely on \Seen
  // (set via mark_thread_seen below) as the cross-poll dedup —
  // \Seen is per-message, so Gmail re-marks the thread unread when
  // a follow-up lands and it returns to us exactly once per new
  // message.
  const threads = await opts.tools.searchInboxThreads(`is:unread -label:${LABEL_HITL}`);
  if (threads.length === 0) {
    return false;
  }
  // In-memory dedup is now keyed on (threadId, lastUid): same thread
  // with a higher UID = new content arrived, process it again. A
  // bridge built before the lastUid field was added returns 0,
  // which collapses to the old behavior (skip if seen, regardless
  // of any new content).
  const fresh = threads.filter((t) => !opts.state.isProcessed(t.threadId, t.lastUid));
  if (fresh.length === 0) {
    return false;
  }
  log("info", `poll: ${fresh.length} unprocessed thread(s)`);

  for (const t of fresh) {
    if (opts.signal.aborted) {
      return true;
    }

    let detail: ThreadDetail;
    try {
      detail = await opts.tools.getThread(t.threadId);
    } catch (err) {
      log("warn", `thread ${t.threadId} get_thread failed: ${(err as Error).message}`);
      continue;
    }
    await handleThread(detail, opts);
    // Update the in-memory dedup map regardless of outcome — even a
    // skipped / DLP-blocked thread shouldn't be re-handled on next
    // poll unless a NEW message arrives (higher lastUid).
    opts.state.markSeenAt(t.threadId, t.lastUid);
    // STORE \Seen on every message in the thread so the same content
    // doesn't come back through next poll's `is:unread`. Failure here
    // is non-fatal — the in-memory dedup catches it for the rest of
    // this process lifetime; only a restart between fail-and-now
    // would surface as a duplicate reply, which is acceptable given
    // the alternative is silently dropping every follow-up.
    try {
      await opts.tools.markThreadSeen(t.threadId);
    } catch (err) {
      log(
        "warn",
        `mark_thread_seen failed for ${t.threadId} (${(err as Error).message}); ` +
          `follow-ups will still work via in-memory dedup until restart`,
      );
    }
  }
  return true;
}

async function handleThread(thread: ThreadDetail, opts: DailyLoopOptions): Promise<void> {
  const log = opts.log ?? defaultLog;

  // Secondary filter on HITL traffic by subject prefix — the IMAP label
  // STORE used by the email-HITL prompt is a Gmail extension and is a
  // no-op on Fastmail / iCloud / Dovecot. The subject prefix is set by
  // the prompt builder itself and is therefore tamper-evident in the
  // same sense as a label: only the secretary can produce it, because
  // only the secretary holds the app-specific password used to send.
  //
  // Apply the enclawed/processed label as we leave so the next
  // searchInboxThreads excludes the thread (the in-memory
  // state.isProcessed check guards us within a process lifetime,
  // but a service restart loses that, and the label is what makes
  // exclusion durable).
  if (thread.subject.toLowerCase().includes(HITL_SUBJECT_PREFIX_LOWER)) {
    log("info", `thread ${thread.threadId}: skipping HITL traffic (${thread.subject})`);
    await tagProcessed(thread.threadId, /* trashEod */ false, opts);
    recordSkipped(opts.state, thread, "skipped");
    return;
  }

  const senderEmail = thread.senderEmail.toLowerCase().trim();

  // The principal's own address never gets auto-replied to (the secretary
  // talking to itself is a covert-channel risk — paper §non-F).
  // Same label-on-skip logic as the HITL filter above: without
  // tagProcessed here, every poll would re-discover the same self-
  // addressed thread and log "1 unprocessed thread(s)" indefinitely.
  if (senderEmail === opts.principalEmail.toLowerCase()) {
    log("info", `thread ${thread.threadId}: skipping self-addressed message`);
    await tagProcessed(thread.threadId, /* trashEod */ false, opts);
    recordSkipped(opts.state, thread, "skipped");
    return;
  }

  // PRINCIPAL bypass: if the sender is the operator's own personal
  // identity (the HITL reply-from address baked into the broker's
  // principalSelfAddresses), route DIRECTLY to the contact path —
  // skip the CardDAV lookup entirely. The principal's address is
  // almost never in the SECRETARY mailbox's contacts (you don't add
  // yourself to the contacts of your own service account), and
  // without this bypass the secretary refuses every "schedule X for
  // me" email the operator sends to their own bot. Same set the
  // broker uses for the principal-authored auto-approve carve-out.
  if (opts.principalSelfAddresses.has(senderEmail)) {
    log("info", `thread ${thread.threadId}: sender is principal — routing to contact path`);
    await handleContact(thread, senderEmail, opts);
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
      originSenderEmail: senderEmail,
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
  let events: ReadonlyArray<CalendarEvent> = [];
  try {
    events = await opts.tools.listUpcomingEvents(20);
  } catch (err) {
    log("warn", `list_events failed: ${(err as Error).message}`);
  }

  // STAGE 1: tool-use loop. The LLM gets the calendar tools and runs
  // until it stops calling them (or hits MAX_ITERS). We DO NOT use its
  // free-form text output as the reply — local models hallucinate
  // "done, scheduled it" while never calling the tool. Instead the
  // loop's only job is action dispatch; the reply is composed in
  // STAGE 2 below with explicit knowledge of what was executed.
  const sys = buildToolUseSystemPrompt({
    displayName: opts.personaDisplayName,
    personaPrompt: opts.personaSystemPrompt,
  });
  const usr = buildToolUseUserPrompt({ thread, events });
  const messages: OllamaMessage[] = [
    { role: "system", content: sys },
    { role: "user", content: usr },
  ];
  const executed: ExecutedCalendarAction[] = [];
  const failedToolCalls: { name: string; reason: string }[] = [];
  const MAX_ITERS = 4;
  for (let iter = 0; iter < MAX_ITERS; iter++) {
    let resp;
    try {
      resp = await opts.ollama.chatWithTools({
        model: opts.ollamaModel,
        messages,
        tools: CALENDAR_TOOLS,
        temperature: 0,
      });
    } catch (err) {
      log("error", `ollama chatWithTools failed (iter ${iter}): ${(err as Error).message}`);
      break;
    }
    log(
      "info",
      `tool-use iter=${iter} toolCalls=${resp.toolCalls.length}${
        resp.toolCalls.length > 0
          ? ` [${resp.toolCalls.map((c) => c.function.name).join(",")}]`
          : ""
      } contentLen=${resp.content.length}`,
    );
    if (resp.toolCalls.length === 0) {
      // Model has nothing more to do — STAGE 1 is done.
      break;
    }
    messages.push({
      role: "assistant",
      content: resp.content,
      tool_calls: resp.toolCalls,
    });
    // Bulk-delete detection: when the LLM emits more than one
    // delete_calendar_event call in this turn, mark each as
    // bulkDelete=true so the broker keypresses every one. This is
    // the "clear my Sunday appointments" class — under the principal
    // carve-out, single deletes auto-approve, but a multi-event
    // dispatch is the one delete pattern the operator wants surfaced.
    const deleteCount = resp.toolCalls.filter(
      (c) => c.function.name === "delete_calendar_event",
    ).length;
    const bulkDelete = deleteCount > 1;
    for (const call of resp.toolCalls) {
      const outcome = await dispatchCalendarToolCall({
        call,
        opts,
        thread,
        senderEmail,
        events,
        bulkDelete,
        log,
      });
      if (outcome.kind === "executed" && outcome.action) {
        executed.push(outcome.action);
      } else {
        const reason =
          typeof outcome.result.reason === "string" ? outcome.result.reason : "unknown failure";
        failedToolCalls.push({ name: call.function.name, reason });
      }
      messages.push({
        role: "tool",
        name: call.function.name,
        content: JSON.stringify(outcome.result),
      });
    }
  }

  // STAGE 2: compose the reply. SEPARATE call with NO tools, given an
  // EXPLICIT "actions executed" block. The model is constrained to
  // acknowledge ONLY actions that actually succeeded — anything else is
  // a hallucination the system prompt forbids.
  let draftBody = "";
  log("info", `reply composition: executed=${executed.length} failed=${failedToolCalls.length}`);
  try {
    const replySys = buildReplySystemPrompt({
      displayName: opts.personaDisplayName,
      personaPrompt: opts.personaSystemPrompt,
    });
    const replyUsr = buildReplyUserPrompt({
      thread,
      events,
      executed,
      failedToolCalls,
    });
    draftBody = (
      await opts.ollama.chat({
        model: opts.ollamaModel,
        messages: [
          { role: "system", content: replySys },
          { role: "user", content: replyUsr },
        ],
        temperature: 0.2,
      })
    ).trim();
  } catch (err) {
    log("error", `reply composition failed: ${(err as Error).message}`);
  }
  if (!draftBody) {
    log("warn", "no draft body produced; skipping reply");
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

  // Standard email reply convention: include the original message,
  // line-prefixed with "> ", below the secretary's reply. Only for
  // the contact path (sender is in the allowlist or is the principal)
  // — the non-contact refusal template stays terse on purpose.
  const replyWithQuote = appendQuotedOriginal(draftBody, thread);

  let draftId: string;
  let contentSha256: string;
  try {
    const r = await opts.tools.createDraft({
      to: senderEmail,
      subject,
      body: replyWithQuote,
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
      originSenderEmail: senderEmail,
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
  stream.write(`${logTimestamp()} [secretary ${level}] ${msg}\n`);
}

// Standard email-reply quoting: the secretary's reply is followed by
// a blank line, an attribution line, and the original message body
// with each line prefixed by "> ". Mail clients display this folded
// (collapsed by default; expandable with one click) so the
// recipient sees a clean reply at the top but can still inspect the
// original. We do NOT DLP-scan the quoted body — it's the contact's
// own words being echoed back to them in the same thread, not new
// content authored by the secretary.
function appendQuotedOriginal(reply: string, thread: ThreadDetail): string {
  const senderRef = thread.senderName
    ? `${thread.senderName} <${thread.senderEmail}>`
    : `<${thread.senderEmail}>`;
  const original = thread.bodyExcerpt.trim();
  if (original.length === 0) {
    return reply;
  }
  const quoted = original
    .split(/\r?\n/)
    .map((line) => (line.length > 0 ? `> ${line}` : ">"))
    .join("\n");
  return [reply.trimEnd(), "", `On ${new Date().toUTCString()}, ${senderRef} wrote:`, quoted].join(
    "\n",
  );
}

// Internal action record kept across the tool-use loop's iterations.
// Each successful tool call appends one. Used only for logging / state
// recording — the LLM's view of executed actions is its own tool_call
// + tool_result conversation history.
type ExecutedCalendarAction =
  | Readonly<{ kind: "created"; summary: string; startsAtIso: string; endsAtIso: string }>
  | Readonly<{ kind: "updated"; summary: string; startsAtIso: string; endsAtIso: string }>
  | Readonly<{ kind: "deleted"; eventId: string }>;

// ─── Tool-use plumbing ────────────────────────────────────────────────
// Tool schemas + dispatcher for the contact-reply tool-use loop. The
// model decides when to call these while composing the reply; every
// call is broker-gated through GoogleTools and audited via the gate's
// irreversible.* projection. This replaces the standalone calendar-
// intent extractor, which had to guess what the user wanted from a
// JSON output the model couldn't reliably produce.

const CALENDAR_TOOLS: ReadonlyArray<OllamaToolSchema> = Object.freeze([
  Object.freeze({
    type: "function" as const,
    function: Object.freeze({
      name: "create_calendar_event",
      description:
        "Create a new event on the principal's calendar. Use ONLY when " +
        "the inbound email proposes a concrete date and time with a " +
        "duration the principal would accept. Do NOT call with vague " +
        '("sometime next week") requests — reply asking for a specific ' +
        "slot instead.",
      parameters: {
        type: "object",
        properties: {
          summary: {
            type: "string",
            description: 'Short event title, e.g. "Coffee with Jane"',
          },
          startsAtIso: {
            type: "string",
            description:
              "RFC 3339 start timestamp in UTC, MUST end with Z " +
              '(example: "2026-06-01T15:00:00Z"). NEVER compute the ' +
              "date yourself. The user prompt has a block titled " +
              '"Detected datetimes in the email" with one bullet per ' +
              "parsed reference, showing the verbatim source text " +
              "and the ISO timestamp the parser resolved it to. COPY " +
              "one of those ISO values exactly. If no detected " +
              "candidate matches what the email is asking about, do " +
              "NOT call this tool — reply asking for a specific time.",
          },
          endsAtIso: {
            type: "string",
            description:
              "RFC 3339 end timestamp in UTC. When the detected " +
              "datetime in the user prompt shows an arrow (→) " +
              "followed by a second ISO, copy that one verbatim — " +
              "the email gave a range and the parser resolved both " +
              "ends. When no end was detected, default to start + 30 " +
              "minutes — DO NOT invent a multi-hour block. If the " +
              "email is ambiguous about duration, do NOT call this " +
              "tool.",
          },
          attendees: {
            type: "array",
            items: { type: "string" },
            description:
              "Email addresses that already appear in the thread headers " +
              "or body. Never invent new attendees.",
          },
          description: {
            type: "string",
            description:
              "Optional one-sentence agenda. NO email addresses, phone " +
              "numbers, URLs, or credentials.",
          },
        },
        required: ["summary", "startsAtIso", "endsAtIso"],
      },
    }),
  }),
  Object.freeze({
    type: "function" as const,
    function: Object.freeze({
      name: "update_calendar_event",
      description:
        "Move or rename an EXISTING event on the principal's calendar. " +
        "eventId MUST be one of the UIDs listed in the user prompt's " +
        '"existing upcoming events" block — never invent a UID.',
      parameters: {
        type: "object",
        properties: {
          eventId: {
            type: "string",
            description: "UID from the existing-upcoming-events list",
          },
          summary: { type: "string" },
          startsAtIso: { type: "string" },
          endsAtIso: { type: "string" },
          attendees: { type: "array", items: { type: "string" } },
          description: { type: "string" },
        },
        required: ["eventId", "summary", "startsAtIso", "endsAtIso"],
      },
    }),
  }),
  Object.freeze({
    type: "function" as const,
    function: Object.freeze({
      name: "delete_calendar_event",
      description:
        "Cancel an EXISTING event on the principal's calendar. eventId " +
        "MUST be one of the UIDs listed in the user prompt. The broker " +
        "WILL prompt the operator for explicit approval before this " +
        "executes — even when origin == principal — because deletion " +
        "is catastrophic.",
      parameters: {
        type: "object",
        properties: {
          eventId: { type: "string" },
        },
        required: ["eventId"],
      },
    }),
  }),
]);

type ToolDispatchOutcome = Readonly<{
  kind: "executed" | "rejected" | "error";
  /** Set on kind="executed" — fed back into the reply prompt context. */
  action?: ExecutedCalendarAction;
  /**
   * Object the model sees as the tool's result. Stringified for the
   * "tool" message in the conversation. Includes ok/error/reason so the
   * model can recover or acknowledge.
   */
  result: Record<string, unknown>;
}>;

async function dispatchCalendarToolCall(args: {
  call: OllamaToolCall;
  opts: DailyLoopOptions;
  thread: ThreadDetail;
  senderEmail: string;
  /**
   * Upcoming events visible to the LLM, used to enrich delete
   * dispatches with the event's human-readable summary + time so the
   * HITL email reads "DELETE 'Meeting with X' (Tue 15:00 UTC)" instead
   * of just a UUID. The LLM picked the eventId from this list in the
   * first place; we look it back up here.
   */
  events: ReadonlyArray<CalendarEvent>;
  /**
   * True when the LLM emitted more than one delete_calendar_event in
   * this turn. Pulled up to the per-turn level (the broker only sees
   * one call at a time) so a "clear my Sunday" dispatch sets the flag
   * on EVERY delete and the broker keypresses each.
   */
  bulkDelete: boolean;
  log: (level: "info" | "warn" | "error", msg: string) => void;
}): Promise<ToolDispatchOutcome> {
  const { call, opts, senderEmail, events, bulkDelete, log } = args;
  const name = call.function.name;
  const a = call.function.arguments;

  // The reply LLM authored these args, so a DLP scan over the text the
  // model proposed (summary + description) keeps the same F5 boundary
  // we have on outbound email bodies. Critical DLP → reject; medium /
  // high → keypress (the broker handles).
  const dlpBodyForScan =
    name === "delete_calendar_event"
      ? ""
      : `${getString(a.summary)}\n\n${getString(a.description)}`;
  const findings = scanOutboundDraft(dlpBodyForScan, {
    recipientIsContact: true,
    recipientEmail: senderEmail,
    egressAllowedHosts: opts.allowedHosts,
  });
  const maxSev = maxSeverity(findings);
  if (maxSev === "critical") {
    log("warn", `${name} rejected: critical DLP (${findings.length} finding(s))`);
    return Object.freeze({
      kind: "rejected",
      result: Object.freeze({
        ok: false,
        reason: `rejected: critical DLP (${findings.length} finding(s))`,
      }),
    });
  }
  const dlpSummary =
    maxSev === null ? null : { maxSeverity: maxSev, findingCount: findings.length };

  try {
    if (name === "create_calendar_event") {
      const summary = getString(a.summary);
      const startsAtIso = getString(a.startsAtIso);
      const endsAtIso = getString(a.endsAtIso);
      if (!summary || !startsAtIso || !endsAtIso) {
        return Object.freeze({
          kind: "error",
          result: Object.freeze({
            ok: false,
            reason: "create_calendar_event requires summary, startsAtIso, endsAtIso",
          }),
        });
      }
      const rangeErr = validateTimeRange(startsAtIso, endsAtIso);
      if (rangeErr) {
        log("warn", `tool: create_calendar_event rejected — ${rangeErr}`);
        return Object.freeze({
          kind: "error",
          result: Object.freeze({ ok: false, reason: rangeErr }),
        });
      }
      const attendees = getStringArray(a.attendees);
      const description = getString(a.description);
      const r = await opts.tools.createEvent({
        summary,
        startsAtIso,
        endsAtIso,
        ...(description ? { description } : {}),
        ...(attendees.length > 0 ? { attendees } : {}),
        dlpSummary,
        originSenderEmail: senderEmail,
      });
      log("info", `tool: create_calendar_event ok eventId=${r.eventId}`);
      return Object.freeze({
        kind: "executed",
        action: Object.freeze({
          kind: "created" as const,
          summary,
          startsAtIso,
          endsAtIso,
        }),
        result: Object.freeze({ ok: true, eventId: r.eventId }),
      });
    }
    if (name === "update_calendar_event") {
      const eventId = getString(a.eventId);
      const summary = getString(a.summary);
      const startsAtIso = getString(a.startsAtIso);
      const endsAtIso = getString(a.endsAtIso);
      if (!eventId || !summary || !startsAtIso || !endsAtIso) {
        return Object.freeze({
          kind: "error",
          result: Object.freeze({
            ok: false,
            reason: "update_calendar_event requires eventId, summary, startsAtIso, endsAtIso",
          }),
        });
      }
      const rangeErr = validateTimeRange(startsAtIso, endsAtIso);
      if (rangeErr) {
        log("warn", `tool: update_calendar_event rejected — ${rangeErr}`);
        return Object.freeze({
          kind: "error",
          result: Object.freeze({ ok: false, reason: rangeErr }),
        });
      }
      const attendees = getStringArray(a.attendees);
      const description = getString(a.description);
      const r = await opts.tools.updateEvent({
        eventId,
        summary,
        startsAtIso,
        endsAtIso,
        ...(description ? { description } : {}),
        ...(attendees.length > 0 ? { attendees } : {}),
        dlpSummary,
        originSenderEmail: senderEmail,
      });
      log("info", `tool: update_calendar_event ok eventId=${r.eventId}`);
      return Object.freeze({
        kind: "executed",
        action: Object.freeze({
          kind: "updated" as const,
          summary,
          startsAtIso,
          endsAtIso,
        }),
        result: Object.freeze({ ok: true, eventId: r.eventId }),
      });
    }
    if (name === "delete_calendar_event") {
      const eventId = getString(a.eventId);
      if (!eventId) {
        return Object.freeze({
          kind: "error",
          result: Object.freeze({
            ok: false,
            reason: "delete_calendar_event requires eventId",
          }),
        });
      }
      // Look up the event's human-readable details from the upcoming-
      // events list (the LLM chose this UID FROM that list, so it's
      // almost always present). Passing summary + start + end through
      // call.args lets the HITL email body show what's actually being
      // deleted instead of a bare UUID.
      const linked = events.find((e) => e.eventId === eventId);
      await opts.tools.deleteEvent({
        eventId,
        dlpSummary,
        originSenderEmail: senderEmail,
        ...(linked
          ? {
              linkedSummary: linked.summary,
              linkedStartsAtIso: linked.startsAtIso,
              linkedEndsAtIso: linked.endsAtIso,
            }
          : {}),
        ...(bulkDelete ? { bulkDelete: true } : {}),
      });
      log("info", `tool: delete_calendar_event ok eventId=${eventId}`);
      return Object.freeze({
        kind: "executed",
        action: Object.freeze({ kind: "deleted" as const, eventId }),
        result: Object.freeze({ ok: true, eventId }),
      });
    }
    log("warn", `tool: unknown tool name "${name}"; no-op`);
    return Object.freeze({
      kind: "error",
      result: Object.freeze({ ok: false, reason: `unknown tool "${name}"` }),
    });
  } catch (err) {
    const reason = (err as Error).message;
    log("warn", `tool: ${name} failed: ${reason}`);
    return Object.freeze({
      kind: "error",
      result: Object.freeze({ ok: false, reason }),
    });
  }
}

function getString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

// Sanity-check the LLM's proposed time range. Rejects values that
// would silently land as "blocked the wrong time" from the operator's
// perspective: timestamps in the past, end before start, or > 60 days
// in the future (anything that far out is almost certainly a year-
// math error, e.g. the model picked 2025 when the principal said
// "next Friday" in 2026). Returns a reason string to feed back into
// the tool result on failure, or "" when the range is acceptable.
function validateTimeRange(startsAtIso: string, endsAtIso: string): string {
  const startMs = Date.parse(startsAtIso);
  const endMs = Date.parse(endsAtIso);
  if (!Number.isFinite(startMs)) {
    return `startsAtIso "${startsAtIso}" is not a valid timestamp`;
  }
  if (!Number.isFinite(endMs)) {
    return `endsAtIso "${endsAtIso}" is not a valid timestamp`;
  }
  if (endMs <= startMs) {
    return `endsAtIso (${endsAtIso}) is not after startsAtIso (${startsAtIso})`;
  }
  const now = Date.now();
  // Tolerate a small backwards drift (5 min) for clock skew but
  // reject anything more than that — the LLM is probably booking
  // yesterday.
  if (startMs < now - 5 * 60_000) {
    return (
      `startsAtIso ${startsAtIso} is in the past (now is ${new Date(now).toISOString()}); ` +
      `relative dates must resolve forward — recheck the date anchors block`
    );
  }
  const MAX_FORWARD_DAYS = 60;
  if (startMs > now + MAX_FORWARD_DAYS * 86_400_000) {
    return (
      `startsAtIso ${startsAtIso} is more than ${MAX_FORWARD_DAYS} days out; ` +
      `likely a year-math error — recheck the date anchors block`
    );
  }
  // Max duration sanity: anything over 14 days end-to-end is almost
  // certainly a date-math bug.
  if (endMs - startMs > 14 * 86_400_000) {
    return `event duration ${Math.floor((endMs - startMs) / 3_600_000)}h exceeds 14-day sanity cap`;
  }
  return "";
}
function getStringArray(v: unknown): string[] {
  return Array.isArray(v)
    ? v
        .filter((x): x is string => typeof x === "string" && x.includes("@"))
        .map((x) => x.toLowerCase().trim())
    : [];
}

function buildToolUseSystemPrompt(persona: { displayName: string; personaPrompt: string }): string {
  const personaBlock = persona.personaPrompt.trim();
  return [
    `You are ${persona.displayName}, an AI secretary composing a short,`,
    "businesslike reply on behalf of your principal.",
    ...(personaBlock.length > 0 ? ["", "Persona:", `  ${personaBlock}`] : []),
    "",
    "TOOLS YOU CAN CALL:",
    "  create_calendar_event(summary, startsAtIso, endsAtIso, attendees?, description?)",
    "  update_calendar_event(eventId, summary, startsAtIso, endsAtIso, attendees?, description?)",
    "  delete_calendar_event(eventId)",
    "",
    "WHEN TO CALL: any inbound email that proposes a SPECIFIC date+time+",
    "duration MUST trigger create_calendar_event before you reply. Examples",
    'of triggering language: "can we meet Tuesday at 3pm for 30 min",',
    '"block 9–10am Friday", "schedule a call 2026-05-30 15:00 UTC for one',
    'hour". When triggered, FIRST emit a tool_call, THEN compose the reply',
    "in the next turn after seeing the tool result.",
    "",
    'WHEN NOT TO CALL: vague language with no concrete slot ("sometime',
    'next week", "let me know what works", "I\'ll send a calendar invite").',
    "In that case reply asking for a specific time.",
    "",
    "Hard constraints (always apply):",
    "  1. The reply you emit on a turn with NO tool_calls is the body",
    "     the recipient will see. No subject line, no headers.",
    "  2. Be concise (under 120 words per language block).",
    "  3. Reply LANGUAGE: write your primary reply in the SAME language",
    "     the inbound email was written in. If that language is NOT",
    "     English, then after your primary reply add a separator of",
    "     exactly five dashes (-----), a line reading",
    '     "English translation:", and the same reply translated to',
    "     English. If the inbound is English, emit only the English",
    "     block. Do not mix languages within a single block.",
    "  4. Tool-call ARGUMENTS (event summary, description) are ALWAYS",
    "     in English regardless of the inbound language, so the",
    "     principal's calendar entries stay consistent.",
    "  5. NEVER paste email addresses, phone numbers, URLs, or",
    "     credentials. The recipient already knows how to reach the",
    "     principal.",
    "  6. Only ACKNOWLEDGE actions whose tool calls returned ok=true",
    "     in this conversation history. Never claim a calendar change",
    "     unless a tool result with ok=true appears above this turn.",
    "  7. If a tool returned ok=false, mention only that you'll follow",
    "     up — do NOT repeat the reason verbatim and do NOT pretend",
    "     success.",
    `  8. Sign off as "— ${persona.displayName}" at the end of EACH`,
    "     language block.",
  ].join("\n");
}

function buildToolUseUserPrompt(input: {
  thread: ThreadDetail;
  events: ReadonlyArray<CalendarEvent>;
}): string {
  const calBlock = input.events
    .slice(0, 20)
    .map((e) => `  • uid=${e.eventId} "${e.summary}" (${e.startsAtIso}–${e.endsAtIso})`)
    .join("\n");

  // Deterministic pre-parse of every date/time reference in the email
  // body. The LLM is told (in the tool schema) to COPY the iso values
  // from this block verbatim instead of trying to compute them — small
  // models routinely mis-add days from a bare reference timestamp, and
  // chrono-node handles "next Monday", "tomorrow at 3pm", "9-11am",
  // multi-language variants, and ranges deterministically.
  const candidates = extractDatetimeCandidates(input.thread.bodyExcerpt, new Date());

  return [
    "Date / time reference (now and the next 7 days):",
    "  " + buildDateAnchors(),
    "",
    "Detected datetimes in the email (PARSED — copy from here, do NOT recompute):",
    renderDatetimeCandidates(candidates),
    "",
    `Sender: ${input.thread.senderName ?? "(no display name)"} <${input.thread.senderEmail}>`,
    `Subject: ${input.thread.subject}`,
    "",
    "Message excerpt:",
    "  " + input.thread.bodyExcerpt.split("\n").join("\n  "),
    "",
    "Principal's existing upcoming events (uid + summary + window):",
    calBlock.length > 0 ? calBlock : "  (none)",
    "",
    "Decide: call a calendar tool ONLY if the email asks for a",
    "concrete, actionable change. Otherwise reply normally.",
  ].join("\n");
}

// Anchor block the LLM uses to resolve relative dates in the inbound
// email. Weekday → date mapping is computed in the principal's local
// TZ — otherwise "next Friday" near a day boundary (23:00 PST = 07:00
// UTC Saturday) would resolve to the wrong day. We still print a UTC
// "Now" line so the model can see the offset between the two.
function buildDateAnchors(): string {
  const now = new Date();
  const tz = process.env.TZ ?? "UTC";
  const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  // Pull weekday + Y/M/D in the local TZ via Intl parts — Date's UTC
  // accessors can't see the operator's TZ at all.
  const localParts = (d: Date) => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      weekday: "long",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(d);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    return {
      weekday: get("weekday"),
      isoDate: `${get("year")}-${get("month")}-${get("day")}`,
    };
  };
  const dayPlus = (n: number) => {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() + n);
    return d;
  };
  const nowLocal = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    dateStyle: "full",
    timeStyle: "short",
    timeZoneName: "short",
  }).format(now);
  const lines: string[] = [];
  lines.push(`Now (local, TZ=${tz}): ${nowLocal}`);
  lines.push(`Now (UTC, for tool args): ${now.toISOString()}`);
  const t0 = localParts(now);
  const t1 = localParts(dayPlus(1));
  const t2 = localParts(dayPlus(2));
  lines.push(`Today:     ${t0.isoDate}  (${t0.weekday})`);
  lines.push(`Tomorrow:  ${t1.isoDate}  (${t1.weekday})`);
  lines.push(`Day after: ${t2.isoDate}  (${t2.weekday})`);
  for (let i = 1; i <= 7; i++) {
    const t = localParts(dayPlus(i));
    lines.push(`${t.weekday.padEnd(9)}  ${t.isoDate}` + (i === 7 ? "  (1 week from now)" : ""));
  }
  if (!weekdays.includes(t0.weekday)) {
    // Sanity guard; Intl returned an unexpected locale string.
    lines.push(`(weekday-format-fallback)`);
  }
  return lines.join("\n  ");
}

// Reply-composition system prompt. Used in STAGE 2 with NO tools.
// The reply LLM here is told to acknowledge ONLY what the runtime
// confirmed actually happened — anything else is hallucination.
function buildReplySystemPrompt(persona: { displayName: string; personaPrompt: string }): string {
  const personaBlock = persona.personaPrompt.trim();
  return [
    `You are ${persona.displayName}, an AI secretary composing a short,`,
    "businesslike reply. You have NO tools on this turn — only compose the",
    "reply text. The user prompt lists what actions the system already",
    "performed; your job is to acknowledge them naturally in the reply.",
    ...(personaBlock.length > 0 ? ["", "Persona:", `  ${personaBlock}`] : []),
    "",
    "Format constraints:",
    "  1. Body only. No subject line, no headers.",
    "  2. Under 120 words per language block.",
    "  3. Language: detect the language the inbound email is written in",
    "     (look at the Message excerpt in the user prompt). Reply in",
    "     THAT language as your primary block. If the detected language",
    "     is NOT English, then AFTER the primary reply add a separator",
    "     line consisting of exactly five dashes (-----), then a line",
    '     reading "English translation:", then the same reply',
    "     translated to English. If the inbound is already English,",
    "     emit only the English block — no separator, no translation.",
    "     Do not mix languages WITHIN a block.",
    "  4. NEVER paste email addresses, phone numbers, URLs, or credentials.",
    `  5. Sign off with "— ${persona.displayName}" on its own line at the`,
    "     end of EACH language block.",
    "",
    "Content rules — you MUST pick the right branch:",
    "",
    '  IF the user prompt lists one or more lines under "Actions executed"',
    "  (each line begins with CREATED, UPDATED, or DELETED):",
    "    - Acknowledge those exact actions naturally in the reply.",
    "    - The times in the Actions-executed block are ALREADY rendered",
    "      in the principal's local TZ (e.g. \"Sunday, May 31, 2026,",
    '      3:00 – 4:00 PM PDT"). Quote them as-is in your reply.',
    '    - Do NOT recompute. Do NOT convert to UTC. Do NOT append "UTC"',
    "      to a time that is already local.",
    "    - Do NOT paste the raw eventId, the URL, or any RFC3339/ISO string.",
    "    - Do NOT hedge — the action HAS landed server-side.",
    '    - Do NOT offer to "confirm" or "check" — it is done.',
    '    - Sample tone: "I\'ve blocked Sunday May 31, 3:00–4:00 PM PDT. — <name>"',
    "",
    '  IF the user prompt shows "Actions executed:" followed by "(none)":',
    "    - You did NOT schedule, move, or cancel anything.",
    '    - Do NOT write "done", "scheduled", "added to your calendar",',
    '      "blocked", or any other claim of completed action.',
    "    - Either ask for a specific date+time the request didn't pin",
    "      down, or say the principal will follow up.",
    "",
    '  IF the user prompt lists anything under "Failed attempts":',
    "    - Acknowledge you tried but hit an issue; do NOT repeat the",
    "      technical reason; say you will follow up.",
  ].join("\n");
}

function buildReplyUserPrompt(input: {
  thread: ThreadDetail;
  events: ReadonlyArray<CalendarEvent>;
  executed: ReadonlyArray<ExecutedCalendarAction>;
  failedToolCalls: ReadonlyArray<{ name: string; reason: string }>;
}): string {
  // Format every iCal timestamp the LLM is about to acknowledge in
  // the operator-configured TZ (Europe/Rome, America/Los_Angeles, ...).
  // The model copies these strings into the reply text more or less
  // verbatim; if we hand it raw UTC it writes "I've blocked Friday
  // 22:00–23:00 UTC" — technically correct, conversationally wrong.
  // We hand it "Friday, May 30 at 3:00 PM PDT" and the reply reads
  // like a person wrote it.
  const tz = process.env.TZ ?? "UTC";
  const executedBlock =
    input.executed.length === 0
      ? "  (none)"
      : input.executed
          .map((a) => {
            if (a.kind === "created") {
              return `  • CREATED "${a.summary}" — ${formatRangeLocal(a.startsAtIso, a.endsAtIso, tz)}`;
            }
            if (a.kind === "updated") {
              return `  • UPDATED "${a.summary}" — ${formatRangeLocal(a.startsAtIso, a.endsAtIso, tz)}`;
            }
            return `  • DELETED event ${a.eventId}`;
          })
          .join("\n");
  const failedBlock =
    input.failedToolCalls.length === 0
      ? "  (none)"
      : input.failedToolCalls.map((f) => `  • ${f.name}: ${f.reason.slice(0, 200)}`).join("\n");
  const nowLocal = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    dateStyle: "full",
    timeStyle: "short",
  }).format(new Date());
  return [
    `Reference time: ${nowLocal} (TZ=${tz})`,
    "",
    `Sender: ${input.thread.senderName ?? "(no display name)"} <${input.thread.senderEmail}>`,
    `Subject: ${input.thread.subject}`,
    "",
    "Message excerpt:",
    "  " + input.thread.bodyExcerpt.split("\n").join("\n  "),
    "",
    "Actions executed (you may acknowledge ONLY these; times are in the principal's local TZ):",
    executedBlock,
    "",
    "Failed attempts (acknowledge as 'ran into an issue, will follow up'):",
    failedBlock,
    "",
    "Draft the reply now. Body only. Times in your reply MUST use the principal's local TZ shown above; do NOT use UTC, do NOT use ISO strings.",
  ].join("\n");
}

// Format an RFC 3339 UTC start/end pair for the reply prompt's
// "Actions executed" block in the principal's local TZ. Same-day
// ranges collapse the end to "HH:MM" only; cross-day ranges show
// the full date on both sides. Intl handles the TZ conversion and
// DST automatically.
function formatRangeLocal(startIso: string, endIso: string, tz: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return `${startIso} → ${endIso}`;
  }
  const dateFmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const timeFmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
  const startDate = dateFmt.format(start);
  const endDate = dateFmt.format(end);
  const startTime = timeFmt.format(start);
  const endTime = timeFmt.format(end);
  if (startDate === endDate) {
    // Trim the redundant TZ suffix off the start (it appears on end).
    const startTimeNoTz = startTime.replace(/\s+\S+$/, "");
    return `${startDate}, ${startTimeNoTz} – ${endTime}`;
  }
  return `${startDate} ${startTime} → ${endDate} ${endTime}`;
}
