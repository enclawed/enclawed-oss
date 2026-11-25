import { describe, expect, it } from "vitest";
import { cmykToRgb, requantize, rgbToCmyk } from "./colorspace.js";

function roundtrip(r: number, g: number, b: number): [number, number, number] {
  const [c, m, y, k] = rgbToCmyk(r, g, b);
  return cmykToRgb(c, m, y, k);
}

describe("RGB <-> CMYK", () => {
  it("roundtrips primaries exactly", () => {
    expect(roundtrip(0, 0, 0)).toEqual([0, 0, 0]);
    expect(roundtrip(255, 255, 255)).toEqual([255, 255, 255]);
    expect(roundtrip(255, 0, 0)).toEqual([255, 0, 0]);
  });

  it("roundtrips arbitrary colors to within rounding error", () => {
    for (const [r, g, b] of [
      [137, 42, 200],
      [13, 240, 99],
      [201, 201, 64],
    ] as const) {
      const [r2, g2, b2] = roundtrip(r, g, b);
      expect(Math.abs(r2 - r)).toBeLessThanOrEqual(2);
      expect(Math.abs(g2 - g)).toBeLessThanOrEqual(2);
      expect(Math.abs(b2 - b)).toBeLessThanOrEqual(2);
    }
  });
});

describe("requantize", () => {
  it("is a no-op at full depth", () => {
    for (let v = 0; v <= 255; v += 17) {
      expect(requantize(v, 256)).toBe(v);
    }
  });

  it("collapses the low bits — adjacent values map together", () => {
    // 100 and 101 differ only in the LSB; at 64 levels they coincide.
    expect(requantize(100, 64)).toBe(requantize(101, 64));
  });

  it("stays within the 0-255 range", () => {
    for (let v = 0; v <= 255; v++) {
      const q = requantize(v, 64);
      expect(q).toBeGreaterThanOrEqual(0);
      expect(q).toBeLessThanOrEqual(255);
    }
  });
});
