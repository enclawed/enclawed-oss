// Alpha-channel LSB carrier. The alpha byte carries bits exactly like a color
// channel, so an attacker who knows the color channels are requantized moves
// the payload into alpha. The scrambler requantizes alpha to the same depth.

import type { ImagePayload } from "@enclawed/egress-core";
import { describe, expect, it } from "vitest";
import { scrambleImage } from "./scrambler.js";

type Bit = 0 | 1;
const W = 16;
const H = 16;
const N = W * H;

function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Miller-Madow-corrected I(X;Y) in bits for binary pairs. */
function mutualInformationBits(pairs: ReadonlyArray<readonly [Bit, Bit]>): number {
  const n = pairs.length;
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
      if (joint[x][y] > 0) {
        const pxy = joint[x][y] / n;
        mi += pxy * Math.log2(pxy / ((px[x] / n) * (py[y] / n)));
      }
    }
  }
  const sx = (px[0] > 0 ? 1 : 0) + (px[1] > 0 ? 1 : 0);
  const sy = (py[0] > 0 ? 1 : 0) + (py[1] > 0 ? 1 : 0);
  return Math.max(0, mi - ((sx - 1) * (sy - 1)) / (2 * n * Math.LN2));
}

/** Semi-transparent cover with the secret in alpha bit `bit` of every pixel. */
function encode(secret: Bit[], bit: 0 | 1, rand: () => number): ImagePayload {
  const rgba = new Uint8ClampedArray(N * 4);
  for (let i = 0; i < N; i++) {
    rgba[i * 4] = Math.floor(rand() * 256);
    rgba[i * 4 + 1] = Math.floor(rand() * 256);
    rgba[i * 4 + 2] = Math.floor(rand() * 256);
    const alpha = 64 + Math.floor(rand() * 128);
    rgba[i * 4 + 3] = (alpha & ~(1 << bit)) | (secret[i]! << bit);
  }
  return { width: W, height: H, rgba };
}

function measure(transform: (img: ImagePayload) => ImagePayload, bit: 0 | 1): number {
  const rand = makeRng(0xa1fa + bit);
  const pairs: Array<[Bit, Bit]> = [];
  for (let t = 0; t < 20; t++) {
    const secret = Array.from({ length: N }, () => (rand() < 0.5 ? 0 : 1) as Bit);
    const out = transform(encode(secret, bit, rand));
    for (let i = 0; i < N; i++) {
      pairs.push([secret[i]!, ((out.rgba[i * 4 + 3]! >> bit) & 1) as Bit]);
    }
  }
  return mutualInformationBits(pairs);
}

describe("image scrambler — alpha-channel LSB carrier", () => {
  it("carries a full bit per pixel undefended", () => {
    expect(measure((img) => img, 0)).toBeGreaterThan(0.95);
    expect(measure((img) => img, 1)).toBeGreaterThan(0.95);
  });

  it("removes bit-0 and bit-1 alpha carriers at the default depth", () => {
    expect(measure((img) => scrambleImage(img), 0)).toBeLessThan(0.01);
    expect(measure((img) => scrambleImage(img), 1)).toBeLessThan(0.01);
  });

  it("applies the configured depth to alpha as to color (128 levels clears bit 0 only)", () => {
    const seven = (img: ImagePayload) =>
      scrambleImage(img, { depthLevels: 128, luminanceBuckets: 1 });
    expect(measure(seven, 0)).toBeLessThan(0.01);
    expect(measure(seven, 1)).toBeGreaterThan(0.95);
    const off = (img: ImagePayload) =>
      scrambleImage(img, { depthLevels: 256, luminanceBuckets: 1 });
    expect(measure(off, 0)).toBeGreaterThan(0.95);
  });

  it("scrambles alpha in the CMYK basis too", () => {
    expect(measure((img) => scrambleImage(img, { colorSpace: "cmyk" }), 0)).toBeLessThan(0.01);
  });

  it("leaves fully opaque and fully transparent pixels unchanged", () => {
    const img: ImagePayload = {
      width: 3,
      height: 1,
      rgba: new Uint8ClampedArray([10, 20, 30, 255, 10, 20, 30, 0, 10, 20, 30, 254]),
    };
    const out = scrambleImage(img);
    expect(out.rgba[3]).toBe(255);
    expect(out.rgba[7]).toBe(0);
    // A near-opaque carrier value is snapped back onto the grid.
    expect(out.rgba[11]).toBe(255);
  });
});
