// Contract test for canonicalEventSha256: the recurrence field is part
// of the hash. A regression that drops `recurrence` from the canonical
// projection would break the audit chain's F2 (audit forgery) and F4
// (echo-mismatch) detection for any recurring event the executive assistant
// books — a one-off appointment and a recurring appointment with the
// same summary/start/end/attendees would produce identical SHAs, and
// a server-side conversion between the two would not be detected.

import { describe, expect, it } from "vitest";
import { canonicalEventSha256 } from "../../enclawed-apps/executive-assistant/src/tools/canonical-event-sha.ts";

const base = {
  summary: "Coffee with Jane",
  startsAtIso: "2026-06-09T15:00:00.000Z",
  endsAtIso: "2026-06-09T15:30:00.000Z",
  attendees: ["jane@example.com"] as ReadonlyArray<string>,
};

describe("canonicalEventSha256", () => {
  it("is deterministic for the same input", () => {
    expect(canonicalEventSha256(base)).toBe(canonicalEventSha256(base));
  });

  it("changes when the recurrence value is added", () => {
    const oneOff = canonicalEventSha256(base);
    const recurring = canonicalEventSha256({ ...base, recurrence: "FREQ=WEEKLY;BYDAY=TU" });
    expect(recurring).not.toBe(oneOff);
  });

  it("changes when the recurrence value is different", () => {
    const weekly = canonicalEventSha256({ ...base, recurrence: "FREQ=WEEKLY;BYDAY=TU" });
    const daily = canonicalEventSha256({ ...base, recurrence: "FREQ=DAILY" });
    expect(weekly).not.toBe(daily);
  });

  it("treats omitted and empty-string recurrence as the same one-off SHA", () => {
    // Defense in depth — a regression where one call site passed
    // undefined and another passed "" would otherwise produce two
    // SHAs for the same effective event.
    const omitted = canonicalEventSha256(base);
    const empty = canonicalEventSha256({ ...base, recurrence: "" });
    expect(empty).toBe(omitted);
  });

  it("is insensitive to attendee order", () => {
    const a = canonicalEventSha256({ ...base, attendees: ["alice@x.com", "bob@x.com"] });
    const b = canonicalEventSha256({ ...base, attendees: ["bob@x.com", "alice@x.com"] });
    expect(a).toBe(b);
  });

  it("is sensitive to summary", () => {
    const a = canonicalEventSha256(base);
    const b = canonicalEventSha256({ ...base, summary: base.summary + "!" });
    expect(a).not.toBe(b);
  });
});
