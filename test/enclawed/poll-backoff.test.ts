// Backoff for the executive assistant's inbox poll loop.
//
// Field failure this pins: with an expired app password every poll threw
// AUTHENTICATIONFAILED. A thrown poll reports no activity, and the loop's
// fast-idle path keys only on "no activity and nothing in flight", so a
// hard-failing poll was treated exactly like a quiet inbox and retried
// every 500ms. Observed on a live install: ~2 requests/second at a server
// rejecting our credentials, a 537KB service log, and an audit trail
// growing purely from failures — plus the real risk of the provider
// locking the account for repeated failed auth.

import { describe, expect, it } from "vitest";
import { resolvePollSleepMs } from "../../enclawed-apps/executive-assistant/src/scheduler/poll-backoff.ts";

const POLL_MS = 15_000;
const base = { pollMs: POLL_MS, inFlightCount: 0, consecutiveFailures: 0 };

describe("resolvePollSleepMs", () => {
  it("idles at the CONFIGURED cadence, never faster", () => {
    // The regression this pins cost 810MB and half a million mailbox reads.
    // The idle interval used to default to 500ms, which ran ten times faster
    // than the configured 5s -- and since the loop is idle almost always, the
    // configured value never applied at all.
    expect(resolvePollSleepMs({ ...base, activity: false })).toBe(base.pollMs);
    expect(resolvePollSleepMs({ ...base, activity: false })).toBeGreaterThanOrEqual(base.pollMs);
  });

  it("uses the configured interval when work happened or is in flight", () => {
    expect(resolvePollSleepMs({ ...base, activity: true })).toBe(POLL_MS);
    expect(resolvePollSleepMs({ ...base, activity: false, inFlightCount: 3 })).toBe(POLL_MS);
  });

  it("does NOT take the fast path when the poll failed", () => {
    // The whole point: a failing poll looks idle, but must not be
    // retried at idle speed.
    const sleep = resolvePollSleepMs({ ...base, activity: false, consecutiveFailures: 1 });
    expect(sleep).toBeGreaterThan(500);
    expect(sleep).toBe(POLL_MS);
  });

  it("doubles while failures persist", () => {
    const at = (n: number) =>
      resolvePollSleepMs({ ...base, activity: false, consecutiveFailures: n });
    expect(at(1)).toBe(POLL_MS);
    expect(at(2)).toBe(POLL_MS * 2);
    expect(at(3)).toBe(POLL_MS * 4);
    expect(at(5)).toBe(POLL_MS * 16);
  });

  it("caps the backoff so the loop never sleeps unboundedly", () => {
    const capped = resolvePollSleepMs({ ...base, activity: false, consecutiveFailures: 40 });
    expect(capped).toBe(5 * 60_000);
    expect(Number.isFinite(capped)).toBe(true);
  });

  it("returns to the fast path immediately once a poll succeeds", () => {
    expect(resolvePollSleepMs({ ...base, activity: false, consecutiveFailures: 12 })).toBe(
      5 * 60_000,
    );
    expect(resolvePollSleepMs({ ...base, activity: false, consecutiveFailures: 0 })).toBe(
      base.pollMs,
    );
  });

  it("still honours an explicit idle interval, for a caller that wants faster", () => {
    // Sub-second pickup is still available -- it just has to be asked for
    // rather than being the silent default.
    expect(resolvePollSleepMs({ ...base, activity: false, idleSleepMs: 500 })).toBe(500);
  });

  it("never sleeps less than the idle interval even with a tiny pollMs", () => {
    // A 10ms pollMs with one failure would back off to 10ms; the floor keeps
    // a misconfigured interval from becoming a retry storm.
    expect(
      resolvePollSleepMs({
        activity: false,
        inFlightCount: 0,
        consecutiveFailures: 1,
        pollMs: 10,
        idleSleepMs: 500,
      }),
    ).toBe(500);
  });
});
