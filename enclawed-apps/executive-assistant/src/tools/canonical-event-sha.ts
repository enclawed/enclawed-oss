// F4 binding for calendar events: SHA-256 over a canonical projection
// of (summary, start, end, attendees-sorted, recurrence). Lives in its
// own module — separate from google-tools.ts — so unit tests can pin
// the contract without pulling the framework / Ollama / Gmail-tools
// graph into the test compilation unit.
//
// The recurrence field is part of the hash: a one-off "Coffee at 3pm
// Tuesday" and a recurring "Coffee at 3pm every Tuesday" share every
// other field but must produce distinct SHAs so the audit chain (F2)
// distinguishes them and the F4 echo check on update_event can spot
// a server-side conversion between the two.

import { createHash } from "node:crypto";

export function canonicalEventSha256(input: {
  summary: string;
  startsAtIso: string;
  endsAtIso: string;
  attendees: ReadonlyArray<string>;
  recurrence?: string;
  timezone?: string;
}): string {
  const att = [...new Set(input.attendees.map((a) => a.toLowerCase().trim()))].toSorted();
  const canonical = JSON.stringify({
    attendees: att,
    end: input.endsAtIso,
    recurrence: input.recurrence ?? "",
    start: input.startsAtIso,
    summary: input.summary,
    timezone: input.timezone ?? "",
  });
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}
