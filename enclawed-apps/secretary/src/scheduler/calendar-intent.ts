// LLM-driven calendar-write intent extractor.
//
// One contact-path thread → at most one calendar mutation. The extractor
// runs a constrained second pass over the thread body (after the contact
// gate has passed) and asks the model to emit either {"action":"none"}
// or a fully-grounded create/update/delete payload. Anything that fails
// to parse, fails the schema check, or names a time outside a small
// forward window is treated as {"action":"none"} — the secretary
// continues with the plain reply path.
//
// What this is NOT: a tool-use agent. The model is asked exactly once
// for a structured JSON object; it never gets to call tools directly.
// All execution still goes through SkillGate.dispatch() so the broker
// keypresses every event mutation before it touches the calendar.
//
// What lives in this file: structure (schema, parser, prompt builder).
// What lives in daily-loop.ts: wiring (call the extractor, then
// invoke GoogleTools.createEvent / .updateEvent / .deleteEvent and
// fold the executed action into the reply context).

import type { ThreadDetail, CalendarEvent } from "../tools/google-tools.js";
import type { OllamaClient } from "../tools/ollama-client.js";

export type CalendarIntent =
  | Readonly<{
      action: "create";
      summary: string;
      startsAtIso: string;
      endsAtIso: string;
      attendees: ReadonlyArray<string>;
      description: string;
    }>
  | Readonly<{
      action: "update";
      eventId: string;
      summary: string;
      startsAtIso: string;
      endsAtIso: string;
      attendees: ReadonlyArray<string>;
      description: string;
    }>
  | Readonly<{
      action: "delete";
      eventId: string;
    }>;

// 14-day forward window. The principal's "block out time" requests and
// scheduling threads consistently land inside two weeks; anything further
// out is much more likely to be a false-positive extraction ("can we
// catch up sometime next month?" is conversation, not a booking).
const MAX_FORWARD_DAYS = 14;

export async function extractCalendarIntent(opts: {
  thread: ThreadDetail;
  upcomingEvents: ReadonlyArray<CalendarEvent>;
  ollama: OllamaClient;
  ollamaModel: string;
  now: Date;
  log?: (level: "info" | "warn" | "error", msg: string) => void;
}): Promise<CalendarIntent | null> {
  const log = opts.log ?? (() => {});
  const sys = buildExtractorSystemPrompt(opts.now);
  const usr = buildExtractorUserPrompt(opts.thread, opts.upcomingEvents);
  let raw: string;
  try {
    raw = await opts.ollama.chat({
      model: opts.ollamaModel,
      messages: [
        { role: "system", content: sys },
        { role: "user", content: usr },
      ],
    });
  } catch (err) {
    log("warn", `calendar-intent: ollama call failed: ${(err as Error).message}`);
    return null;
  }
  const obj = safeParseJson(raw);
  if (!obj) {
    // Surface a clipped preview so the operator can see whether the
    // model is emitting prose, markdown-fenced JSON we failed to
    // strip, or something else entirely.
    log(
      "info",
      `calendar-intent: model returned non-JSON or unparseable text — ` +
        `raw="${raw.slice(0, 200).replace(/\s+/g, " ")}"`,
    );
    return null;
  }
  const parsed = validateIntent(obj, opts.now, log);
  if (!parsed) {
    return null;
  }
  log(
    "info",
    `calendar-intent: extracted action=${parsed.action}` +
      (parsed.action !== "delete"
        ? ` summary="${parsed.summary}" start=${parsed.startsAtIso} end=${parsed.endsAtIso}`
        : ` eventId=${parsed.eventId}`),
  );
  return parsed;
}

function buildExtractorSystemPrompt(now: Date): string {
  return [
    "You are a calendar-intent extractor. Read the email thread and",
    "decide if the principal (or sender) is asking for a CONCRETE,",
    "actionable calendar change. Emit a single JSON object and nothing",
    "else — no prose, no markdown, no commentary.",
    "",
    `Reference time (UTC): ${now.toISOString()}`,
    "",
    "Schema (one of):",
    '  {"action":"none"}',
    '  {"action":"create","summary":"<title>","startsAtIso":"<RFC3339>",',
    '    "endsAtIso":"<RFC3339>","attendees":["..."],"description":"..."}',
    '  {"action":"update","eventId":"<uid>","summary":"<title>",',
    '    "startsAtIso":"<RFC3339>","endsAtIso":"<RFC3339>",',
    '    "attendees":["..."],"description":"..."}',
    '  {"action":"delete","eventId":"<uid>"}',
    "",
    "Rules — apply ALL of them, no exceptions:",
    "  1. If the thread is conversational (questions, status updates,",
    '     vague offers like "let me know"), emit {"action":"none"}.',
    "  2. Only emit create/update/delete when BOTH a time and a duration",
    "     can be inferred unambiguously. If either is missing, emit none.",
    `  3. Times must lie inside the next ${MAX_FORWARD_DAYS} days (UTC).`,
    "     Anything further out: emit none.",
    "  4. eventId for update/delete MUST be one of the existing event",
    "     UIDs supplied in the user prompt. Never invent an eventId.",
    "  5. attendees must be email addresses that already appear in the",
    "     thread headers or body. Never add a new contact here.",
    "  6. description is at most one sentence and contains NO email",
    "     addresses, phone numbers, URLs, or credentials.",
    "  7. RFC 3339 timestamps with explicit timezone (Z or ±HH:MM).",
  ].join("\n");
}

function buildExtractorUserPrompt(
  thread: ThreadDetail,
  events: ReadonlyArray<CalendarEvent>,
): string {
  const calBlock = events
    .slice(0, 20)
    .map((e) => `  • uid=${e.eventId} "${e.summary}" (${e.startsAtIso}–${e.endsAtIso})`)
    .join("\n");
  return [
    `Sender: ${thread.senderName ?? "(no display name)"} <${thread.senderEmail}>`,
    `Subject: ${thread.subject}`,
    "",
    "Existing upcoming events (uid + summary + window):",
    calBlock.length > 0 ? calBlock : "  (none)",
    "",
    "Message excerpt:",
    "  " + thread.bodyExcerpt.split("\n").join("\n  "),
    "",
    "Emit the JSON object now.",
  ].join("\n");
}

function safeParseJson(raw: string): unknown {
  const trimmed = raw.trim();
  // Local models often wrap JSON in ```json fences; strip them.
  const stripped = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  // Find the first { and last } and try just that span. Falls back to
  // the full string if no braces are present.
  const first = stripped.indexOf("{");
  const last = stripped.lastIndexOf("}");
  const candidate = first >= 0 && last > first ? stripped.slice(first, last + 1) : stripped;
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

function validateIntent(obj: unknown, now: Date): CalendarIntent | null {
  if (!obj || typeof obj !== "object") {
    return null;
  }
  const r = obj as Record<string, unknown>;
  const action = typeof r.action === "string" ? r.action : "";
  if (action === "none") {
    return null;
  }
  if (action === "delete") {
    const eventId = typeof r.eventId === "string" ? r.eventId.trim() : "";
    return eventId ? Object.freeze({ action: "delete", eventId }) : null;
  }
  if (action !== "create" && action !== "update") {
    return null;
  }
  const summary = typeof r.summary === "string" ? r.summary.trim() : "";
  const start = typeof r.startsAtIso === "string" ? r.startsAtIso.trim() : "";
  const end = typeof r.endsAtIso === "string" ? r.endsAtIso.trim() : "";
  if (!summary || !start || !end) {
    return null;
  }
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return null;
  }
  if (startMs < now.getTime() - 60_000) {
    return null;
  }
  if (startMs > now.getTime() + MAX_FORWARD_DAYS * 86_400_000) {
    return null;
  }
  const attendees = Array.isArray(r.attendees)
    ? (r.attendees as unknown[])
        .filter((x): x is string => typeof x === "string" && x.includes("@"))
        .map((x) => x.toLowerCase().trim())
    : [];
  const description = typeof r.description === "string" ? r.description.trim() : "";
  if (action === "create") {
    return Object.freeze({
      action: "create",
      summary,
      startsAtIso: new Date(startMs).toISOString(),
      endsAtIso: new Date(endMs).toISOString(),
      attendees: Object.freeze(attendees),
      description,
    });
  }
  const eventId = typeof r.eventId === "string" ? r.eventId.trim() : "";
  if (!eventId) {
    return null;
  }
  return Object.freeze({
    action: "update",
    eventId,
    summary,
    startsAtIso: new Date(startMs).toISOString(),
    endsAtIso: new Date(endMs).toISOString(),
    attendees: Object.freeze(attendees),
    description,
  });
}
