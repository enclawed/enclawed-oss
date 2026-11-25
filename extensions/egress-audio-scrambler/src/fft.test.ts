import { describe, expect, it } from "vitest";
import { fft, ifft, nextPow2 } from "./fft.js";

describe("nextPow2", () => {
  it("rounds up to the next power of two", () => {
    expect(nextPow2(1)).toBe(1);
    expect(nextPow2(5)).toBe(8);
    expect(nextPow2(4096)).toBe(4096);
    expect(nextPow2(4097)).toBe(8192);
  });
});

describe("fft / ifft", () => {
  it("round-trips a signal back to itself", () => {
    const n = 256;
    const original = Float64Array.from({ length: n }, (_, i) => Math.sin(i) + 0.3 * i);
    const re = Float64Array.from(original);
    const im = new Float64Array(n);
    fft(re, im);
    ifft(re, im);
    for (let i = 0; i < n; i++) {
      expect(re[i]!).toBeCloseTo(original[i]!, 6);
      expect(im[i]!).toBeCloseTo(0, 6);
    }
  });

  it("concentrates a pure tone's energy at its bin", () => {
    const n = 1024;
    const bin = 64;
    const re = Float64Array.from({ length: n }, (_, i) => Math.cos((2 * Math.PI * bin * i) / n));
    const im = new Float64Array(n);
    fft(re, im);
    const mag = (k: number) => Math.hypot(re[k]!, im[k]!);
    // The tone's bin dominates every unrelated bin.
    expect(mag(bin)).toBeGreaterThan(mag(bin + 5) + 100);
    expect(mag(bin)).toBeGreaterThan(mag(7) + 100);
  });
});
