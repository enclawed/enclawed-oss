import type { ImagePayload } from "@enclawed/egress-core";
import { describe, expect, it } from "vitest";
import { analyzeLsbPlanes } from "./detect.js";

function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const W = 24;
const H = 24;

function buildImage(blueLsb: (x: number, y: number) => 0 | 1): ImagePayload {
  const rand = makeRng(0x1cef);
  const rgba = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      rgba[i] = Math.floor(rand() * 256);
      rgba[i + 1] = Math.floor(rand() * 256);
      rgba[i + 2] = (Math.floor(rand() * 256) & 0xfe) | blueLsb(x, y);
      rgba[i + 3] = 255;
    }
  }
  return { width: W, height: H, rgba };
}

describe("analyzeLsbPlanes", () => {
  it("does not flag a clean image (LSB planes near noise)", () => {
    const noise = makeRng(0x9911);
    const reports = analyzeLsbPlanes(buildImage(() => (noise() < 0.5 ? 0 : 1)));
    for (const r of reports) {
      expect(r.lsbAgreement).toBeLessThan(0.62);
      expect(r.suspicious).toBe(false);
    }
  });

  it("flags a channel whose LSB plane carries a structured hidden image", () => {
    // A smooth left/right split — the kind of low-frequency structure a
    // hidden image has and a noise plane does not.
    const reports = analyzeLsbPlanes(buildImage((x) => (x < W / 2 ? 0 : 1)));
    const blue = reports.find((r) => r.channel === "B")!;
    expect(blue.lsbAgreement).toBeGreaterThan(0.62);
    expect(blue.suspicious).toBe(true);
    // The untouched channels still look like noise.
    expect(reports.find((r) => r.channel === "R")!.suspicious).toBe(false);
  });
});
