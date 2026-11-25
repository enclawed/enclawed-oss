// Adversarial measurement of the image scrambler.
//
// It implements a working LSB-steganography covert channel — the attacker
// hides each secret bit in the least-significant bit of the blue channel of a
// pixel — then runs the image scrambler and has the receiver read the LSBs
// back. Residual capacity is the Miller-Madow-corrected mutual information
// I(secret; recovered). The channel is measured undefended, under color-space
// roundtrip alone, and under the full scrambler (color space + bit depth).

import type { ImagePayload } from "@enclawed/egress-core";
import { describe, expect, it } from "vitest";
import { scrambleImage } from "./scrambler.js";

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

const W = 16;
const H = 16;
const BITS = 48; // hidden in the blue LSB of the first 48 pixels

/** Build a random cover image and embed the secret in the blue LSB plane. */
function encode(secret: Bit[], rand: () => number): ImagePayload {
  const rgba = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    rgba[i * 4] = Math.floor(rand() * 256);
    rgba[i * 4 + 1] = Math.floor(rand() * 256);
    rgba[i * 4 + 2] = Math.floor(rand() * 256);
    rgba[i * 4 + 3] = 255;
  }
  for (let b = 0; b < secret.length; b++) {
    rgba[b * 4 + 2] = (rgba[b * 4 + 2]! & 0xfe) | secret[b]!;
  }
  return { width: W, height: H, rgba };
}

/** Receiver: read the blue-channel LSB of the first BITS pixels. */
function decode(image: ImagePayload): Bit[] {
  const bits: Bit[] = [];
  for (let b = 0; b < BITS; b++) {
    bits.push((image.rgba[b * 4 + 2]! & 1) as Bit);
  }
  return bits;
}

function measure(
  transform: (img: ImagePayload) => ImagePayload,
  trials: number,
  rand: () => number,
): { reductionPct: number; accuracyPct: number } {
  const pairs: Array<[Bit, Bit]> = [];
  let matched = 0;
  for (let t = 0; t < trials; t++) {
    const secret = randomBits(BITS, rand);
    const recovered = decode(transform(encode(secret, rand)));
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

describe("image scrambler — LSB-steganography adversarial suite", () => {
  it("collapses the LSB covert channel — depth requantization is the mechanism", () => {
    const trials = 40;
    const undefended = measure((img) => img, trials, makeRng(0x10a9e));
    // Color-space conversion alone, at full depth, is exactly invertible.
    // luminanceBuckets:1 isolates the color-space behavior from the new
    // per-image mean-luminance bucketing (which is the separate cross-image
    // covert-channel defense, not the LSB defense under test here).
    const cmykLossless = measure(
      (img) => scrambleImage(img, { colorSpace: "cmyk", depthLevels: 256, luminanceBuckets: 1 }),
      trials,
      makeRng(0x10a9e),
    );
    // Bit-depth requantization in RGB and in the CMYK basis. Same isolation:
    // we measure the LSB-collapsing behavior of depth requantization on its
    // own here.
    const rgbDepth = measure(
      (img) => scrambleImage(img, { colorSpace: "rgb", depthLevels: 64, luminanceBuckets: 1 }),
      trials,
      makeRng(0x10a9e),
    );
    const cmykDepth = measure(
      (img) => scrambleImage(img, { luminanceBuckets: 1 }),
      trials,
      makeRng(0x10a9e),
    );

    const fmt = (n: number) => n.toFixed(1).padStart(7);
    const row = (label: string, s: { accuracyPct: number; reductionPct: number }) =>
      console.log(`${label.padEnd(26)} ${fmt(s.accuracyPct)}  ${fmt(s.reductionPct)}`);
    console.log("\n=== image scrambler — blue-channel LSB stego ===");
    console.log("config                       acc%   reduction%");
    row("undefended", undefended);
    row("CMYK roundtrip, full depth", cmykLossless);
    row("RGB-basis depth requant", rgbDepth);
    row("CMYK-basis depth requant", cmykDepth);

    // Undefended, the LSB channel carries its full payload.
    expect(undefended.reductionPct, "undefended").toBeLessThan(5);
    expect(undefended.accuracyPct, "undefended accuracy").toBeGreaterThan(95);
    // Honest finding: a pure color-space roundtrip destroys nothing.
    expect(cmykLossless.reductionPct, "cmyk lossless").toBeLessThan(5);
    // Bit-depth requantization — in either basis — collapses the channel.
    expect(rgbDepth.reductionPct, "rgb depth").toBeGreaterThanOrEqual(99);
    expect(cmykDepth.reductionPct, "cmyk depth").toBeGreaterThanOrEqual(99);
  });
});
