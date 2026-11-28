// Timing side channel: inter-send gaps encode bits. Measured against
//   - the behavioral monitor (quantization only, and constant-rate paced
//     release, the paper's strongest configuration), and
//   - the egress-timing-scrambler's random-delay budget.

import {
  randomDelayMs,
  resolveTimingScramblerConfig,
} from "../../../extensions/egress-timing-scrambler/api.js";
import { accuracyPct, makeRng, randomBits, reductionPct, type Bit } from "./stats.js";
import { measureTimingChannel } from "./text.js";

export type TimingRow = { defense: string; reductionPct: number; receiverAccPct: number };

function measureRandomDelay(maxDelayMs: number, trials: number, seed: number): TimingRow {
  const SLOT_MS = 1000;
  const SHORT = 120;
  const LONG = 640;
  const BITS = 16;
  const rand = makeRng(seed);
  // Defended rows go through the plugin-config resolver (the operator-facing
  // options, which refuse a spread below the shipped 750 ms). The undefended
  // baseline is the channel with no scrambler at all, so it adds no delay.
  const delay =
    maxDelayMs === 0
      ? () => 0
      : (() => {
          const { options } = resolveTimingScramblerConfig({ minDelayMs: 0, maxDelayMs });
          return () => randomDelayMs(options, rand);
        })();
  const pairs: Array<[Bit, Bit]> = [];
  for (let t = 0; t < trials; t++) {
    const secret = randomBits(BITS, rand);
    const observed: number[] = [];
    let intended = 1_000_000;
    for (let i = 0; i < BITS; i++) {
      intended += SLOT_MS + (secret[i] === 1 ? LONG : SHORT);
      observed.push(intended + delay());
    }
    for (let i = 1; i < BITS; i++) {
      const gap = observed[i] - observed[i - 1];
      pairs.push([secret[i], (gap - SLOT_MS > (SHORT + LONG) / 2 ? 1 : 0) as Bit]);
    }
  }
  return {
    defense: maxDelayMs === 0 ? "undefended" : `random delay <= ${maxDelayMs} ms`,
    reductionPct: reductionPct(pairs),
    receiverAccPct: accuracyPct(pairs),
  };
}

export function runTimingBenchmark(trials = 20): TimingRow[] {
  const none = measureTimingChannel(trials, makeRng(0x5678), {});
  const quantOnly = measureTimingChannel(trials, makeRng(0x5678), {
    timingQuantumMs: 1000,
    jitterMs: 250,
  });
  const paced = measureTimingChannel(trials, makeRng(0x5678), { releaseCadenceMs: 2000 });
  return [
    measureRandomDelay(0, trials * 3, 0x7104a9),
    measureRandomDelay(750, trials * 3, 0xabcdef),
    measureRandomDelay(4000, trials * 3, 0xabcdef),
    {
      defense: "behavioral: no timing defense",
      reductionPct: none.reductionPct,
      receiverAccPct: none.accuracyPct,
    },
    {
      defense: "behavioral: quantization 1 s + 250 ms jitter",
      reductionPct: quantOnly.reductionPct,
      receiverAccPct: quantOnly.accuracyPct,
    },
    {
      defense: "behavioral: constant-rate paced release (2 s)",
      reductionPct: paced.reductionPct,
      receiverAccPct: paced.accuracyPct,
    },
  ];
}
