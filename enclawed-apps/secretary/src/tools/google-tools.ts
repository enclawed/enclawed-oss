// Gate-wired Gmail / Calendar / People wrappers.
//
// Every external-effect call is routed through SkillGate.dispatch(), which
// gives us the paper's full audit projection — irreversible.request,
// irreversible.decision, irreversible.executed/.error — keyed on the
// (cap, target) projection used by the biconditional checker.
//
// Per-call F-class properties:
//
//   F1 (gate bypass):     enforced structurally — there is no path from
//                         the demo to Google MCP that does not pass
//                         through gate.dispatch(). The QClearedMcpClient
//                         lives inside the execute closure, never on a
//                         free-floating surface.
//
//   F3 (silent failure):  every execute closure parses the MCP response
//                         and returns ok:false with a reason if the
//                         expected echo field is missing. A 2xx with no
//                         draft id, message id, or thread id is reported
//                         as irreversible.error, NEVER irreversible.executed.
//
//   F4 (wrong target):    the target string is the projection key. For
//                         irreversible writes (send_draft) the target
//                         includes both the SHA-256 of the canonical
//                         (to, subject, body) tuple AND the recipient
//                         address. After the MCP call we re-check the
//                         echoed message's recipient + body hash against
//                         what the target encoded; a mismatch fails the
//                         call.
//
//   F5 (wrong content):   the bicriterion broker reads call.args.dlpSummary
//                         to decide whether to keypress. The wrapper
//                         exposes that field on every irreversible write.

import { createHash } from "node:crypto";
import {
  QClearedMcpClient,
  CAPABILITY,
  makeCall,
  type CapabilityCall,
  GateOutcome,
  SkillGate,
} from "enclawed/framework";
import type { SecretarySeverity } from "../policy/dlp-secretary.js";

// Endpoint map: the synthetic mcp+<scheme>:// URIs the three bundled
// protocol bridges register under. The runtime treats these as
// opaque registry keys — the bridges hold the real network targets.
export type ProtocolEndpoints = Readonly<{
  mail: string;
  calendar: string;
  contacts: string;
}>;

const SECRETARY_SKILL_ID = "enclawed-app-secretary";

export type DlpSummaryArg = Readonly<{
  maxSeverity: SecretarySeverity;
  findingCount: number;
}>;

export type SearchThreadsResult = ReadonlyArray<{
  threadId: string;
  snippet: string;
  /**
   * IMAP UID of the newest message currently in the thread. Used as
   * the dedup key so a follow-up message (same threadId, higher uid)
   * is processed as new content rather than skipped because we've
   * already touched the thread once.
   */
  lastUid: number;
}>;

export type ThreadDetail = Readonly<{
  threadId: string;
  senderEmail: string;
  senderName: string | null;
  subject: string;
  /** Body excerpt; full body is intentionally NOT exposed to the LLM. */
  bodyExcerpt: string;
}>;

export type ContactRecord = Readonly<{
  email: string;
  displayName: string | null;
}>;

export type CalendarEvent = Readonly<{
  eventId: string;
  summary: string;
  startsAtIso: string;
  endsAtIso: string;
  attendeeEmails: ReadonlyArray<string>;
}>;

export type CreateDraftResult = Readonly<{
  draftId: string;
  /** SHA-256 over (to, subject, body) — the F4 binding. */
  contentSha256: string;
}>;

export type SendDraftInput = Readonly<{
  draftId: string;
  expectedRecipient: string;
  expectedContentSha256: string;
  dlpSummary: DlpSummaryArg | null;
  /**
   * Address that AUTHORED the inbound thread this action is responding
   * to (the senderEmail the daily loop passes through). When this
   * matches one of the broker's principalSelfAddresses, the broker
   * treats the action as authorized-by-principal and auto-approves it
   * (subject to the catastrophic-delete carve-out — see broker). When
   * absent, the broker falls through to existing classify logic.
   */
  originSenderEmail?: string;
}>;

export type CreateEventInput = Readonly<{
  summary: string;
  startsAtIso: string;
  endsAtIso: string;
  description?: string;
  location?: string;
  attendees?: ReadonlyArray<string>;
  /**
   * Defense in depth — same role as SendDraftInput.dlpSummary: the
   * broker treats a missing/null DLP summary as keypress-required so
   * an upstream caller that forgets to DLP-scan an event body cannot
   * cheat an auto-approve.
   */
  dlpSummary: DlpSummaryArg | null;
  /** See SendDraftInput.originSenderEmail. */
  originSenderEmail?: string;
}>;

export type CreatedEvent = Readonly<{
  eventId: string;
  url: string;
}>;

export type UpdateEventInput = CreateEventInput & Readonly<{ eventId: string }>;
export type DeleteEventInput = Readonly<{
  eventId: string;
  dlpSummary: DlpSummaryArg | null;
  /** See SendDraftInput.originSenderEmail. */
  originSenderEmail?: string;
  /**
   * Human-readable details of the event being deleted, looked up from
   * the calendar context BEFORE the call. Flows through call.args so
   * the HITL email body can show "DELETE 'Meeting with X' (Tuesday
   * 15:00–16:00 UTC)" instead of just a bare UUID. Optional: the
   * dispatcher omits them if the eventId isn't in the visible upcoming
   * events list.
   */
  linkedSummary?: string;
  linkedStartsAtIso?: string;
  linkedEndsAtIso?: string;
  /**
   * Set to true when this delete is part of a multi-event "bulk"
   * dispatch in a single tool-use turn (e.g. "clear my Sunday
   * appointments" → N parallel delete_calendar_event calls). The
   * broker uses this flag to keep bulk deletes on the HITL keypress
   * path even when origin == principal, while single deletes from
   * the principal auto-approve. Set by the daily-loop tool
   * dispatcher, not by the LLM.
   */
  bulkDelete?: boolean;
}>;

// F4 binding for events: SHA-256 over (summary, start, end, attendees-sorted).
// Same contract as canonicalDraftSha256 — keys are sorted, attendees lowercased
// and deduped so reordering inside the model doesn't shift the hash.
export function canonicalEventSha256(input: {
  summary: string;
  startsAtIso: string;
  endsAtIso: string;
  attendees: ReadonlyArray<string>;
}): string {
  const att = [...new Set(input.attendees.map((a) => a.toLowerCase().trim()))].toSorted();
  const canonical = JSON.stringify({
    attendees: att,
    end: input.endsAtIso,
    start: input.startsAtIso,
    summary: input.summary,
  });
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

export type GoogleToolsOptions = Readonly<{
  gate: SkillGate;
  client: QClearedMcpClient;
  /** Map from logical service to bridge endpoint URI. */
  endpoints: ProtocolEndpoints;
}>;

export class GoogleToolsError extends Error {
  override name = "GoogleToolsError";
  constructor(public readonly outcome: GateOutcome) {
    super(
      outcome.kind === "executed"
        ? "google-tools: unexpected executed outcome for error path"
        : `google-tools: ${outcome.kind}: ${
            (outcome as { reason?: string }).reason ?? "no reason"
          }`,
    );
  }
}

/**
 * Stable canonicalization of a Gmail draft tuple for F4 binding. Uses a
 * sorted-key JSON canonical form on a stripped {to, subject, body}; this
 * matches what we store in the target string and what we re-check at
 * send-time.
 */
export function canonicalDraftSha256(input: { to: string; subject: string; body: string }): string {
  const canonical = JSON.stringify({
    body: input.body,
    subject: input.subject,
    to: input.to.toLowerCase().trim(),
  });
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

/**
 * Short-form hash for label-mutation projection keys. Labels are an
 * ordered set so a small (16-hex) tag is plenty for the biconditional
 * projection — full collision resistance isn't required because the
 * audit log keeps the canonical labels in args.
 */
function labelsTagHash(labels: ReadonlyArray<string>): string {
  const sorted = [...labels].map((l) => l.trim()).toSorted();
  return createHash("sha256").update(sorted.join("\n"), "utf8").digest("hex").slice(0, 16);
}

export class GoogleTools {
  private readonly gate: SkillGate;
  private readonly client: QClearedMcpClient;
  private readonly endpoints: ProtocolEndpoints;

  constructor(opts: GoogleToolsOptions) {
    this.gate = opts.gate;
    this.client = opts.client;
    this.endpoints = opts.endpoints;
  }

  // ──────────────────────────────────────────────────────────────────
  // READS (cap=fs.read, reversible — gate routes straight through; no
  // broker involvement, but the audit projection is still recorded).
  // ──────────────────────────────────────────────────────────────────

  async searchInboxThreads(query: string): Promise<SearchThreadsResult> {
    let captured: SearchThreadsResult = [];
    const call = makeCall({
      cap: CAPABILITY.FS_READ,
      target: `gmail:read/threads?q=${encodeURIComponent(truncQuery(query))}`,
      args: { q: query },
    });
    const outcome = await this.dispatchRead(call, async () => {
      const r = await this.client.invoke({
        serverUrl: this.endpoints.mail,
        toolName: "search_threads",
        arguments: { query, maxResults: 50 },
      });
      if (!r.ok) {
        return { ok: false as const, reason: r.reason };
      }
      const parsed = parseSearchThreads(r.output);
      if (!parsed) {
        return { ok: false as const, reason: "F3: search_threads response missing threads[]" };
      }
      captured = parsed;
      return { ok: true as const };
    });
    if (outcome.kind !== "executed") {
      throw new GoogleToolsError(outcome);
    }
    return captured;
  }

  async getThread(threadId: string): Promise<ThreadDetail> {
    let captured: ThreadDetail | null = null;
    const call = makeCall({
      cap: CAPABILITY.FS_READ,
      target: `gmail:read/thread/${encodeURIComponent(threadId)}`,
      args: { threadId },
    });
    const outcome = await this.dispatchRead(call, async () => {
      const r = await this.client.invoke({
        serverUrl: this.endpoints.mail,
        toolName: "get_thread",
        arguments: { threadId },
      });
      if (!r.ok) {
        return { ok: false as const, reason: r.reason };
      }
      const parsed = parseThread(r.output);
      if (!parsed) {
        return { ok: false as const, reason: "F3: get_thread response missing fields" };
      }
      captured = parsed;
      return { ok: true as const };
    });
    if (outcome.kind !== "executed" || !captured) {
      throw new GoogleToolsError(outcome);
    }
    return captured;
  }

  async searchContactByEmail(email: string): Promise<ContactRecord | null> {
    let captured: ContactRecord | null = null;
    const call = makeCall({
      cap: CAPABILITY.FS_READ,
      target: `people:read/contact/${encodeURIComponent(email.toLowerCase())}`,
      args: { email },
    });
    const outcome = await this.dispatchRead(call, async () => {
      const r = await this.client.invoke({
        serverUrl: this.endpoints.contacts,
        toolName: "search_contacts",
        arguments: { query: email },
      });
      if (!r.ok) {
        return { ok: false as const, reason: r.reason };
      }
      captured = parseContactMatch(r.output, email);
      return { ok: true as const };
    });
    if (outcome.kind !== "executed") {
      throw new GoogleToolsError(outcome);
    }
    return captured;
  }

  async listUpcomingEvents(maxResults = 20): Promise<ReadonlyArray<CalendarEvent>> {
    let captured: ReadonlyArray<CalendarEvent> = [];
    const call = makeCall({
      cap: CAPABILITY.FS_READ,
      target: `calendar:read/events?max=${maxResults}`,
      args: { maxResults },
    });
    const outcome = await this.dispatchRead(call, async () => {
      const r = await this.client.invoke({
        serverUrl: this.endpoints.calendar,
        toolName: "list_events",
        arguments: { maxResults },
      });
      if (!r.ok) {
        return { ok: false as const, reason: r.reason };
      }
      captured = parseEvents(r.output);
      return { ok: true as const };
    });
    if (outcome.kind !== "executed") {
      throw new GoogleToolsError(outcome);
    }
    return captured;
  }

  // ──────────────────────────────────────────────────────────────────
  // REVERSIBLE WRITES (cap=fs.write.rev, reversible — gate buffers a
  // rollback closure; broker is NOT consulted).
  // ──────────────────────────────────────────────────────────────────

  async createDraft(input: {
    to: string;
    subject: string;
    body: string;
    inReplyToThreadId: string | null;
  }): Promise<CreateDraftResult> {
    const contentSha = canonicalDraftSha256(input);
    let captured: CreateDraftResult | null = null;
    const call = makeCall({
      cap: CAPABILITY.FS_WRITE_REV,
      target: `gmail:draft/new#sha256=${contentSha}`,
      args: {
        to: input.to,
        subjectHash: createHash("sha256").update(input.subject).digest("hex").slice(0, 16),
        bodyBytes: input.body.length,
      },
    });
    const outcome = await this.dispatchReversible(call, async () => {
      const r = await this.client.invoke({
        serverUrl: this.endpoints.mail,
        toolName: "create_draft",
        // Bridge contract: `to` is an array of addresses, body is
        // `bodyText`. The runtime models a single-recipient draft
        // with `input.to` as a string for downstream F4 hash purposes;
        // wrap it into a one-element array for the bridge here.
        arguments: {
          to: [input.to],
          subject: input.subject,
          bodyText: input.body,
          ...(input.inReplyToThreadId ? { threadId: input.inReplyToThreadId } : {}),
        },
      });
      if (!r.ok) {
        return { ok: false as const, reason: r.reason };
      }
      const draftId = parseDraftId(r.output);
      if (!draftId) {
        return {
          ok: false as const,
          reason: "F3: create_draft returned ok but no draftId — silent host failure",
        };
      }
      captured = { draftId, contentSha256: contentSha };
      return { ok: true as const };
    });
    if (outcome.kind !== "executed" || !captured) {
      throw new GoogleToolsError(outcome);
    }
    return captured;
  }

  async modifyThreadLabels(input: {
    threadId: string;
    addLabels: ReadonlyArray<string>;
    removeLabels: ReadonlyArray<string>;
  }): Promise<{ requestId: string }> {
    const addTag = labelsTagHash(input.addLabels);
    const removeTag = labelsTagHash(input.removeLabels);
    const call = makeCall({
      cap: CAPABILITY.FS_WRITE_REV,
      target: `gmail:labels/${encodeURIComponent(
        input.threadId,
      )}#add=${addTag};remove=${removeTag}`,
      args: {
        threadId: input.threadId,
        addLabels: [...input.addLabels],
        removeLabels: [...input.removeLabels],
      },
    });
    const outcome = await this.dispatchReversible(
      call,
      async () => {
        // Bridge contract: addLabels / removeLabels (string arrays).
        // The old Google MCP used addLabelIds / removeLabelIds; the
        // IMAP+SMTP bridge takes the human-readable label names
        // because Gmail's IMAP folder names ARE the label names.
        const r = await this.client.invoke({
          serverUrl: this.endpoints.mail,
          toolName: "modify_thread_labels",
          arguments: {
            threadId: input.threadId,
            addLabels: [...input.addLabels],
            removeLabels: [...input.removeLabels],
          },
        });
        if (!r.ok) {
          return { ok: false as const, reason: r.reason };
        }
        // The IMAP bridge's response echoes { applied: { add: [...],
        // remove: [...] } } — the labels that were actually applied
        // server-side. Confirm at least one requested add label round-trips.
        if (input.addLabels.length > 0 && !appliedIncludesAtLeastOne(r.output, input.addLabels)) {
          return {
            ok: false as const,
            reason: "F3: modify_thread_labels echo missing requested add labels",
          };
        }
        return { ok: true as const };
      },
      // Rollback: invert the label change. Best-effort; if rollback
      // fails the txn-buffer logs it but the original op's audit record
      // is already on disk.
      async () => {
        await this.client.invoke({
          serverUrl: this.endpoints.mail,
          toolName: "modify_thread_labels",
          arguments: {
            threadId: input.threadId,
            addLabels: [...input.removeLabels],
            removeLabels: [...input.addLabels],
          },
        });
      },
    );
    if (outcome.kind !== "executed") {
      throw new GoogleToolsError(outcome);
    }
    return { requestId: outcome.requestId };
  }

  // STORE +FLAGS \Seen on every message in a Gmail thread. Called
  // after the secretary has fully handled a thread so the next
  // `is:unread` poll won't re-process the same conversation — but
  // if the contact later replies, Gmail re-marks the thread unread
  // server-side and the new message comes back through search
  // exactly once. This is what makes multi-message threads (a
  // request + a follow-up days later) actually get a second reply
  // instead of being silently deduped.
  //
  // Routed through dispatchRead because the operation is a flag
  // mutation on already-delivered messages — reversible in the
  // strict sense, but it's an inbox-cleanup step the secretary
  // ALWAYS takes; routing through the read path keeps it out of
  // the bicriterion broker. dispatchRead audits + records but does
  // not consult the broker.
  async markThreadSeen(threadId: string): Promise<void> {
    const call = makeCall({
      cap: CAPABILITY.FS_READ,
      target: `gmail:flags/${encodeURIComponent(threadId)}#add=Seen`,
      args: { threadId },
    });
    await this.dispatchRead(call, async () => {
      const r = await this.client.invoke({
        serverUrl: this.endpoints.mail,
        toolName: "mark_thread_seen",
        arguments: { threadId },
      });
      if (!r.ok) {
        return { ok: false as const, reason: r.reason };
      }
      return { ok: true as const };
    });
  }

  // ──────────────────────────────────────────────────────────────────
  // IRREVERSIBLE WRITES (cap=publish — gate consults the bicriterion
  // broker, which decides auto-approve / keypress / deny based on
  // dlpSummary and target shape).
  // ──────────────────────────────────────────────────────────────────

  async sendDraft(input: SendDraftInput): Promise<{ requestId: string }> {
    const recipient = input.expectedRecipient.toLowerCase().trim();
    const target =
      `gmail:send/${encodeURIComponent(input.draftId)}` +
      `#sha256=${input.expectedContentSha256};to=${encodeURIComponent(recipient)}`;
    const call = makeCall({
      cap: CAPABILITY.PUBLISH,
      target,
      args: {
        draftId: input.draftId,
        // The broker reads dlpSummary; missing/null means "no DLP run",
        // and the broker treats that as keypress-required (defense in
        // depth: an upstream caller that forgets DLP shouldn't get a
        // free auto-approve).
        dlpSummary: input.dlpSummary ?? null,
        ...(input.originSenderEmail
          ? { originSenderEmail: input.originSenderEmail.toLowerCase().trim() }
          : {}),
      },
    });
    const outcome = await this.gate.dispatch({
      skillId: SECRETARY_SKILL_ID,
      call,
      execute: async (c: CapabilityCall) => {
        const r = await this.client.invoke({
          serverUrl: this.endpoints.mail,
          toolName: "send_draft",
          arguments: { draftId: input.draftId },
        });
        if (!r.ok) {
          return { ok: false as const, reason: r.reason };
        }
        // F4 echo check: the sent message must echo the same recipient
        // we encoded in the target. A mismatch is treated as a wrong-
        // target execution and surfaced as irreversible.error.
        const echoed = parseSendEcho(r.output);
        if (!echoed) {
          return {
            ok: false as const,
            reason: "F3: send_draft returned ok but no sent-message echo",
          };
        }
        if (echoed.toLowerCase() !== recipient) {
          return {
            ok: false as const,
            reason:
              `F4 echo mismatch: requested to=${recipient}, ` +
              `Gmail echoed to=${echoed} (call ${c.target.slice(0, 60)}…)`,
          };
        }
        return { ok: true as const };
      },
    });
    if (outcome.kind !== "executed") {
      throw new GoogleToolsError(outcome);
    }
    return { requestId: outcome.requestId };
  }

  // Calendar writes are irreversible from the user's standpoint: once
  // an event lands on the principal's calendar (and on every attendee's
  // calendar, when attendees are present) the world has changed
  // observably — declining an invite is not the same as "the event
  // never happened". So all three calendar mutations route through
  // cap=PUBLISH and consult the bicriterion broker.

  async createEvent(input: CreateEventInput): Promise<CreatedEvent> {
    const att = input.attendees ?? [];
    const sha = canonicalEventSha256({
      summary: input.summary,
      startsAtIso: input.startsAtIso,
      endsAtIso: input.endsAtIso,
      attendees: att,
    });
    const target = `calendar:event/new#sha256=${sha}`;
    let captured: CreatedEvent | null = null;
    const call = makeCall({
      cap: CAPABILITY.PUBLISH,
      target,
      args: {
        summary: input.summary,
        startsAtIso: input.startsAtIso,
        endsAtIso: input.endsAtIso,
        attendees: [...att],
        dlpSummary: input.dlpSummary ?? null,
        ...(input.originSenderEmail
          ? { originSenderEmail: input.originSenderEmail.toLowerCase().trim() }
          : {}),
      },
    });
    const outcome = await this.gate.dispatch({
      skillId: SECRETARY_SKILL_ID,
      call,
      execute: async (c: CapabilityCall) => {
        const r = await this.client.invoke({
          serverUrl: this.endpoints.calendar,
          toolName: "create_event",
          arguments: {
            summary: input.summary,
            start: input.startsAtIso,
            end: input.endsAtIso,
            ...(input.description ? { description: input.description } : {}),
            ...(input.location ? { location: input.location } : {}),
            ...(att.length > 0 ? { attendees: [...att] } : {}),
          },
        });
        if (!r.ok) {
          return { ok: false as const, reason: r.reason };
        }
        const parsed = parseCreatedEvent(r.output);
        if (!parsed) {
          return {
            ok: false as const,
            reason: `F3: create_event returned ok but no eventId — silent host failure (call ${c.target.slice(0, 60)}…)`,
          };
        }
        captured = parsed;
        return { ok: true as const };
      },
    });
    if (outcome.kind !== "executed" || !captured) {
      throw new GoogleToolsError(outcome);
    }
    return captured;
  }

  async updateEvent(input: UpdateEventInput): Promise<CreatedEvent> {
    const att = input.attendees ?? [];
    const sha = canonicalEventSha256({
      summary: input.summary,
      startsAtIso: input.startsAtIso,
      endsAtIso: input.endsAtIso,
      attendees: att,
    });
    const target = `calendar:event/${encodeURIComponent(input.eventId)}#sha256=${sha}`;
    let captured: CreatedEvent | null = null;
    const call = makeCall({
      cap: CAPABILITY.PUBLISH,
      target,
      args: {
        eventId: input.eventId,
        summary: input.summary,
        startsAtIso: input.startsAtIso,
        endsAtIso: input.endsAtIso,
        attendees: [...att],
        dlpSummary: input.dlpSummary ?? null,
        ...(input.originSenderEmail
          ? { originSenderEmail: input.originSenderEmail.toLowerCase().trim() }
          : {}),
      },
    });
    const outcome = await this.gate.dispatch({
      skillId: SECRETARY_SKILL_ID,
      call,
      execute: async (c: CapabilityCall) => {
        const r = await this.client.invoke({
          serverUrl: this.endpoints.calendar,
          toolName: "update_event",
          arguments: {
            eventId: input.eventId,
            summary: input.summary,
            start: input.startsAtIso,
            end: input.endsAtIso,
            ...(input.description ? { description: input.description } : {}),
            ...(input.location ? { location: input.location } : {}),
            ...(att.length > 0 ? { attendees: [...att] } : {}),
          },
        });
        if (!r.ok) {
          return { ok: false as const, reason: r.reason };
        }
        const parsed = parseCreatedEvent(r.output);
        if (!parsed || parsed.eventId !== input.eventId) {
          return {
            ok: false as const,
            reason: `F4 echo: update_event eventId mismatch (requested ${input.eventId}) (call ${c.target.slice(0, 60)}…)`,
          };
        }
        captured = parsed;
        return { ok: true as const };
      },
    });
    if (outcome.kind !== "executed" || !captured) {
      throw new GoogleToolsError(outcome);
    }
    return captured;
  }

  async deleteEvent(input: DeleteEventInput): Promise<{ requestId: string }> {
    const target = `calendar:event/${encodeURIComponent(input.eventId)}#delete`;
    const call = makeCall({
      cap: CAPABILITY.PUBLISH,
      target,
      args: {
        eventId: input.eventId,
        dlpSummary: input.dlpSummary ?? null,
        ...(input.originSenderEmail
          ? { originSenderEmail: input.originSenderEmail.toLowerCase().trim() }
          : {}),
        ...(input.linkedSummary ? { linkedSummary: input.linkedSummary } : {}),
        ...(input.linkedStartsAtIso ? { linkedStartsAtIso: input.linkedStartsAtIso } : {}),
        ...(input.linkedEndsAtIso ? { linkedEndsAtIso: input.linkedEndsAtIso } : {}),
        ...(input.bulkDelete ? { bulkDelete: true } : {}),
      },
    });
    const outcome = await this.gate.dispatch({
      skillId: SECRETARY_SKILL_ID,
      call,
      execute: async (c: CapabilityCall) => {
        const r = await this.client.invoke({
          serverUrl: this.endpoints.calendar,
          toolName: "delete_event",
          arguments: { eventId: input.eventId },
        });
        if (!r.ok) {
          return { ok: false as const, reason: r.reason };
        }
        if (!parseDeletedEcho(r.output, input.eventId)) {
          return {
            ok: false as const,
            reason: `F3: delete_event returned ok but no { deleted: true } echo (call ${c.target.slice(0, 60)}…)`,
          };
        }
        return { ok: true as const };
      },
    });
    if (outcome.kind !== "executed") {
      throw new GoogleToolsError(outcome);
    }
    return { requestId: outcome.requestId };
  }

  // ──────────────────────────────────────────────────────────────────
  // Private dispatch helpers
  // ──────────────────────────────────────────────────────────────────

  private dispatchRead(
    call: CapabilityCall,
    execute: () => Promise<{ ok: true } | { ok: false; reason: string }>,
  ): Promise<GateOutcome> {
    // FS_READ is reversible; the gate routes straight through the txn
    // buffer with no rollback closure (reads don't need rolling back).
    return this.gate.dispatch({
      skillId: SECRETARY_SKILL_ID,
      call,
      execute,
    });
  }

  private dispatchReversible(
    call: CapabilityCall,
    execute: () => Promise<{ ok: true } | { ok: false; reason: string }>,
    rollback?: () => Promise<void> | void,
  ): Promise<GateOutcome> {
    return this.gate.dispatch({
      skillId: SECRETARY_SKILL_ID,
      call,
      execute,
      ...(rollback ? { rollback } : {}),
    });
  }
}

// ─── Response parsers — return null on shape violation so the wrapper
//     emits an F3-flagged irreversible.error. Every Gmail / Calendar /
//     People MCP response has documented shape; if Google ever ships a
//     breaking change, the wrapper fails loud rather than silent. ───────

function parseSearchThreads(raw: unknown): SearchThreadsResult | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const t = (raw as { threads?: unknown }).threads;
  if (!Array.isArray(t)) {
    return null;
  }
  const out: { threadId: string; snippet: string; lastUid: number }[] = [];
  for (const item of t) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const rec = item as { threadId?: unknown; snippet?: unknown; lastUid?: unknown };
    if (typeof rec.threadId !== "string") {
      continue;
    }
    out.push({
      threadId: rec.threadId,
      snippet: typeof rec.snippet === "string" ? rec.snippet : "",
      // Bridges built before mark_thread_seen rollout omit lastUid; fall
      // back to 0 so the dedup treats every poll as new content — that
      // matches the old behavior and keeps the loop functional during
      // a partial-rollout transition.
      lastUid: typeof rec.lastUid === "number" ? rec.lastUid : 0,
    });
  }
  return Object.freeze(out);
}

// The IMAP bridge returns get_thread as { threadId, messages: [...] }.
// We collapse the messages list to the latest one for the per-thread
// fields the runtime consumes (sender, subject, body excerpt). The
// older messages remain in the audit projection via the threadId
// rather than being included verbatim.
function parseThread(raw: unknown): ThreadDetail | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const r = raw as Record<string, unknown>;
  const threadId = typeof r.threadId === "string" ? r.threadId : null;
  const messages = Array.isArray(r.messages) ? r.messages : null;
  if (!threadId || !messages || messages.length === 0) {
    return null;
  }
  const latest = messages[messages.length - 1] as Record<string, unknown>;
  const from = latest.from as { name?: unknown; address?: unknown } | undefined;
  const senderEmail = from && typeof from.address === "string" ? from.address.toLowerCase() : null;
  if (!senderEmail) {
    return null;
  }
  const senderName =
    from && typeof from.name === "string" && from.name.length > 0 ? from.name : null;
  const subject = typeof latest.subject === "string" ? latest.subject : "";
  const bodyText =
    typeof latest.bodyText === "string"
      ? latest.bodyText
      : typeof latest.body === "string"
        ? latest.body
        : "";
  return Object.freeze({
    threadId,
    senderEmail,
    senderName,
    subject,
    bodyExcerpt: bodyText.slice(0, 4000),
  });
}

function parseContactMatch(raw: unknown, queryEmail: string): ContactRecord | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const c = (raw as { contacts?: unknown }).contacts;
  if (!Array.isArray(c)) {
    return null;
  }
  const needle = queryEmail.toLowerCase();
  for (const item of c) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const rec = item as { emails?: unknown; displayName?: unknown };
    if (!Array.isArray(rec.emails)) {
      continue;
    }
    for (const e of rec.emails) {
      if (typeof e === "string" && e.toLowerCase() === needle) {
        return Object.freeze({
          email: e.toLowerCase(),
          displayName: typeof rec.displayName === "string" ? rec.displayName : null,
        });
      }
    }
  }
  return null;
}

// CalDAV bridge returns events as { events: [{ eventId, summary, start
// (ISO string), end (ISO string), location, organizer, attendees }] }.
// The runtime needs eventId + summary + start/end + attendee emails.
function parseEvents(raw: unknown): ReadonlyArray<CalendarEvent> {
  if (!raw || typeof raw !== "object") {
    return [];
  }
  const items = (raw as { events?: unknown }).events;
  if (!Array.isArray(items)) {
    return [];
  }
  const out: CalendarEvent[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const rec = item as Record<string, unknown>;
    const eventId = typeof rec.eventId === "string" ? rec.eventId : null;
    const summary = typeof rec.summary === "string" ? rec.summary : "";
    const start = typeof rec.start === "string" ? rec.start : null;
    const end = typeof rec.end === "string" ? rec.end : null;
    if (!eventId || !start || !end) {
      continue;
    }
    const attendees: string[] = [];
    if (Array.isArray(rec.attendees)) {
      for (const a of rec.attendees) {
        if (a && typeof a === "object" && typeof (a as { email?: unknown }).email === "string") {
          attendees.push((a as { email: string }).email);
        }
      }
    }
    out.push(
      Object.freeze({
        eventId,
        summary,
        startsAtIso: start,
        endsAtIso: end,
        attendeeEmails: Object.freeze(attendees),
      }),
    );
  }
  return Object.freeze(out);
}

function parseCreatedEvent(raw: unknown): CreatedEvent | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const r = raw as Record<string, unknown>;
  const eventId = typeof r.eventId === "string" ? r.eventId : null;
  if (!eventId) {
    return null;
  }
  const url = typeof r.url === "string" ? r.url : "";
  return Object.freeze({ eventId, url });
}

function parseDeletedEcho(raw: unknown, expectedEventId: string): boolean {
  if (!raw || typeof raw !== "object") {
    return false;
  }
  const r = raw as Record<string, unknown>;
  return r.deleted === true && r.eventId === expectedEventId;
}

function parseDraftId(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const r = raw as Record<string, unknown>;
  if (typeof r.draftId === "string") {
    return r.draftId;
  }
  if (typeof r.id === "string") {
    return r.id;
  }
  const d = r.draft;
  if (d && typeof d === "object" && typeof (d as { id?: unknown }).id === "string") {
    return (d as { id: string }).id;
  }
  return null;
}

function parseSendEcho(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const r = raw as Record<string, unknown>;
  // IMAP+SMTP bridge returns { messageId, sentAt, recipient }; the
  // recipient is the primary To address from the draft envelope and
  // is the F4 echo the runtime checks against the requested target.
  if (typeof r.recipient === "string" && r.recipient.length > 0) {
    return r.recipient;
  }
  return null;
}

// The IMAP+SMTP bridge's modify_thread_labels returns
// { threadId, applied: { add: string[], remove: string[] } } —
// where `add` is the subset of requested labels that were actually
// applied server-side. F3 echo check: at least one requested add
// label must have round-tripped.
function appliedIncludesAtLeastOne(raw: unknown, labels: ReadonlyArray<string>): boolean {
  if (!raw || typeof raw !== "object") {
    return false;
  }
  const applied = (raw as { applied?: unknown }).applied;
  if (!applied || typeof applied !== "object") {
    return false;
  }
  const add = (applied as { add?: unknown }).add;
  if (!Array.isArray(add)) {
    return false;
  }
  const lower = new Set(add.map((x) => String(x).toLowerCase()));
  for (const l of labels) {
    if (lower.has(l.toLowerCase())) {
      return true;
    }
  }
  return false;
}

function truncQuery(q: string): string {
  return q.length > 200 ? q.slice(0, 200) + "…" : q;
}
