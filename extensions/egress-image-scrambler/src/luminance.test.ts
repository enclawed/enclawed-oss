// Tests for per-image mean-luminance covert-channel defense.

import type { ImagePayload } from "@enclawed/egress-core";
import { describe, expect, it } from "vitest";
import { applyMeanLuminanceBucket, bucketLuma, meanLuminance, pixelLuma } from "./luminance.js";

function gray(width: number, height: number, level: number): ImagePayload {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = level;
    rgba[i + 1] = level;
    rgba[i + 2] = level;
    rgba[i + 3] = 0xff;
  }
  return { width, height, rgba };
}

describe("pixelLuma", () => {
  it("returns the ITU-R BT.601 luma", () => {
    expect(pixelLuma(255, 0, 0)).toBeCloseTo(0.299 * 255, 6);
    expect(pixelLuma(0, 255, 0)).toBeCloseTo(0.587 * 255, 6);
    expect(pixelLuma(0, 0, 255)).toBeCloseTo(0.114 * 255, 6);
  });
});

describe("bucketLuma", () => {
  it("snaps to the centre of the bucket", () => {
    // 4 buckets across 0..255 -> centres at 31.875, 95.625, 159.375, 223.125
    expect(bucketLuma(40, 4)).toBeCloseTo(31.875, 5);
    expect(bucketLuma(120, 4)).toBeCloseTo(95.625, 5);
  });
  it("noop with fewer than 2 buckets", () => {
    expect(bucketLuma(123.4, 1)).toBe(123.4);
  });
});

describe("applyMeanLuminanceBucket", () => {
  it("shifts the image so its mean luma sits on the bucket centre", () => {
    const before = gray(4, 4, 100);
    expect(meanLuminance(before)).toBeCloseTo(100, 6);
    const after = applyMeanLuminanceBucket(before, 4);
    // Bucket centre for ~100 is 95.625.
    expect(meanLuminance(after)).toBeCloseTo(95.625, 0);
  });

  it("preserves the exemption evidence pointer", () => {
    const before: ImagePayload = { ...gray(2, 2, 50), exemption: undefined };
    const after = applyMeanLuminanceBucket(before, 4);
    expect(after.exemption).toBe(before.exemption);
  });
});
