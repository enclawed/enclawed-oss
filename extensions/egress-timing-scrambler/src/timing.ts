// Timing-interval scrambler.
//
// A side-channel disruptor: it injects a completely random delay before every
// outbound message, so the *observed* send time no longer tracks the time the
// agent decided to send. An attacker modulating inter-message gaps to encode
// bits sees each gap perturbed by the difference of two independent random
// delays, which swamps a fine timing signal.
//
// This is the cheap, always-on complement to the behavioral stage's
// constant-rate paced release. Random delay *reduces* timing-channel capacity
// — the more delay budget, the more it reduces — but, unlike deterministic
// constant-rate release, it does not drive capacity provably to zero
// (cf. the traffic-analysis result that efficient jitter countermeasures
// leak). It is also far less intrusive: it adds bounded latency without
// queueing or pinning a cadence.

import { randomInt } from "node:crypto";

export type TimingScramblerOptions = {
  /** Minimum injected delay (ms). */
  minDelayMs: number;
  /** Maximum injected delay (ms). The delay is drawn uniformly in range. */
  maxDelayMs: number;
};

export const defaultTimingScramblerOptions: TimingScramblerOptions = {
  minDelayMs: 0,
  maxDelayMs: 750,
};

/**
 * Draw a uniformly random delay in `[minDelayMs, maxDelayMs]`. By default the
 * draw uses the cryptographic RNG so the delay an attacker observes is
 * unpredictable and cannot be cancelled out; an explicit `rng` (returning a
 * float in [0,1)) can be supplied for deterministic tests.
 */
export function randomDelayMs(
  options?: Partial<TimingScramblerOptions>,
  rng?: () => number,
): number {
  const opts = { ...defaultTimingScramblerOptions, ...options };
  const lo = Math.max(0, Math.floor(opts.minDelayMs));
  const hi = Math.max(lo, Math.floor(opts.maxDelayMs));
  if (hi === lo) {
    return lo;
  }
  if (rng) {
    return lo + Math.floor(rng() * (hi - lo + 1));
  }
  return randomInt(lo, hi + 1);
}
