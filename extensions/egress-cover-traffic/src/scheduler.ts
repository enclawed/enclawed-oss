// Cover-traffic scheduling.
//
// A covert channel can encode bits in the *presence or absence* of traffic
// (on-off keying) and in its *rate*. Cover traffic defeats this by keeping the
// channel busy at a steady (or Poisson) rate so an observer cannot tell real
// activity from filler.
//
// Key efficiency rule: real traffic is its own cover. A cover message is only
// emitted when the channel has been idle for at least one mean interval, so an
// active conversation generates little or no filler.

export type CoverTrafficMode = "constant" | "poisson";

/**
 * Inter-arrival delay for the next cover slot. `constant` returns a fixed
 * interval; `poisson` draws an exponential inter-arrival time (memoryless —
 * the timing of one message reveals nothing about the next).
 */
export function nextIntervalMs(
  mode: CoverTrafficMode,
  meanIntervalMs: number,
  rng: () => number = Math.random,
): number {
  const mean = Math.max(1, meanIntervalMs);
  if (mode === "poisson") {
    const u = Math.min(1 - 1e-9, Math.max(1e-9, rng()));
    return Math.max(1, Math.round(-Math.log(u) * mean));
  }
  return mean;
}

export type CoverScheduler = {
  /** Record that a real outbound message was observed. */
  noteRealEgress(now: number): void;
  /** Whether a cover message should be emitted now (channel gone idle). */
  shouldEmit(now: number): boolean;
};

export function createCoverScheduler(opts: { meanIntervalMs: number }): CoverScheduler {
  const idleThreshold = Math.max(1, opts.meanIntervalMs);
  let lastEgress = Number.NEGATIVE_INFINITY;
  return {
    noteRealEgress(now: number): void {
      lastEgress = now;
    },
    shouldEmit(now: number): boolean {
      return now - lastEgress >= idleThreshold;
    },
  };
}
