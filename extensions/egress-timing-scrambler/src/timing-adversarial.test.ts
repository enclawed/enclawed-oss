// Adversarial measurement of the timing-interval scrambler.
//
// It implements a working timing covert channel — the attacker encodes a bit
// in each inter-message gap — then injects the scrambler's random delay and
// has the receiver recover bits from the OBSERVED send times. Residual
// capacity is the Miller-Madow-corrected mutual information I(secret;recovered).
//
// The point the statistics make: random delay reduces timing-channel capacity,
// and the reduction scales with the delay budget — but, consistent with the
// traffic-analysis literature, a modest budget leaves a residual where the
// behavioral stage's constant-rate paced release would close it outright.

import { describe, expect, it } from "vitest";
import { randomDelayMs } from "./timing.js";

type Bit = 0 | 1;

function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomBits(n: number, rand: () => number): Bit[] {
  return Array.from({ length: n }, () => (rand() < 0.5 ? 0 : 1) as Bit);
}

function mutualInformationBits(pairs: ReadonlyArray<readonly [Bit, Bit]>): number {
  const n = pairs.length;
  if (n === 0) {
    return 0;
  }
  const joint = [
    [0, 0],
    [0, 0],
  ];
  for (const [x, y] of pairs) {
    joint[x][y]++;
  }
  const px = [joint[0][0] + joint[0][1], joint[1][0] + joint[1][1]];
  const py = [joint[0][0] + joint[1][0], joint[0][1] + joint[1][1]];
  let mi = 0;
  for (let x = 0; x < 2; x++) {
    for (let y = 0; y < 2; y++) {
      if (joint[x][y] === 0) {
        continue;
      }
      const pxy = joint[x][y] / n;
      mi += pxy * Math.log2(pxy / ((px[x] / n) * (py[y] / n)));
    }
  }
  const sx = (px[0] > 0 ? 1 : 0) + (px[1] > 0 ? 1 : 0);
  const sy = (py[0] > 0 ? 1 : 0) + (py[1] > 0 ? 1 : 0);
  return Math.max(0, mi - ((sx - 1) * (sy - 1)) / (2 * n * Math.LN2));
}

// The attacker's timing covert channel.
const SLOT_MS = 1000;
const SHORT = 120; // gap encoding bit 0
const LONG = 640; // gap encoding bit 1
const BITS = 16;

/** Measure the timing channel with `maxDelayMs` of random scrambling. */
function measure(
  maxDelayMs: number,
  trials: number,
  rand: () => number,
): {
  reductionPct: number;
  accuracyPct: number;
} {
  const pairs: Array<[Bit, Bit]> = [];
  let matched = 0;
  for (let t = 0; t < trials; t++) {
    const secret = randomBits(BITS, rand);
    const observed: number[] = [];
    let intended = 1_000_000;
    for (let i = 0; i < BITS; i++) {
      intended += SLOT_MS + (secret[i] === 1 ? LONG : SHORT);
      const delay = randomDelayMs({ minDelayMs: 0, maxDelayMs }, rand);
      observed.push(intended + delay);
    }
    for (let i = 1; i < BITS; i++) {
      const gap = observed[i]! - observed[i - 1]!;
      const guess: Bit = gap - SLOT_MS > (SHORT + LONG) / 2 ? 1 : 0;
      pairs.push([secret[i]!, guess]);
      if (guess === secret[i]) {
        matched++;
      }
    }
  }
  return {
    reductionPct: (1 - mutualInformationBits(pairs)) * 100,
    accuracyPct: (matched / pairs.length) * 100,
  };
}

describe("timing-interval scrambler — adversarial measurement", () => {
  it("reduces timing-channel capacity, scaling with the delay budget", () => {
    const trials = 60;
    const undefended = measure(0, trials, makeRng(0x7104a9));
    const modest = measure(750, trials, makeRng(0xabcdef));
    const aggressive = measure(4000, trials, makeRng(0xabcdef));

    const fmt = (n: number) => n.toFixed(1).padStart(7);
    console.log("\n=== timing-interval scrambler (random delay) ===");
    console.log("config                 acc%   reduction%");
    console.log(
      `undefended          ${fmt(undefended.accuracyPct)}  ${fmt(undefended.reductionPct)}`,
    );
    console.log(`maxDelay 750ms       ${fmt(modest.accuracyPct)}  ${fmt(modest.reductionPct)}`);
    console.log(
      `maxDelay 4000ms      ${fmt(aggressive.accuracyPct)}  ${fmt(aggressive.reductionPct)}`,
    );

    // Baseline: undefended, the timing channel is real and fully open.
    expect(undefended.reductionPct, "undefended").toBeLessThan(5);
    // A modest budget already reduces the channel substantially.
    expect(modest.reductionPct, "modest budget").toBeGreaterThan(undefended.reductionPct + 20);
    // A large budget drives residual capacity to near zero.
    expect(aggressive.reductionPct, "aggressive budget").toBeGreaterThanOrEqual(95);
    // More budget never reduces less.
    expect(aggressive.reductionPct).toBeGreaterThanOrEqual(modest.reductionPct);
  });
});
