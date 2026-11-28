// Tests for the exemption-gated image media scrambler.
//
//   1. with no host exemption check (the open-core default) every image is
//      scrambled, whatever exemption evidence it carries;
//   2. an image the host's check accepts is returned unchanged (same object);
//   3. a check that rejects, or throws, routes the image through the scrambler.

import {
  type ImagePayload,
  resetMediaExemption,
  setMediaExemptionCheck,
} from "@enclawed/egress-core";
import { afterEach, describe, expect, it } from "vitest";
import { applyImageMediaScramble } from "./media-scrambler.js";

function makeImage(seed: number): ImagePayload {
  const width = 8,
    height = 8;
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = (i + seed) & 0xff; // R
    rgba[i + 1] = (i * 3 + seed) & 0xff; // G
    rgba[i + 2] = (i * 7 + seed) & 0xff; // B
    rgba[i + 3] = 0xff; // A
  }
  return { width, height, rgba };
}

function differs(a: Uint8ClampedArray, b: Uint8ClampedArray): boolean {
  if (a.length !== b.length) {
    return true;
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return true;
    }
  }
  return false;
}

afterEach(() => {
  resetMediaExemption();
});

describe("applyImageMediaScramble", () => {
  it("scrambles every image when no exemption check is installed (fail-secure default)", () => {
    const image: ImagePayload = { ...makeImage(0), exemption: { claimed: true } };
    const out = applyImageMediaScramble(image);
    expect(out.rgba).not.toBe(image.rgba);
    expect(differs(out.rgba, image.rgba)).toBe(true);
  });

  it("passes an image the host check accepts through unchanged", () => {
    setMediaExemptionCheck((s) => s.kind === "image" && s.payload.exemption === "chart-render");
    const image: ImagePayload = { ...makeImage(1), exemption: "chart-render" };
    const out = applyImageMediaScramble(image);
    expect(out).toBe(image);
    expect(out.rgba).toBe(image.rgba);
  });

  it("scrambles an image the host check rejects", () => {
    setMediaExemptionCheck((s) => s.payload.exemption === "chart-render");
    const image: ImagePayload = { ...makeImage(2), exemption: "unknown" };
    const out = applyImageMediaScramble(image);
    expect(out.rgba).not.toBe(image.rgba);
  });

  it("scrambles when the host check throws", () => {
    setMediaExemptionCheck(() => {
      throw new Error("check failure");
    });
    const image = makeImage(3);
    expect(applyImageMediaScramble(image).rgba).not.toBe(image.rgba);
  });
});
