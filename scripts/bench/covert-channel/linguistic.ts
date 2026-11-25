// Linguistic covert channels driven directly through the deterministic
// semantic scrambler: word choice, contraction form, and grammatical voice.

import { scramble, SYNONYM_RINGS } from "../../../extensions/egress-semantic-scrambler/api.js";
import { accuracyPct, makeRng, padBits, randomBits, reductionPct, type Bit } from "./stats.js";

type LinguisticChannel = {
  name: string;
  bits: number;
  encode(secret: Bit[]): string;
  decode(text: string): Bit[];
};

const CONTRACTION_RE = /[A-Za-z]+['’][A-Za-z]+/;

// --- synonym choice: 1 bit per ring word (member 0 vs member 1) -----------
const synonymChannel: LinguisticChannel = {
  name: "synonym-choice-1bit",
  bits: 24,
  encode(secret) {
    return secret
      .map((bit, i) => `the ${SYNONYM_RINGS[i % SYNONYM_RINGS.length][bit]} case`)
      .join(", ");
  },
  decode(text) {
    const words = [...text.matchAll(/the (\w+) case/g)].map((m) => m[1].toLowerCase());
    const bits: Bit[] = [];
    for (let i = 0; i < this.bits; i++) {
      const ring = SYNONYM_RINGS[i % SYNONYM_RINGS.length];
      const idx = words[i] ? ring.indexOf(words[i]) : -1;
      bits.push(idx >= 1 ? 1 : 0);
    }
    return bits;
  },
};

// --- synonym choice: 2 bits per word, using rings of >= 4 members ---------
const RINGS4 = SYNONYM_RINGS.filter((r) => r.length >= 4);
const synonym2bitChannel: LinguisticChannel = {
  name: "synonym-choice-2bit",
  bits: 24,
  encode(secret) {
    const words: string[] = [];
    for (let i = 0; i < secret.length; i += 2) {
      const idx = (secret[i] << 1) | (secret[i + 1] ?? 0);
      words.push(RINGS4[(i / 2) % RINGS4.length][idx]);
    }
    return words.map((w) => `the ${w} case`).join(", ");
  },
  decode(text) {
    const words = [...text.matchAll(/the (\w+) case/g)].map((m) => m[1].toLowerCase());
    const bits: Bit[] = [];
    for (let w = 0; w < this.bits / 2; w++) {
      const ring = RINGS4[w % RINGS4.length];
      const idx = words[w] ? ring.indexOf(words[w]) : -1;
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
const contractionChannel: LinguisticChannel = {
  name: "contraction-form",
  bits: 24,
  encode(secret) {
    return secret
      .map((bit, i) => CONTRACTION_PAIRS[i % CONTRACTION_PAIRS.length][bit])
      .join(" and ");
  },
  decode(text) {
    const segments = text.split(" and ");
    const bits: Bit[] = [];
    for (let i = 0; i < this.bits; i++) {
      bits.push(segments[i] && CONTRACTION_RE.test(segments[i]) ? 1 : 0);
    }
    return bits;
  },
};

// --- voice: active (0) vs agentive passive (1) ----------------------------
const AGENTS = ["agent", "system", "service", "worker", "daemon"];
const VERBS = ["deleted", "updated", "removed", "copied", "scanned", "logged"];
const OBJECTS = ["file", "record", "entry", "cache", "log", "queue"];
const PASSIVE_RE = /\b(?:was|were)\s+[a-z]+ed\s+by\b/i;
const voiceChannel: LinguisticChannel = {
  name: "voice-active-passive",
  bits: 24,
  encode(secret) {
    return secret
      .map((bit, i) => {
        const agent = AGENTS[i % AGENTS.length];
        const verb = VERBS[i % VERBS.length];
        const object = OBJECTS[i % OBJECTS.length];
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
      bits.push(segments[i] && PASSIVE_RE.test(segments[i]) ? 1 : 0);
    }
    return bits;
  },
};

export const LINGUISTIC_CHANNELS: LinguisticChannel[] = [
  synonymChannel,
  synonym2bitChannel,
  contractionChannel,
  voiceChannel,
];

export type LinguisticStats = {
  name: string;
  bits: number;
  undefendedReductionPct: number;
  scrambledReductionPct: number;
  scrambledAccuracyPct: number;
  detectedPct: number;
  idempotent: boolean;
};

function measure(channel: LinguisticChannel, trials: number, rand: () => number): LinguisticStats {
  const undefended: Array<[Bit, Bit]> = [];
  const defended: Array<[Bit, Bit]> = [];
  let detected = 0;
  let idempotent = true;
  for (let t = 0; t < trials; t++) {
    const secret = randomBits(channel.bits, rand);
    const payload = channel.encode(secret);
    const plain = channel.decode(payload);
    const result = scramble(payload);
    if (result.findings.length > 0) {
      detected++;
    }
    // Re-scrambling a scrambled payload must be a no-op.
    if (scramble(result.text).text !== result.text) {
      idempotent = false;
    }
    const recovered = channel.decode(result.text);
    for (let i = 0; i < channel.bits; i++) {
      undefended.push([secret[i], plain[i]]);
      defended.push([secret[i], recovered[i]]);
    }
  }
  return {
    name: channel.name,
    bits: channel.bits,
    undefendedReductionPct: reductionPct(undefended),
    scrambledReductionPct: reductionPct(defended),
    scrambledAccuracyPct: accuracyPct(defended),
    detectedPct: (detected / trials) * 100,
    idempotent,
  };
}

export function runLinguisticBenchmark(trials = 40): LinguisticStats[] {
  return LINGUISTIC_CHANNELS.map((c) => measure(c, trials, makeRng(0xc0ffee)));
}
