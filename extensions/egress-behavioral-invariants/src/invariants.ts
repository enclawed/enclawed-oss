// Behavioral invariants — stateful rate-limiting and side-channel shaping.
//
// This is the side-channel layer. It keeps per-sink state across messages and
// enforces invariants on the *observable properties* of egress that an
// attacker can modulate to leak data:
//   - rate / volume   : messages and bytes per rolling window (slow-drip exfil)
//   - inter-arrival   : a minimum interval (anti-burst)
//   - timing quantum  : send times snapped to a fixed grid + jitter, so *when*
//                       a message is sent carries no bits
//   - periodicity     : near-constant intervals flagged as a timing channel
//
// `evaluate` returns a single decision; precedence is cancel > delay > pass.

import type { EgressDecision } from "@enclawed/egress-core";

export type BehavioralOptions = {
  /** Rolling window for the rate/volume invariants. */
  windowMs: number;
  /** Max messages permitted per window. */
  maxMessagesPerWindow: number;
  /** Max bytes permitted per window. */
  maxBytesPerWindow: number;
  /** Minimum spacing between messages (0 disables). */
  minIntervalMs: number;
  /** Send-time quantization grid in ms (0 disables). */
  timingQuantumMs: number;
  /** Random jitter added on top of quantization (0 disables). */
  jitterMs: number;
  /**
   * Constant-rate paced release in ms (0 disables). When set, consecutive
   * messages are released at least `releaseCadenceMs` apart. An attacker
   * sending faster than the cadence to encode bits sees every release pinned
   * to a fixed interval, so the observed inter-send gap carries no
   * information — the strongest timing-channel mitigation.
   */
  releaseCadenceMs: number;
  /** Interval samples required before periodicity is judged. */
  periodicityMinSamples: number;
  /** Coefficient-of-variation below which intervals are "too regular". */
  periodicityCovThreshold: number;
  /** Bound on tracked sinks (CWE-400). */
  maxSinks: number;
};

export const defaultBehavioralOptions: BehavioralOptions = {
  windowMs: 60_000,
  maxMessagesPerWindow: 60,
  maxBytesPerWindow: 262_144,
  minIntervalMs: 0,
  timingQuantumMs: 0,
  jitterMs: 0,
  releaseCadenceMs: 0,
  periodicityMinSamples: 8,
  periodicityCovThreshold: 0.08,
  maxSinks: 4096,
};

export type BehavioralFinding = {
  severity: "info" | "low" | "medium" | "high";
  code: string;
  message: string;
};

export type BehavioralEvaluation = {
  decision: EgressDecision;
  findings: BehavioralFinding[];
};

export type BehavioralMonitor = {
  evaluate(
    sinkId: string,
    now: number,
    contentLength: number,
    enforce: boolean,
  ): BehavioralEvaluation;
  reset(): void;
};

/** Coefficient of variation (stddev / mean) of a sample. */
export function coefficientOfVariation(samples: readonly number[]): number {
  if (samples.length === 0) {
    return Number.POSITIVE_INFINITY;
  }
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  if (mean === 0) {
    return 0;
  }
  const variance = samples.reduce((a, b) => a + (b - mean) ** 2, 0) / samples.length;
  return Math.sqrt(variance) / mean;
}

type SinkState = {
  events: { ts: number; bytes: number }[];
  intervals: number[];
  lastReleaseTs: number | null;
};

export function createBehavioralMonitor(
  options?: Partial<BehavioralOptions>,
  rng: () => number = Math.random,
): BehavioralMonitor {
  const opts = { ...defaultBehavioralOptions, ...options };
  const sinks = new Map<string, SinkState>();
  // Shared by new sinks once the map is full and no sink is idle, so a flood
  // of fresh sink ids cannot reset the window of a busy sink.
  let overflow: SinkState | null = null;

  function stateFor(sinkId: string, now: number): SinkState {
    const existing = sinks.get(sinkId);
    if (existing) {
      return existing;
    }
    if (sinks.size >= opts.maxSinks) {
      // Evict only a sink with nothing left in its rolling window: dropping it
      // forgets no rate or volume the invariant still counts.
      const cutoff = now - opts.windowMs;
      let evicted = false;
      for (const [id, state] of sinks) {
        if (state.events.every((e) => e.ts < cutoff)) {
          sinks.delete(id);
          evicted = true;
          break;
        }
      }
      if (!evicted) {
        overflow ??= { events: [], intervals: [], lastReleaseTs: null };
        return overflow;
      }
    }
    const state: SinkState = { events: [], intervals: [], lastReleaseTs: null };
    sinks.set(sinkId, state);
    return state;
  }

  return {
    evaluate(sinkId, now, contentLength, enforce): BehavioralEvaluation {
      const state = stateFor(sinkId, now);
      const findings: BehavioralFinding[] = [];

      // Drop events outside the rolling window.
      const cutoff = now - opts.windowMs;
      state.events = state.events.filter((e) => e.ts >= cutoff);

      const count = state.events.length;
      const bytes = state.events.reduce((n, e) => n + e.bytes, 0);
      const lastTs = count > 0 ? state.events[count - 1]!.ts : null;

      // --- rate / volume invariant ---
      const overMessages = count + 1 > opts.maxMessagesPerWindow;
      const overBytes = bytes + contentLength > opts.maxBytesPerWindow;
      if (overMessages || overBytes) {
        findings.push({
          severity: "high",
          code: "rate-limit",
          message: `egress rate/volume invariant exceeded (${count + 1} msgs, ${
            bytes + contentLength
          } bytes / ${opts.windowMs}ms window)`,
        });
        if (enforce) {
          // Blocked — do not record the event.
          return {
            decision: { action: "cancel", reason: "egress rate/volume invariant exceeded" },
            findings,
          };
        }
        // Audit: the message still goes; record it and report the breach.
        state.events.push({ ts: now, bytes: contentLength });
        return {
          decision: { action: "cancel", reason: "egress rate/volume invariant exceeded" },
          findings,
        };
      }

      // --- timing: minimum interval + quantization ---
      let delayMs = 0;
      if (opts.minIntervalMs > 0 && lastTs !== null) {
        const gap = now - lastTs;
        if (gap < opts.minIntervalMs) {
          delayMs = opts.minIntervalMs - gap;
        }
      }
      if (opts.timingQuantumMs > 0) {
        const target = now + delayMs;
        const quantized = Math.ceil(target / opts.timingQuantumMs) * opts.timingQuantumMs;
        delayMs = quantized - now;
        if (opts.jitterMs > 0) {
          delayMs += Math.floor(rng() * opts.jitterMs);
        }
      }
      // Constant-rate paced release: pin consecutive releases at least one
      // cadence apart so the observed inter-send interval is input-independent.
      if (opts.releaseCadenceMs > 0) {
        const earliest = now + delayMs;
        const releaseTs =
          state.lastReleaseTs === null
            ? earliest
            : Math.max(earliest, state.lastReleaseTs + opts.releaseCadenceMs);
        delayMs = releaseTs - now;
        state.lastReleaseTs = releaseTs;
      }

      // --- periodicity (timing-channel) detection ---
      if (lastTs !== null) {
        state.intervals.push(now - lastTs);
        if (state.intervals.length > 64) {
          state.intervals.shift();
        }
      }
      if (state.intervals.length >= opts.periodicityMinSamples) {
        const cov = coefficientOfVariation(state.intervals);
        if (cov < opts.periodicityCovThreshold) {
          findings.push({
            severity: "medium",
            code: "periodic-egress",
            message: `near-constant inter-message interval (CoV ${cov.toFixed(
              3,
            )}) — possible timing channel`,
          });
        }
      }

      state.events.push({ ts: now, bytes: contentLength });
      return {
        decision: delayMs > 0 ? { action: "delay", delayMs } : { action: "pass" },
        findings,
      };
    },

    reset(): void {
      sinks.clear();
      overflow = null;
    },
  };
}
