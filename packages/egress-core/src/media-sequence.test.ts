// Unit tests for the inter-media sequence canonicalizer.

import { afterEach, describe, expect, it } from "vitest";
import { resetMediaExemption, setMediaExemptionCheck } from "./media-exemption.js";
import { hashImagePayload } from "./media-hash.js";
import { canonicalMediaOrder, type MediaBatchItem } from "./media-sequence.js";
import type { ImagePayload } from "./media.js";

function img(seed: number): ImagePayload {
  const rgba = new Uint8ClampedArray(16);
  for (let i = 0; i < rgba.length; i++) {
    rgba[i] = (seed * 37 + i) & 0xff;
  }
  return { width: 2, height: 2, rgba };
}

afterEach(() => {
  resetMediaExemption();
});

describe("canonicalMediaOrder", () => {
  it("sorts every item by content hash when no exemption check is installed", () => {
    const batch: MediaBatchItem[] = [5, 2, 8, 1].map((s) => ({
      kind: "image" as const,
      payload: img(s),
    }));
    const re = canonicalMediaOrder(batch);
    const hashes = re.map((b) => hashImagePayload(b.payload as ImagePayload));
    const sorted = [...hashes].toSorted();
    expect(hashes).toEqual(sorted);
  });

  it("ignores exemption evidence on the payload when no check is installed", () => {
    const a = { ...img(3), exemption: { anything: true } };
    const b = { ...img(4), exemption: { anything: true } };
    const forward = canonicalMediaOrder([
      { kind: "image", payload: a },
      { kind: "image", payload: b },
    ]);
    const backward = canonicalMediaOrder([
      { kind: "image", payload: b },
      { kind: "image", payload: a },
    ]);
    expect(forward.map((i) => i.payload)).toEqual(backward.map((i) => i.payload));
  });

  it("places host-exempted items first, preserving their relative order", () => {
    const exempt1 = { ...img(11), exemption: "ok" };
    const exempt2 = { ...img(12), exemption: "ok" };
    const suspect = img(99);
    setMediaExemptionCheck((s) => s.payload.exemption === "ok");
    const batch: MediaBatchItem[] = [
      { kind: "image", payload: suspect },
      { kind: "image", payload: exempt1 },
      { kind: "image", payload: exempt2 },
    ];
    const re = canonicalMediaOrder(batch);
    expect(re[0].payload as ImagePayload).toBe(exempt1);
    expect(re[1].payload as ImagePayload).toBe(exempt2);
    expect(re[2].payload as ImagePayload).toBe(suspect);
  });
});
