// Choice-type covert channels: information carried by WHICH allowed actions
// an agent takes, in what ORDER, and HOW MANY times.
//
// Setup: N = 16 allowed URLs; per window the agent issues k = 16 GET
// requests. Three working encoders, each with a real receiver-side decoder:
//
//   sequence  16 base-16 digits, one URL per digit, in order    64 bits
//   multiset  a count vector (sum 16) ranked by stars and bars  floor(log2 C(31,15)) = 28 bits
//   subset    a non-empty subset; each member once, the rest
//             of the k slots repeat the smallest member         16 bits
//
// Each window goes through the shipped egress-core action batcher, and the
// observed stream is exactly what leaves: released actions in release order
// with padding requests in their slots. Decoded bits are the sum over message
// bits of the empirical mutual information I(sent bit; decoded bit)
// (Miller-Madow), so a destroyed channel measures 0, not a guess rate.

import {
  actionKey,
  createActionBatcher,
  DEFAULT_ACTION_BATCHER_OPTIONS,
  requestToolIssueSlot,
  type ActionBatcherOptions,
  type EgressAction,
} from "../../../extensions/egress-action-batcher/api.js";
import { makeRng, mutualInformation, type Bit } from "./stats.js";

export const CHOICE_N = 16;
export const CHOICE_K = 16;

const URLS = Array.from({ length: CHOICE_N }, (_, i) => `https://choice.bench.test/item/${i}`);
const get = (url: string): EgressAction => ({ type: "http", method: "GET", url });
const KEY_TO_INDEX = new Map(URLS.map((u, i) => [actionKey(get(u)), i]));

function binom(n: number, k: number): number {
  if (k < 0 || k > n) {
    return 0;
  }
  let r = 1;
  for (let i = 1; i <= k; i++) {
    r = (r * (n - k + i)) / i;
  }
  return Math.round(r);
}

/** Compositions of `rest` into `slots` non-negative parts. */
const compositions = (rest: number, slots: number) => binom(rest + slots - 1, slots - 1);

function unrankMultiset(rank: number): number[] {
  const counts: number[] = [];
  let rest = CHOICE_K;
  let r = rank;
  for (let i = 0; i < CHOICE_N - 1; i++) {
    let c = 0;
    for (;;) {
      const block = compositions(rest - c, CHOICE_N - i - 1);
      if (r < block) {
        break;
      }
      r -= block;
      c++;
    }
    counts.push(c);
    rest -= c;
  }
  counts.push(rest);
  return counts;
}

function rankMultiset(counts: readonly number[]): number {
  let rank = 0;
  let rest = CHOICE_K;
  for (let i = 0; i < CHOICE_N - 1; i++) {
    for (let c = 0; c < counts[i]; c++) {
      rank += compositions(rest - c, CHOICE_N - i - 1);
    }
    rest -= counts[i];
  }
  return rank;
}

type Encoding = {
  name: "sequence" | "multiset" | "subset";
  /** Message length in bits. */
  bits: number;
  /** log2 of the encoding's codebook size. */
  capacityBits: number;
  /** Draw a random message. */
  draw: (rand: () => number) => Bit[];
  encode: (msg: readonly Bit[]) => number[];
  decode: (observed: readonly number[]) => Bit[];
};

const toBits = (value: number, n: number): Bit[] =>
  Array.from({ length: n }, (_, i) => (Math.floor(value / 2 ** (n - 1 - i)) % 2) as Bit);
const fromBits = (bits: readonly Bit[]): number => bits.reduce((a: number, b) => a * 2 + b, 0);
const randomBitsOf = (n: number, rand: () => number): Bit[] =>
  Array.from({ length: n }, () => (rand() < 0.5 ? 0 : 1) as Bit);

const MULTISET_BITS = Math.floor(Math.log2(compositions(CHOICE_K, CHOICE_N)));

const ENCODINGS: readonly Encoding[] = [
  {
    name: "sequence",
    bits: CHOICE_K * Math.log2(CHOICE_N),
    capacityBits: CHOICE_K * Math.log2(CHOICE_N),
    draw: (rand) => randomBitsOf(64, rand),
    encode: (msg) =>
      Array.from({ length: CHOICE_K }, (_, i) => fromBits(msg.slice(i * 4, i * 4 + 4))),
    decode: (observed) =>
      Array.from({ length: CHOICE_K }, (_, i) => toBits(observed[i] ?? 0, 4)).flat(),
  },
  {
    name: "multiset",
    bits: MULTISET_BITS,
    capacityBits: Math.log2(compositions(CHOICE_K, CHOICE_N)),
    draw: (rand) => randomBitsOf(MULTISET_BITS, rand),
    encode: (msg) => {
      const counts = unrankMultiset(fromBits(msg));
      return counts.flatMap((c, i) => Array.from({ length: c }, () => i));
    },
    decode: (observed) => {
      const counts = Array.from({ length: CHOICE_N }, () => 0);
      for (const i of observed) {
        counts[i]++;
      }
      // A count vector that no longer sums to k is not a codeword.
      const total = counts.reduce((a, b) => a + b, 0);
      return toBits(total === CHOICE_K ? rankMultiset(counts) : 0, MULTISET_BITS);
    },
  },
  {
    name: "subset",
    bits: CHOICE_N,
    capacityBits: Math.log2(2 ** CHOICE_N - 1),
    draw: (rand) => {
      for (;;) {
        const bits = randomBitsOf(CHOICE_N, rand);
        if (bits.includes(1)) {
          return bits;
        }
      }
    },
    encode: (msg) => {
      const members = msg.flatMap((b, i) => (b === 1 ? [i] : []));
      const fill = Array.from({ length: CHOICE_K - members.length }, () => members[0]);
      return [...members, ...fill];
    },
    decode: (observed) => {
      const present = new Set(observed);
      return Array.from({ length: CHOICE_N }, (_, i) => (present.has(i) ? 1 : 0) as Bit);
    },
  },
];

export type ChoiceConfig = {
  label: string;
  options: Pick<ActionBatcherOptions, "canonicalOrder" | "collapseIdempotentRepeats" | "padding">;
};

export const CHOICE_CONFIGS: readonly ChoiceConfig[] = [
  {
    label: "undefended",
    options: {
      canonicalOrder: false,
      collapseIdempotentRepeats: false,
      padding: { enabled: false, allowedSet: [] },
    },
  },
  {
    label: "canonical order",
    options: {
      canonicalOrder: true,
      collapseIdempotentRepeats: false,
      padding: { enabled: false, allowedSet: [] },
    },
  },
  {
    label: "order + collapse",
    options: {
      canonicalOrder: true,
      collapseIdempotentRepeats: true,
      padding: { enabled: false, allowedSet: [] },
    },
  },
  {
    label: "order + collapse + padding",
    options: {
      canonicalOrder: true,
      collapseIdempotentRepeats: true,
      padding: { enabled: true, allowedSet: URLS.map(get) },
    },
  },
];

/**
 * Run one window through the batcher; returns the observed URL indices in the
 * order the requests leave. The harness plays the tool as the open core's
 * web_fetch does: a released real GET waits for its issue slot
 * (`requestToolIssueSlot`) and leaves when the slot opens; padding leaves
 * through the injected request client at its slot in the same lockstep
 * sequence.
 */
async function observeWindow(config: ChoiceConfig, actions: readonly number[]): Promise<number[]> {
  const wire: number[] = [];
  const batcher = createActionBatcher(
    { ...DEFAULT_ACTION_BATCHER_OPTIONS, ...config.options },
    {
      now: () => 0,
      setTimer: () => null,
      clearTimer: () => {},
      issuedTimeoutMs: 1_000,
      paddingClient: () => ({
        check: async () => ({ ok: true }),
        send: async (url) => {
          wire.push(KEY_TO_INDEX.get(actionKey(get(url))) ?? -1);
        },
      }),
    },
  );
  const releases = actions.map((index, i) =>
    batcher.submit({ id: `a${i}`, action: get(URLS[index]), scope: "bench" }).then(async (r) => {
      if (r.outcome === "execute") {
        await requestToolIssueSlot("web_fetch", URLS[index], `a${i}`);
        wire.push(index);
        batcher.complete(`a${i}`, `body ${index}`);
      }
      return r;
    }),
  );
  batcher.flush();
  await Promise.all(releases);
  // Let the lockstep dispatch send the padding after the last real request.
  for (let i = 0; i < CHOICE_N + actions.length + 4; i++) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  batcher.dispose();
  return wire;
}

export type ChoiceRow = {
  encoding: Encoding["name"];
  capacityBits: number;
  /** Decoded bits per configuration label. */
  decoded: Record<string, number>;
};

export type ChoiceBenchmark = {
  n: number;
  k: number;
  trials: number;
  rows: ChoiceRow[];
  /** Best encoding per configuration: the adaptive attacker's residual. */
  best: Record<string, number>;
};

export async function runChoiceBenchmark(trials = 2000): Promise<ChoiceBenchmark> {
  const rows: ChoiceRow[] = [];
  for (const [e, enc] of ENCODINGS.entries()) {
    const decoded: Record<string, number> = {};
    for (const config of CHOICE_CONFIGS) {
      const rand = makeRng(0xc401ce + e);
      const pairs: Array<Array<[Bit, Bit]>> = Array.from({ length: enc.bits }, () => []);
      for (let t = 0; t < trials; t++) {
        const msg = enc.draw(rand);
        const out = enc.decode(await observeWindow(config, enc.encode(msg)));
        for (let b = 0; b < enc.bits; b++) {
          pairs[b].push([msg[b], out[b]]);
        }
      }
      decoded[config.label] = pairs.reduce((sum, p) => sum + mutualInformation(p), 0);
    }
    rows.push({ encoding: enc.name, capacityBits: enc.capacityBits, decoded });
  }
  const best: Record<string, number> = {};
  for (const config of CHOICE_CONFIGS) {
    best[config.label] = Math.max(...rows.map((r) => r.decoded[config.label]));
  }
  return { n: CHOICE_N, k: CHOICE_K, trials, rows, best };
}
