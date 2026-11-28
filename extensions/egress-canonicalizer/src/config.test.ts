import { createCapacityLedger } from "@enclawed/egress-core";
import { describe, expect, it } from "vitest";
import { resolveCanonicalizerOptions } from "./config.js";
import { buildCanonicalizerStage } from "./stage.js";
import { defaultCanonicalizerOptions } from "./transforms.js";

const ctx = {
  sink: { kind: "channel" as const, id: "s" },
  ledger: createCapacityLedger({ capacityBits: 1, refillBitsPerSec: 0, now: () => 0 }),
  mode: "enforce" as const,
  now: () => 0,
  audit: () => {},
};

describe("resolveCanonicalizerOptions", () => {
  it("keeps every transform on by default", () => {
    expect(resolveCanonicalizerOptions(undefined)).toEqual(defaultCanonicalizerOptions);
  });

  it("attack: switching any transform off is refused", () => {
    for (const key of Object.keys(defaultCanonicalizerOptions)) {
      expect(() => resolveCanonicalizerOptions({ [key]: false })).toThrow(
        new RegExp(`${key} is fixed on`),
      );
    }
  });

  it("FP: restating the defaults loads, and the stage still canonicalizes", async () => {
    const opts = resolveCanonicalizerOptions({ canonicalizeJson: true, stripBidi: true });
    expect(opts).toEqual(defaultCanonicalizerOptions);
    const stage = buildCanonicalizerStage(opts);
    expect(await stage.apply('{"b":1,"a":2}', ctx)).toEqual({
      action: "rewrite",
      content: '{"a":2,"b":1}',
    });
  });

  it("refuses non-boolean values and unknown keys", () => {
    expect(() => resolveCanonicalizerOptions({ stripInvisible: "no" })).toThrow(
      /egress-canonicalizer: invalid config: stripInvisible must be a boolean/,
    );
    expect(() => resolveCanonicalizerOptions({ stripEverything: true })).toThrow(/unknown option/);
  });
});

describe("canonicalizer stage: segmented payloads", () => {
  it("canonicalizes a JSON segment on its own and keeps the boundaries", async () => {
    const stage = buildCanonicalizerStage();
    const boundary = "\n\u001f42\u001f\n";
    const decision = await stage.apply(`to-user  ${boundary}{"b":1,"a":2}`, {
      ...ctx,
      segmentBoundary: boundary,
    });
    expect(decision).toEqual({ action: "rewrite", content: `to-user${boundary}{"a":2,"b":1}` });
  });
});
