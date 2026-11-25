// Replay-divergence detection.
//
// A covert channel can hide bits in the *variation between repetitions* of an
// otherwise fixed message: an agent that sends "Status: OK" and later
// "Status: OK." (or "status: ok", or with a different trailing space) is
// modulating cosmetic dimensions a human reader ignores — and that is exactly
// where covert bits live.
//
// The sentinel reduces each payload to a `skeleton` (lower-cased, whitespace-
// collapsed, trailing punctuation stripped). Two payloads with the *same*
// skeleton but *different* raw text are a replay with cosmetic-only variation,
// and the diff is reported as covert capacity. Payloads with different
// skeletons (e.g. different order numbers) are legitimate and never flagged.

export type ReplayFinding = {
  severity: "info" | "low" | "medium" | "high";
  code: string;
  message: string;
  estimatedBits: number;
};

export type ReplayResult = { findings: ReplayFinding[] };

export type ReplaySentinel = {
  inspect(sinkId: string, text: string): ReplayResult;
  reset(): void;
};

/** Human-visible skeleton of a payload — cosmetic dimensions removed. */
export function skeleton(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/gu, " ")
    .trim()
    .replace(/[!?.,;:]+$/u, "");
}

/** Upper-bound estimate of the bits carried by the diff between two strings. */
export function estimateDiffBits(a: string, b: string): number {
  let differing = Math.abs(a.length - b.length);
  const common = Math.min(a.length, b.length);
  for (let i = 0; i < common; i++) {
    if (a[i] !== b[i]) {
      differing++;
    }
  }
  return differing;
}

export function createReplaySentinel(opts?: {
  historyPerSink?: number;
  maxSinks?: number;
}): ReplaySentinel {
  const historyPerSink = opts?.historyPerSink ?? 16;
  const maxSinks = opts?.maxSinks ?? 2048;
  const sinks = new Map<string, { skeleton: string; raw: string }[]>();

  return {
    inspect(sinkId: string, text: string): ReplayResult {
      let history = sinks.get(sinkId);
      if (history) {
        // Keep the map in least-recently-used order.
        sinks.delete(sinkId);
        sinks.set(sinkId, history);
      } else {
        if (sinks.size >= maxSinks) {
          // Drop only the least recently used sink, never every history at once.
          const oldest = sinks.keys().next().value;
          if (oldest !== undefined) {
            sinks.delete(oldest);
          }
        }
        history = [];
        sinks.set(sinkId, history);
      }
      const sk = skeleton(text);
      const findings: ReplayFinding[] = [];
      for (const prior of history) {
        if (prior.skeleton === sk && prior.raw !== text) {
          findings.push({
            severity: "medium",
            code: "replay-divergence",
            message:
              "payload repeats a prior message with cosmetic-only variation — " +
              "the difference is a candidate covert channel",
            estimatedBits: estimateDiffBits(prior.raw, text),
          });
          break;
        }
      }
      history.push({ skeleton: sk, raw: text });
      if (history.length > historyPerSink) {
        history.shift();
      }
      return { findings };
    },

    reset(): void {
      sinks.clear();
    },
  };
}
