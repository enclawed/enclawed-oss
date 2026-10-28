// Pure sleep policy for the inbox poll loop. Kept free of framework
// imports so it is unit-testable without the workspace resolution the
// scheduler itself needs.

/**
 * How long to wait before the next poll.
 *
 * A poll that THREW also reports no activity, so a failing poll used to take
 * the idle path — with rejected credentials the loop hammered the IMAP server
 * about twice a second, flooding the log and the audit trail and risking the
 * provider locking the account for repeated failed auth. Back off
 * exponentially while failures persist, and return to the normal cadence on
 * the first success.
 *
 * The idle interval defaults to the CONFIGURED poll interval, and that is the
 * important part. It used to default to 500ms, which meant the idle path ran
 * ten times faster than the operator's configured 5s — and since the loop is
 * idle almost always, the configured value never applied at all. Measured on
 * a live install: 508,803 polls in 4.8 days, a median gap of 0.70s, to process
 * eight messages. Each poll is a gated read of the mailbox, so it is also
 * three audit records; the log reached 810MB.
 *
 * An idle loop should not run FASTER than its configured cadence. A caller
 * that genuinely wants sub-second pickup can still ask for it explicitly.
 */
export function resolvePollSleepMs(params: {
  activity: boolean;
  inFlightCount: number;
  consecutiveFailures: number;
  pollMs: number;
  idleSleepMs?: number;
  maxBackoffMs?: number;
}): number {
  const idleSleepMs = params.idleSleepMs ?? params.pollMs;
  const maxBackoffMs = params.maxBackoffMs ?? 5 * 60_000;
  if (params.consecutiveFailures > 0) {
    const exponent = Math.min(params.consecutiveFailures - 1, 20);
    const backoff = params.pollMs * 2 ** exponent;
    return Math.min(Math.max(backoff, idleSleepMs), maxBackoffMs);
  }
  return !params.activity && params.inFlightCount === 0 ? idleSleepMs : params.pollMs;
}
