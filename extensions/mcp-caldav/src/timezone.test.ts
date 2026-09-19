// Timezone handling for recurring events. The CalDAV bridge MUST
// emit DTSTART;TZID=<zone>:<local-time> + VTIMEZONE when a timezone
// is supplied, so the server iterates BYDAY rules in the user's
// timezone instead of UTC. The latter behavior causes a 5:30 PM PDT
// recurring weekly Tuesday event to land on PDT Mondays after the
// first occurrence (because 5:30 PM PDT = 00:30 UTC Wednesday, and
// the server picks Tuesdays in UTC = Mondays in PDT). These tests
// pin the contract.

import { describe, expect, it } from "vitest";
import { buildVCalendar, normalizeTimezone } from "./caldav-transport.js";

describe("normalizeTimezone", () => {
  it("accepts well-formed IANA zones", () => {
    expect(normalizeTimezone("America/Los_Angeles")).toBe("America/Los_Angeles");
    expect(normalizeTimezone("Europe/Paris")).toBe("Europe/Paris");
    expect(normalizeTimezone("Asia/Tokyo")).toBe("Asia/Tokyo");
    expect(normalizeTimezone("UTC")).toBe("UTC");
  });

  it("rejects malformed or unknown zones", () => {
    expect(normalizeTimezone("Mars/Olympus_Mons")).toBeUndefined();
    expect(normalizeTimezone("PDT")).toBeUndefined(); // not a Region/City
    expect(normalizeTimezone("")).toBeUndefined();
    expect(normalizeTimezone("   ")).toBeUndefined();
    expect(normalizeTimezone(null)).toBeUndefined();
    expect(normalizeTimezone(undefined)).toBeUndefined();
    expect(normalizeTimezone(42)).toBeUndefined();
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeTimezone("  America/Los_Angeles  ")).toBe("America/Los_Angeles");
  });
});

describe("buildVCalendar timezone handling", () => {
  const baseInput = {
    summary: "Violin lesson",
    // 5:30 PM PDT on Tuesday June 9, 2026 = 00:30 UTC Wednesday June 10.
    start: "2026-06-10T00:30:00.000Z",
    end: "2026-06-10T01:00:00.000Z",
    uid: "test-uid-001",
    organizer: "alice@example.com",
  } as const;

  it("emits DTSTART in UTC when no timezone is supplied", () => {
    const ics = buildVCalendar(baseInput);
    expect(ics).toMatch(/^DTSTART:20260610T003000Z$/m);
    expect(ics).toMatch(/^DTEND:20260610T010000Z$/m);
    expect(ics).not.toMatch(/TZID=/);
    expect(ics).not.toMatch(/BEGIN:VTIMEZONE/);
  });

  it("emits DTSTART;TZID=... in the user's local time when timezone is set", () => {
    const ics = buildVCalendar({ ...baseInput, timezone: "America/Los_Angeles" });
    expect(ics).toMatch(/^DTSTART;TZID=America\/Los_Angeles:20260609T173000$/m);
    expect(ics).toMatch(/^DTEND;TZID=America\/Los_Angeles:20260609T180000$/m);
    expect(ics).not.toMatch(/DTSTART:.*Z/);
    expect(ics).not.toMatch(/DTEND:.*Z/);
  });

  it("includes a VTIMEZONE block with TZID, DAYLIGHT, and STANDARD for DST zones", () => {
    const ics = buildVCalendar({ ...baseInput, timezone: "America/Los_Angeles" });
    expect(ics).toMatch(/BEGIN:VTIMEZONE\s+TZID:America\/Los_Angeles/);
    expect(ics).toMatch(/BEGIN:DAYLIGHT/);
    expect(ics).toMatch(/BEGIN:STANDARD/);
    expect(ics).toMatch(/TZOFFSETTO:-0700/); // PDT
    expect(ics).toMatch(/TZOFFSETTO:-0800/); // PST
    expect(ics).toMatch(/END:VTIMEZONE/);
  });

  it("emits a single STANDARD block for zones without DST", () => {
    const ics = buildVCalendar({ ...baseInput, timezone: "Asia/Tokyo" });
    expect(ics).toMatch(/BEGIN:VTIMEZONE\s+TZID:Asia\/Tokyo/);
    expect(ics).toMatch(/BEGIN:STANDARD/);
    expect(ics).not.toMatch(/BEGIN:DAYLIGHT/);
    expect(ics).toMatch(/TZOFFSETTO:\+0900/);
  });

  it("recurring event with TZID iterates in local time (not UTC)", () => {
    // This is the actual bug we're guarding against. With recurrence
    // set and timezone "America/Los_Angeles", the local DTSTART must
    // resolve to PDT Tuesday (June 9), not the UTC day (Wednesday
    // June 10) that the Z-suffixed UTC encoding would produce. The
    // CalDAV server iterates BYDAY=TU in the TZID timezone, which is
    // PDT — so subsequent occurrences land on PDT Tuesdays, not on
    // PDT Mondays as the broken UTC encoding produced.
    const ics = buildVCalendar({
      ...baseInput,
      timezone: "America/Los_Angeles",
      recurrence: "FREQ=WEEKLY;BYDAY=TU",
    });
    // June 9, 2026 IS a Tuesday in America/Los_Angeles.
    expect(ics).toMatch(/^DTSTART;TZID=America\/Los_Angeles:20260609T173000$/m);
    expect(ics).toMatch(/^RRULE:FREQ=WEEKLY;BYDAY=TU$/m);
  });
});
