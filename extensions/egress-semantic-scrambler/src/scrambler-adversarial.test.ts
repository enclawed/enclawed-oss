// Adversarial test suite for the semantic scrambler.
//
// It implements WORKING linguistic covert-channel encoders — the
// exfiltration tooling an attacker would build to hide bits in word and
// grammar choice — with matching receiver-side decoders, drives a uniformly
// random secret through each channel, and measures the residual capacity the
// scrambler leaves.
//
// Residual capacity is the Miller-Madow-corrected mutual information
// I(secret; recovered): a destroyed channel (receiver output independent of
// the secret) yields exactly 0, so capacity reduction 1 - I reaches 100% only
// when the receiver does no better than chance and the joint distribution
// confirms it. Each channel is measured undefended (baseline — the channel is
// real and fully open) and with the scrambler enforcing.

import { describe, expect, it } from "vitest";
import { scramble, SYNONYM_RINGS } from "./scrambler.js";

type Bit = 0 | 1;

/** Deterministic RNG (mulberry32) so the printed statistics are stable. */
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

function padBits(bits: Bit[], n: number): Bit[] {
  const out = bits.slice(0, n);
  while (out.length < n) {
    out.push(0);
  }
  return out;
}

/** Empirical mutual information I(X;Y) in bits/bit, Miller-Madow corrected. */
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
  const statesX = (px[0] > 0 ? 1 : 0) + (px[1] > 0 ? 1 : 0);
  const statesY = (py[0] > 0 ? 1 : 0) + (py[1] > 0 ? 1 : 0);
  return Math.max(0, mi - ((statesX - 1) * (statesY - 1)) / (2 * n * Math.LN2));
}

// --------------------------------------------------------------------------
// linguistic covert channels
// --------------------------------------------------------------------------

type CovertChannel = {
  name: string;
  bits: number;
  encode(secret: Bit[]): string;
  decode(text: string): Bit[];
};

const CONTRACTION_RE = /[A-Za-z]+['’][A-Za-z]+/;

// --- synonym choice: 1 bit per ring word (member 0 vs member 1) -----------
const synonymChannel: CovertChannel = {
  name: "synonym-choice-1bit",
  bits: 24,
  encode(secret) {
    return secret
      .map((bit, i) => `the ${SYNONYM_RINGS[i % SYNONYM_RINGS.length]![bit]} case`)
      .join(", ");
  },
  decode(text) {
    const words = [...text.matchAll(/the (\w+) case/g)].map((m) => m[1]!.toLowerCase());
    const bits: Bit[] = [];
    for (let i = 0; i < this.bits; i++) {
      const ring = SYNONYM_RINGS[i % SYNONYM_RINGS.length]!;
      const idx = words[i] ? ring.indexOf(words[i]!) : -1;
      bits.push(idx >= 1 ? 1 : 0);
    }
    return bits;
  },
};

// --- synonym choice: 2 bits per word, using rings of >= 4 members ---------
const RINGS4 = SYNONYM_RINGS.filter((r) => r.length >= 4);
const synonym2bitChannel: CovertChannel = {
  name: "synonym-choice-2bit",
  bits: 24,
  encode(secret) {
    const words: string[] = [];
    for (let i = 0; i < secret.length; i += 2) {
      const idx = (secret[i]! << 1) | (secret[i + 1] ?? 0);
      words.push(RINGS4[(i / 2) % RINGS4.length]![idx]!);
    }
    return words.map((w) => `the ${w} case`).join(", ");
  },
  decode(text) {
    const words = [...text.matchAll(/the (\w+) case/g)].map((m) => m[1]!.toLowerCase());
    const bits: Bit[] = [];
    for (let w = 0; w < this.bits / 2; w++) {
      const ring = RINGS4[w % RINGS4.length]!;
      const idx = words[w] ? ring.indexOf(words[w]!) : -1;
      const v = idx >= 0 ? idx : 0;
      bits.push(((v >> 1) & 1) as Bit, (v & 1) as Bit);
    }
    return padBits(bits, this.bits);
  },
};

// --- contraction form: contracted (1) vs expanded (0) ---------------------
const CONTRACTION_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["do not", "don't"],
  ["cannot", "can't"],
  ["will not", "won't"],
  ["is not", "isn't"],
  ["are not", "aren't"],
  ["did not", "didn't"],
  ["has not", "hasn't"],
  ["have not", "haven't"],
  ["would not", "wouldn't"],
  ["could not", "couldn't"],
  ["should not", "shouldn't"],
  ["was not", "wasn't"],
];
const contractionChannel: CovertChannel = {
  name: "contraction-form",
  bits: 24,
  encode(secret) {
    return secret
      .map((bit, i) => CONTRACTION_PAIRS[i % CONTRACTION_PAIRS.length]![bit])
      .join(" and ");
  },
  decode(text) {
    const segments = text.split(" and ");
    const bits: Bit[] = [];
    for (let i = 0; i < this.bits; i++) {
      bits.push(segments[i] && CONTRACTION_RE.test(segments[i]!) ? 1 : 0);
    }
    return bits;
  },
};

// --- voice: active (0) vs agentive passive (1) ----------------------------
const AGENTS = ["agent", "system", "service", "worker", "daemon"];
const VERBS = ["deleted", "updated", "removed", "copied", "scanned", "logged"];
const OBJECTS = ["file", "record", "entry", "cache", "log", "queue"];
const PASSIVE_RE = /\b(?:was|were)\s+[a-z]+ed\s+by\b/i;
const voiceChannel: CovertChannel = {
  name: "voice-active-passive",
  bits: 24,
  encode(secret) {
    return secret
      .map((bit, i) => {
        const agent = AGENTS[i % AGENTS.length]!;
        const verb = VERBS[i % VERBS.length]!;
        const object = OBJECTS[i % OBJECTS.length]!;
        return bit === 1
          ? `the ${object} was ${verb} by the ${agent}`
          : `the ${agent} ${verb} the ${object}`;
      })
      .join("; ");
  },
  decode(text) {
    const segments = text.split(";");
    const bits: Bit[] = [];
    for (let i = 0; i < this.bits; i++) {
      bits.push(segments[i] && PASSIVE_RE.test(segments[i]!) ? 1 : 0);
    }
    return bits;
  },
};

const CHANNELS: CovertChannel[] = [
  synonymChannel,
  synonym2bitChannel,
  contractionChannel,
  voiceChannel,
];

// --------------------------------------------------------------------------
// measurement
// --------------------------------------------------------------------------

type Stats = {
  name: string;
  bits: number;
  undefendedReductionPct: number;
  scrambledReductionPct: number;
  scrambledAccuracyPct: number;
  detectedPct: number;
};

function measure(channel: CovertChannel, trials: number, rand: () => number): Stats {
  const undefended: Array<[Bit, Bit]> = [];
  const defended: Array<[Bit, Bit]> = [];
  let matched = 0;
  let detected = 0;

  for (let t = 0; t < trials; t++) {
    const secret = randomBits(channel.bits, rand);
    const payload = channel.encode(secret);

    const plain = channel.decode(payload);
    for (let i = 0; i < channel.bits; i++) {
      undefended.push([secret[i]!, plain[i]!]);
    }

    const result = scramble(payload);
    if (result.findings.length > 0) {
      detected++;
    }
    const recovered = channel.decode(result.text);
    for (let i = 0; i < channel.bits; i++) {
      defended.push([secret[i]!, recovered[i]!]);
      if (recovered[i] === secret[i]) {
        matched++;
      }
    }
  }

  return {
    name: channel.name,
    bits: channel.bits,
    undefendedReductionPct: (1 - mutualInformationBits(undefended)) * 100,
    scrambledReductionPct: (1 - mutualInformationBits(defended)) * 100,
    scrambledAccuracyPct: (matched / defended.length) * 100,
    detectedPct: (detected / trials) * 100,
  };
}

describe("semantic scrambler — linguistic covert-channel adversarial suite", () => {
  it("collapses every linguistic covert channel and reports statistics", () => {
    const rows = CHANNELS.map((c) => measure(c, 40, makeRng(0xc0ffee)));

    const fmt = (n: number, w: number) => n.toFixed(1).padStart(w);
    console.log("\n=== semantic scrambler — linguistic covert channels ===");
    console.log("channel                enc  undef-red%  scram-red%  scram-acc%  detect%");
    for (const r of rows) {
      console.log(
        `${r.name.padEnd(22)} ${String(r.bits).padStart(3)}  ` +
          `${fmt(r.undefendedReductionPct, 10)}  ${fmt(r.scrambledReductionPct, 10)}  ` +
          `${fmt(r.scrambledAccuracyPct, 10)}  ${fmt(r.detectedPct, 7)}`,
      );
    }
    const meanScrambled = rows.reduce((a, r) => a + r.scrambledReductionPct, 0) / rows.length;
    console.log(`mean capacity reduction (scrambler): ${meanScrambled.toFixed(1)}%`);

    for (const r of rows) {
      // Baseline: the channel is real — undefended, it carries its payload.
      expect(r.undefendedReductionPct, `${r.name} undefended`).toBeLessThan(5);
      // Defended: the scrambler collapses it to zero residual capacity.
      expect(r.scrambledReductionPct, `${r.name} scrambled`).toBeGreaterThanOrEqual(99);
      // And it is flagged in the audit trail in every trial.
      expect(r.detectedPct, `${r.name} detected`).toBe(100);
    }
    expect(meanScrambled).toBeGreaterThanOrEqual(99);
  });

  it("is idempotent — a re-scrambled covert payload cannot be re-opened", () => {
    const rand = makeRng(0x5eed);
    for (const channel of CHANNELS) {
      const payload = channel.encode(randomBits(channel.bits, rand));
      const once = scramble(payload).text;
      expect(scramble(once).text, `${channel.name} idempotence`).toBe(once);
    }
  });
});
