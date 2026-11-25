import { afterEach, describe, expect, it } from "vitest";
import { STAGE_IDS } from "./config.js";
import { mediateMediaBatch } from "./media-egress.js";
import { resetMediaExemption, setMediaExemptionCheck } from "./media-exemption.js";
import { hashImagePayload } from "./media-hash.js";
import { registerMediaScrambler, resetMediaRegistry, type ImagePayload } from "./media.js";
import type { EgressMode } from "./types.js";

const image = (fill: number, exemption?: unknown): ImagePayload => ({
  width: 2,
  height: 1,
  rgba: new Uint8ClampedArray([fill, fill, fill, 255, fill, fill, fill, 255]),
  exemption,
});

// Clears the low bit of every channel, like a minimal LSB scrambler.
const clearLsb = {
  kind: "image" as const,
  id: STAGE_IDS.imageScrambler,
  scramble: (img: ImagePayload): ImagePayload => ({
    ...img,
    rgba: img.rgba.map((v) => v & 0xfe),
  }),
};

const modes =
  (entries: Record<string, EgressMode>) =>
  (id: string): EgressMode =>
    entries[id] ?? "audit";

afterEach(() => {
  resetMediaRegistry();
  resetMediaExemption();
});

describe("mediateMediaBatch", () => {
  it("drains the shared registry and applies an enforcing scrambler", () => {
    registerMediaScrambler(clearLsb);
    const out = mediateMediaBatch([{ kind: "image", payload: image(101) }], {
      modeFor: modes({ [STAGE_IDS.imageScrambler]: "enforce" }),
    });
    expect(out.cancelled).toBe(false);
    if (out.cancelled) {
      return;
    }
    expect(out.changed).toBe(true);
    expect(Array.from(out.items[0].payload.rgba)).toEqual([100, 100, 100, 254, 100, 100, 100, 254]);
    expect(out.findings.some((f) => f.code === "media-scrambled")).toBe(true);
  });

  it("records but does not apply a scrambler in audit mode", () => {
    const original = image(101);
    const out = mediateMediaBatch([{ kind: "image", payload: original }], {
      modeFor: modes({}),
      scramblers: [clearLsb],
    });
    expect(out.cancelled).toBe(false);
    if (out.cancelled) {
      return;
    }
    expect(out.changed).toBe(false);
    expect(out.items[0].payload).toBe(original);
    expect(out.findings.map((f) => f.code)).toContain("rewrite-suppressed-audit");
  });

  it("skips a scrambler whose mode is off", () => {
    const out = mediateMediaBatch([{ kind: "image", payload: image(101) }], {
      modeFor: modes({ [STAGE_IDS.imageScrambler]: "off", [STAGE_IDS.mediaOrder]: "off" }),
      scramblers: [clearLsb],
    });
    expect(out.cancelled ? -1 : out.findings.length).toBe(0);
  });

  it("cancels the batch when an enforcing scrambler throws, skips it when auditing", () => {
    const broken = {
      kind: "image" as const,
      id: STAGE_IDS.imageScrambler,
      scramble: (): ImagePayload => {
        throw new Error("boom");
      },
    };
    const batch = [{ kind: "image" as const, payload: image(1) }];
    const enforced = mediateMediaBatch(batch, {
      modeFor: modes({ [STAGE_IDS.imageScrambler]: "enforce" }),
      scramblers: [broken],
    });
    expect(enforced.cancelled).toBe(true);
    const audited = mediateMediaBatch(batch, { modeFor: modes({}), scramblers: [broken] });
    expect(audited.cancelled).toBe(false);
  });

  it("puts the batch into content-hash order in enforce mode, keeps order in audit", () => {
    const a = { kind: "image" as const, payload: image(10), name: "a" };
    const b = { kind: "image" as const, payload: image(20), name: "b" };
    const c = { kind: "image" as const, payload: image(30), name: "c" };
    const expected = [a, b, c]
      .toSorted((x, y) => (hashImagePayload(x.payload) < hashImagePayload(y.payload) ? -1 : 1))
      .map((x) => x.name);
    for (const order of [
      [a, b, c],
      [c, b, a],
      [b, a, c],
    ]) {
      const out = mediateMediaBatch(order, {
        modeFor: modes({ [STAGE_IDS.mediaOrder]: "enforce" }),
        scramblers: [],
      });
      expect(out.cancelled ? [] : out.items.map((x) => x.name)).toEqual(expected);
    }
    const audited = mediateMediaBatch([c, b, a], { modeFor: modes({}), scramblers: [] });
    expect(audited.cancelled ? [] : audited.items.map((x) => x.name)).toEqual(["c", "b", "a"]);
  });

  it("leaves exempt items unscrambled and first", () => {
    setMediaExemptionCheck((s) => s.payload.exemption === "ok");
    const exempt = { kind: "image" as const, payload: image(101, "ok"), name: "exempt" };
    const plain = { kind: "image" as const, payload: image(55), name: "plain" };
    const out = mediateMediaBatch([plain, exempt], {
      modeFor: () => "enforce",
      scramblers: [
        {
          kind: "image",
          id: STAGE_IDS.imageScrambler,
          // Mirrors the shipped wrappers: exempt payloads pass unchanged.
          scramble: (img) => (img.exemption === "ok" ? img : clearLsb.scramble(img)),
        },
      ],
    });
    expect(out.cancelled).toBe(false);
    if (out.cancelled) {
      return;
    }
    expect(out.items.map((x) => x.name)).toEqual(["exempt", "plain"]);
    expect(out.items[0].payload.rgba[0]).toBe(101);
    expect(out.items[1].payload.rgba[0]).toBe(54);
  });
});
