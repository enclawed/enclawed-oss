// RRULE acceptance + normalization tests for the CalDAV bridge.
//
// The secretary's reply LLM emits a `recurrence` value through the
// `create_calendar_event` tool. The bridge's normalizeRrule() is the
// single chokepoint that decides whether that value reaches the
// VCALENDAR body. The tests below pin (a) the malformed inputs that
// must produce undefined (so the event lands as a one-off rather than
// corrupting the iCal), and (b) the well-formed inputs that must
// round-trip canonicalized.

import { describe, expect, it } from "vitest";
import { normalizeRrule } from "./caldav-transport.js";

describe("normalizeRrule", () => {
  describe("accepts valid RRULE values", () => {
    const valid = [
      ["FREQ=DAILY", "FREQ=DAILY"],
      ["FREQ=WEEKLY;BYDAY=TU", "FREQ=WEEKLY;BYDAY=TU"],
      ["FREQ=WEEKLY;BYDAY=MO,WE,FR", "FREQ=WEEKLY;BYDAY=MO,WE,FR"],
      ["FREQ=DAILY;COUNT=10", "FREQ=DAILY;COUNT=10"],
      ["FREQ=MONTHLY;BYMONTHDAY=15", "FREQ=MONTHLY;BYMONTHDAY=15"],
      ["FREQ=YEARLY;BYMONTH=6;BYMONTHDAY=1", "FREQ=YEARLY;BYMONTH=6;BYMONTHDAY=1"],
      [
        "FREQ=WEEKLY;BYDAY=TU;UNTIL=20271231T000000Z",
        "FREQ=WEEKLY;BYDAY=TU;UNTIL=20271231T000000Z",
      ],
    ];
    for (const [input, expected] of valid) {
      it(`"${input}"`, () => {
        expect(normalizeRrule(input)).toBe(expected);
      });
    }
  });

  describe("strips an accidental RRULE: prefix", () => {
    it('"RRULE:FREQ=WEEKLY;BYDAY=TU" -> "FREQ=WEEKLY;BYDAY=TU"', () => {
      expect(normalizeRrule("RRULE:FREQ=WEEKLY;BYDAY=TU")).toBe("FREQ=WEEKLY;BYDAY=TU");
    });
    it("case-insensitive RRULE: prefix", () => {
      expect(normalizeRrule("rrule:FREQ=DAILY")).toBe("FREQ=DAILY");
    });
  });

  describe("uppercases keys", () => {
    it('"freq=weekly;byday=TU" -> "FREQ=weekly;BYDAY=TU"', () => {
      // Values stay as written (BYDAY codes are case-sensitive vocabulary
      // strings the server interprets); only KEY names are uppercased.
      expect(normalizeRrule("freq=WEEKLY;byday=TU")).toBe("FREQ=WEEKLY;BYDAY=TU");
    });
  });

  describe("rejects malformed input", () => {
    const invalid: [string, unknown][] = [
      ["missing FREQ", "BYDAY=TU"],
      ["invalid FREQ vocab", "FREQ=BIWEEKLY"],
      ["empty string", ""],
      ["whitespace only", "   "],
      ["bare key, no =", "FREQ"],
      ["= but no value", "FREQ="],
      ["= but no key", "=WEEKLY"],
      ["null", null],
      ["number", 42],
      ["undefined", undefined],
      ["object", { FREQ: "DAILY" }],
    ];
    for (const [label, input] of invalid) {
      it(label, () => {
        expect(normalizeRrule(input)).toBeUndefined();
      });
    }
  });
});
