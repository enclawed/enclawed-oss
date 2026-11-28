// Adversarial measurement of the audio scrambler.
//
// It implements a working ultrasonic covert channel — the attacker hides each
// bit as the presence or absence of an inaudible tone above 20 kHz, riding on
// ordinary audible audio (the basis of real ultrasonic device-to-device
// signalling) — then runs the audio scrambler and has the receiver demodulate
// what survives. Residual capacity is the Miller-Madow-corrected mutual
// information I(secret; recovered).

import { describe, expect, it } from "vitest";
import { fft } from "./fft.js";
import { scrambleAudio } from "./scrambler.js";

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

const SAMPLE_RATE = 48000;
const N = 4096;
const BITS = 24;
const TONE_AMP = 0.15;
const DETECT_THRESHOLD = 30;

/** Ultrasonic frequency carrying bit i: 20.5-22.8 kHz, all inaudible. */
const carrierHz = (i: number): number => 20500 + i * 100;

/** Encode a secret: audible carrier + an ultrasonic tone per 1-bit. */
function encode(secret: Bit[]): Float32Array {
  const s = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    s[i] = 0.5 * Math.sin((2 * Math.PI * 440 * i) / SAMPLE_RATE);
  }
  for (let b = 0; b < secret.length; b++) {
    if (secret[b] !== 1) {
      continue;
    }
    const f = carrierHz(b);
    for (let i = 0; i < N; i++) {
      s[i] = s[i]! + TONE_AMP * Math.sin((2 * Math.PI * f * i) / SAMPLE_RATE);
    }
  }
  return s;
}

/** Receiver: demodulate each ultrasonic bin. */
function decode(samples: Float32Array): Bit[] {
  const re = Float64Array.from(samples);
  const im = new Float64Array(samples.length);
  fft(re, im);
  const bits: Bit[] = [];
  for (let b = 0; b < BITS; b++) {
    const bin = Math.round((carrierHz(b) * samples.length) / SAMPLE_RATE);
    bits.push(Math.hypot(re[bin]!, im[bin]!) > DETECT_THRESHOLD ? 1 : 0);
  }
  return bits;
}

function measure(
  defended: boolean,
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
    const carrier = encode(secret);
    const samples = defended
      ? scrambleAudio({ sampleRate: SAMPLE_RATE, samples: carrier }).audio.samples
      : carrier;
    const recovered = decode(samples);
    for (let i = 0; i < BITS; i++) {
      pairs.push([secret[i]!, recovered[i]!]);
      if (recovered[i] === secret[i]) {
        matched++;
      }
    }
  }
  return {
    reductionPct: (1 - mutualInformationBits(pairs)) * 100,
    accuracyPct: (matched / pairs.length) * 100,
  };
}

describe("audio scrambler — ultrasonic covert-channel adversarial suite", () => {
  it("collapses the ultrasonic covert channel to zero residual capacity", () => {
    const trials = 30;
    const undefended = measure(false, trials, makeRng(0xa0d10));
    const scrambled = measure(true, trials, makeRng(0xa0d10));

    console.log("\n=== audio scrambler — ultrasonic channel ===");
    console.log(
      `undefended   acc ${undefended.accuracyPct.toFixed(1)}%  reduction ${undefended.reductionPct.toFixed(1)}%`,
    );
    console.log(
      `scrambled    acc ${scrambled.accuracyPct.toFixed(1)}%  reduction ${scrambled.reductionPct.toFixed(1)}%`,
    );

    expect(undefended.reductionPct, "undefended").toBeLessThan(5);
    expect(undefended.accuracyPct, "undefended accuracy").toBeGreaterThan(95);
    expect(scrambled.reductionPct, "scrambled").toBeGreaterThanOrEqual(99);
  });
});
