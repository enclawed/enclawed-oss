import type { ImagePayload } from "@enclawed/egress-core";
import { describe, expect, it } from "vitest";
import { scrambleImage } from "./scrambler.js";

function image(pixels: Array<[number, number, number, number]>): ImagePayload {
  const rgba = new Uint8ClampedArray(pixels.length * 4);
  pixels.forEach(([r, g, b, a], i) => {
    rgba[i * 4] = r;
    rgba[i * 4 + 1] = g;
    rgba[i * 4 + 2] = b;
    rgba[i * 4 + 3] = a;
  });
  return { width: pixels.length, height: 1, rgba };
}

describe("scrambleImage", () => {
  it("preserves dimensions; alpha is requantized like a color channel", () => {
    const img = image([
      [120, 80, 200, 255],
      [10, 250, 30, 128],
    ]);
    const out = scrambleImage(img);
    expect(out.width).toBe(2);
    expect(out.height).toBe(1);
    expect(out.rgba[3]).toBe(255);
    // At 64 levels (step 255/63) alpha 128 snaps to the nearest grid level, 130.
    expect(out.rgba[7]).toBe(130);
  });

  it("keeps the image visually close (large-scale values preserved)", () => {
    const img = image([[137, 42, 200, 255]]);
    const out = scrambleImage(img);
    // Within a requantization step of the original — visibly the same color.
    expect(Math.abs(out.rgba[0]! - 137)).toBeLessThanOrEqual(10);
    expect(Math.abs(out.rgba[1]! - 42)).toBeLessThanOrEqual(10);
    expect(Math.abs(out.rgba[2]! - 200)).toBeLessThanOrEqual(10);
  });

  it("a pure CMYK roundtrip at full depth is an exact no-op", () => {
    // The honest baseline: color-space conversion alone destroys nothing;
    // the bit-depth requantization is the covert-channel mechanism.
    const img = image([
      [137, 42, 200, 255],
      [13, 240, 99, 255],
      [201, 17, 64, 255],
    ]);
    // luminanceBuckets:1 disables the per-image mean-luma bucketing so the
    // color-space invertibility property is the only thing under test.
    const out = scrambleImage(img, { colorSpace: "cmyk", depthLevels: 256, luminanceBuckets: 1 });
    expect(Array.from(out.rgba)).toEqual(Array.from(img.rgba));
  });
});
