// Image-domain measurements.
//
//   - LSB steganography and the design-space probe: one 128x128 cover (a
//     smooth additive RGB gradient plus a bright high-chroma inset) carrying a
//     deterministic secret in bit 0 (naive attacker) or bit 1 (aware attacker)
//     of the blue channel, under every defense variant the paper tested. Built
//     on the production requantization primitives of egress-image-scrambler.
//   - Cross-image carriers: per-image mean luminance and inter-image emission
//     order, measured as mutual information against working encoders.

import { createHash } from "node:crypto";
import {
  canonicalMediaOrder,
  cmykToRgb,
  hashImagePayload,
  meanLuminance,
  requantize,
  requantizeUnit,
  rgbToCmyk,
  scrambleImage,
  type ImagePayload,
  type MediaBatchItem,
} from "../../../extensions/egress-image-scrambler/api.js";
import { makeRng, mutualInformation, randomBits, type Bit } from "./stats.js";

const W = 128;
const H = 128;

/** Deterministic secret bit for pixel i (period 256). */
const secretBitAt = (i: number): Bit => ((((i % 256) * 1103515245 + 12345) >>> 8) & 1) as Bit;

/** The paper's cover image with the secret embedded in bit `bitsEmbedded` of blue. */
export function testImage(bitsEmbedded = 0): ImagePayload {
  const rgba = new Uint8ClampedArray(W * H * 4);
  const mask = ~(1 << bitsEmbedded) & 0xff;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      let r = Math.round(40 + (x / W) * 200);
      let g = Math.round(60 + (y / H) * 180 + Math.sin(x * 0.05) * 20);
      let b = Math.round(80 + ((x + y) / (W + H)) * 160 + Math.cos(y * 0.07) * 15);
      if (x > W * 0.7 && x < W * 0.9 && y > H * 0.2 && y < H * 0.4) {
        r = 240;
        g = 220;
        b = 60; // bright inset
      }
      r = Math.max(0, Math.min(255, r));
      g = Math.max(0, Math.min(255, g));
      b = Math.max(0, Math.min(255, b));
      b = (b & mask) | (secretBitAt(y * W + x) << bitsEmbedded);
      rgba[i] = r;
      rgba[i + 1] = g;
      rgba[i + 2] = b;
      rgba[i + 3] = 0xff;
    }
  }
  return { width: W, height: H, rgba };
}

type Transform = (image: ImagePayload) => ImagePayload;

function mapPixels(
  image: ImagePayload,
  fn: (r: number, g: number, b: number) => [number, number, number],
): ImagePayload {
  const out = new Uint8ClampedArray(image.rgba.length);
  for (let p = 0; p < image.rgba.length; p += 4) {
    const [r, g, b] = fn(image.rgba[p], image.rgba[p + 1], image.rgba[p + 2]);
    out[p] = r;
    out[p + 1] = g;
    out[p + 2] = b;
    out[p + 3] = image.rgba[p + 3]!;
  }
  return { width: image.width, height: image.height, rgba: out };
}

const rgbDepth =
  (levels: number): Transform =>
  (im) =>
    mapPixels(im, (r, g, b) => [
      requantize(r, levels),
      requantize(g, levels),
      requantize(b, levels),
    ]);

const cmykDepth =
  (levels: number): Transform =>
  (im) =>
    mapPixels(im, (r, g, b) => {
      let [c, m, y, k] = rgbToCmyk(r, g, b);
      if (levels < 256) {
        c = requantizeUnit(c, levels);
        m = requantizeUnit(m, levels);
        y = requantizeUnit(y, levels);
        k = requantizeUnit(k, levels);
      }
      return cmykToRgb(c, m, y, k);
    });

const cmykKOnly =
  (kLevels: number): Transform =>
  (im) =>
    mapPixels(im, (r, g, b) => {
      const [c, m, y, k] = rgbToCmyk(r, g, b);
      return cmykToRgb(c, m, y, requantizeUnit(k, kLevels));
    });

/** SHA-256 counter RNG used by the paper's randomized variants (kept for exact reproduction). */
function shaRng(seed: number): () => number {
  let s = createHash("sha256").update(`${seed}`).digest();
  let i = 0;
  return () => {
    if (i >= 28) {
      s = createHash("sha256").update(s).digest();
      i = 0;
    }
    const v = s.readUInt32BE(i);
    i += 4;
    return v / 0xffffffff;
  };
}

const cmykRandom =
  (loBits: number, hiBits: number, seed: number): Transform =>
  (im) => {
    const rng = shaRng(seed);
    const spread = hiBits - loBits;
    const draw = () => loBits + (spread > 0 ? Math.floor(rng() * (spread + 1)) : 0);
    return mapPixels(im, (r, g, b) => {
      let [c, m, y, k] = rgbToCmyk(r, g, b);
      c = requantizeUnit(c, 1 << draw());
      m = requantizeUnit(m, 1 << draw());
      y = requantizeUnit(y, 1 << draw());
      k = requantizeUnit(k, 1 << draw());
      return cmykToRgb(c, m, y, k);
    });
  };

const rgbRandomOneChannel =
  (seed: number): Transform =>
  (im) => {
    const rng = shaRng(seed);
    return mapPixels(im, (r, g, b) => {
      const ch = Math.floor(rng() * 3);
      return [
        ch === 0 ? requantize(r, 128) : r,
        ch === 1 ? requantize(g, 128) : g,
        ch === 2 ? requantize(b, 128) : b,
      ];
    });
  };

const sprinkleRgb =
  (p: number, seed: number): Transform =>
  (im) => {
    const rng = shaRng(seed);
    const q = (v: number) => (rng() < p ? requantize(v, 64) : requantize(v, 128));
    return mapPixels(im, (r, g, b) => {
      const r2 = q(r);
      const g2 = q(g);
      return [r2, g2, q(b)];
    });
  };

/** Receiver: per-pixel (secret, recovered) pairs from bit `bit` of blue. */
function lsbPairs(image: ImagePayload, bit: number): Array<[Bit, Bit]> {
  const pairs: Array<[Bit, Bit]> = [];
  for (let i = 0; i < W * H; i++) {
    pairs.push([secretBitAt(i), ((image.rgba[i * 4 + 2] >> bit) & 1) as Bit]);
  }
  return pairs;
}

const acc = (pairs: Array<[Bit, Bit]>) =>
  (pairs.filter(([x, y]) => x === y).length / pairs.length) * 100;

function distortion(orig: ImagePayload, sc: ImagePayload): { max: number; mean: number } {
  let max = 0;
  let sum = 0;
  let n = 0;
  for (let i = 0; i < orig.rgba.length; i++) {
    if ((i & 3) === 3) {
      continue;
    }
    const d = Math.abs(orig.rgba[i] - sc.rgba[i]);
    max = Math.max(max, d);
    sum += d;
    n++;
  }
  return { max, mean: sum / n };
}

export type DesignSpaceRow = {
  label: string;
  bit0AccPct: number;
  bit1AccPct: number;
  bit0ReductionPct: number;
  bit1ReductionPct: number;
  maxDelta: number;
  meanDelta: number;
};

export const DESIGN_SPACE: ReadonlyArray<{ label: string; fn: Transform }> = [
  { label: "RGB 256 (no defense)", fn: rgbDepth(256) },
  { label: "RGB 255 (one level less)", fn: rgbDepth(255) },
  { label: "RGB 200", fn: rgbDepth(200) },
  { label: "RGB 128 (7 bits/ch)", fn: rgbDepth(128) },
  { label: "RGB 64 (6 bits/ch, DEFAULT)", fn: rgbDepth(64) },
  { label: "RGB 32 (5 bits/ch)", fn: rgbDepth(32) },
  { label: "RGB 16 (4 bits/ch)", fn: rgbDepth(16) },
  { label: "CMYK 255 (one level less)", fn: cmykDepth(255) },
  { label: "CMYK 128 (7 bits/comp)", fn: cmykDepth(128) },
  { label: "CMYK 64 (6 bits/comp)", fn: cmykDepth(64) },
  { label: "CMYK 32 (5 bits/comp)", fn: cmykDepth(32) },
  { label: "K-only 4 bits (others full)", fn: cmykKOnly(16) },
  { label: "K-only 2 bits (others full)", fn: cmykKOnly(4) },
  { label: "CMYK random in [7, 8] bits", fn: cmykRandom(7, 8, 0xabc) },
  { label: "CMYK random in [6, 7] bits", fn: cmykRandom(6, 7, 0xabc) },
  { label: "CMYK random in [5, 7] bits", fn: cmykRandom(5, 7, 0xabc) },
  { label: "RGB: random 1-of-3 ch at 7 bit", fn: rgbRandomOneChannel(0xa) },
  { label: "RGB 7-bit + 25% sprinkle 6-bit", fn: sprinkleRgb(0.25, 0xa) },
  { label: "RGB 7-bit + 50% sprinkle 6-bit", fn: sprinkleRgb(0.5, 0xa) },
  // Not in the paper: the shipped scrambler end to end, including its
  // default eight-bucket mean-luminance snap.
  { label: "scrambleImage() shipped defaults", fn: (im) => scrambleImage(im) },
];

export function runDesignSpace(): DesignSpaceRow[] {
  const bit0 = testImage(0);
  const bit1 = testImage(1);
  return DESIGN_SPACE.map(({ label, fn }) => {
    const sc0 = fn(bit0);
    const sc1 = fn(bit1);
    const p0 = lsbPairs(sc0, 0);
    const p1 = lsbPairs(sc1, 1);
    const d = distortion(bit0, sc0);
    return {
      label,
      bit0AccPct: acc(p0),
      bit1AccPct: acc(p1),
      bit0ReductionPct: (1 - mutualInformation(p0)) * 100,
      bit1ReductionPct: (1 - mutualInformation(p1)) * 100,
      maxDelta: d.max,
      meanDelta: d.mean,
    };
  });
}

// ---------------------------------------------------------------------------
// cross-image carriers
// ---------------------------------------------------------------------------

function flatImage(size: number, seed: number, level: number): ImagePayload {
  const rgba = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < rgba.length; i += 4) {
    const v = Math.max(0, Math.min(255, level + (((seed * 31 + i) % 7) - 3)));
    rgba[i] = v;
    rgba[i + 1] = v;
    rgba[i + 2] = v;
    rgba[i + 3] = 0xff;
  }
  return { width: size, height: size, rgba };
}

export type CrossImageRow = {
  channel: string;
  defense: string;
  /** Per-image capacity bound in bits (log2 of distinguishable states). */
  boundBits: number;
  /** Measured mutual information, bits per image (luminance) or per batch (sequence). */
  residualBits: number;
  receiverAccPct: number;
};

/** One bit per image in its mean luminance; receiver thresholds at mid-grey. */
function measureLuminance(buckets: number | null, trials: number): CrossImageRow {
  const rand = makeRng(0x1a1a);
  const pairs: Array<[Bit, Bit]> = [];
  for (let t = 0; t < trials; t++) {
    const bits = randomBits(16, rand);
    bits.forEach((bit, i) => {
      const img = flatImage(16, t * 16 + i, bit === 1 ? 192 : 64);
      const out = buckets === null ? img : scrambleImage(img, { luminanceBuckets: buckets });
      pairs.push([bit, (meanLuminance(out) > 128 ? 1 : 0) as Bit]);
    });
  }
  return {
    channel: "mean luminance (1 bit/image)",
    defense: buckets === null ? "undefended" : `bucket B=${buckets}`,
    boundBits: buckets === null ? 8 : Math.log2(buckets),
    residualBits: mutualInformation(pairs),
    receiverAccPct: acc(pairs),
  };
}

function permutations(n: number): number[][] {
  if (n === 1) {
    return [[0]];
  }
  const out: number[][] = [];
  for (const rest of permutations(n - 1)) {
    for (let i = 0; i <= rest.length; i++) {
      out.push([...rest.slice(0, i), n - 1, ...rest.slice(i)]);
    }
  }
  return out;
}

/** log2(4!) bits in the emission order of four images. */
function measureSequence(defended: boolean, trials: number): CrossImageRow {
  const palette = [32, 96, 160, 224].map((level, i) => flatImage(8, i, level));
  const prints = palette.map(meanLuminance);
  const perms = permutations(4);
  const key = (p: number[]) => p.join("");
  const index = new Map(perms.map((p, i) => [key(p), i]));
  const nearest = (m: number) =>
    prints.reduce((best, v, i) => (Math.abs(v - m) < Math.abs(prints[best] - m) ? i : best), 0);
  const rand = makeRng(0x5e9);
  const pairs: Array<[number, number]> = [];
  let correct = 0;
  for (let t = 0; t < trials; t++) {
    const sent = Math.floor(rand() * perms.length);
    const batch: MediaBatchItem[] = perms[sent].map((i) => ({
      kind: "image",
      payload: palette[i],
    }));
    const emitted = defended ? canonicalMediaOrder(batch) : batch;
    const recovered = index.get(
      key(emitted.map((b) => nearest(meanLuminance(b.payload as ImagePayload)))),
    )!;
    pairs.push([sent, recovered]);
    if (recovered === sent) {
      correct++;
    }
  }
  // Sanity: the canonical order is the sha256 order of the payloads.
  if (defended) {
    const hashes = canonicalMediaOrder(
      palette.map((payload) => ({ kind: "image" as const, payload })),
    ).map((b) => hashImagePayload(b.payload as ImagePayload));
    if (hashes.join() !== [...hashes].toSorted().join()) {
      throw new Error("canonicalMediaOrder is not sha256-ordered");
    }
  }
  return {
    channel: "sequence ID (4! permutations)",
    defense: defended ? "sha256 canonical" : "undefended",
    boundBits: defended ? 0 : Math.log2(24),
    residualBits: mutualInformation(pairs),
    receiverAccPct: (correct / trials) * 100,
  };
}

export function runCrossImage(trials = 200): CrossImageRow[] {
  return [
    measureLuminance(null, trials),
    measureLuminance(8, trials),
    measureLuminance(2, trials),
    measureSequence(false, trials * 4),
    measureSequence(true, trials * 4),
  ];
}
