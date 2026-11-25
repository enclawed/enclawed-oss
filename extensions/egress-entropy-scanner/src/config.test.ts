import { createCapacityLedger } from "@enclawed/egress-core";
import { describe, expect, it } from "vitest";
import { resolveEntropyOptions } from "./config.js";
import { defaultEntropyOptions } from "./entropy.js";
import { buildEntropyScannerStage } from "./stage.js";

describe("resolveEntropyOptions", () => {
  it("keeps the built-in thresholds by default", () => {
    expect(resolveEntropyOptions(undefined)).toEqual(defaultEntropyOptions);
  });

  it("passes configured thresholds to the stage", async () => {
    const opts = resolveEntropyOptions({ minBlobLength: 16 });
    expect(opts.minBlobLength).toBe(16);
    const findings: string[] = [];
    const stage = buildEntropyScannerStage(opts);
    // A 32-character base64 run: below the default 64, above the configured 16.
    await stage.apply("token QUJDREVGR0hJSktMTU5PUFFSU1RVVldY end", {
      sink: { kind: "channel", id: "s" },
      ledger: createCapacityLedger({ capacityBits: 1e6, refillBitsPerSec: 0, now: () => 0 }),
      mode: "audit",
      now: () => 0,
      audit: (f) => findings.push(f.code),
    });
    expect(findings).toContain("base64-blob");
    const defaults: string[] = [];
    await buildEntropyScannerStage(resolveEntropyOptions({})).apply(
      "token QUJDREVGR0hJSktMTU5PUFFSU1RVVldY end",
      {
        sink: { kind: "channel", id: "s" },
        ledger: createCapacityLedger({ capacityBits: 1e6, refillBitsPerSec: 0, now: () => 0 }),
        mode: "audit",
        now: () => 0,
        audit: (f) => defaults.push(f.code),
      },
    );
    expect(defaults).not.toContain("base64-blob");
  });

  it("attack: thresholds looser than the shipped defaults are refused", () => {
    expect(() => resolveEntropyOptions({ minBlobLength: 65_536 })).toThrow(/minBlobLength/);
    expect(() => resolveEntropyOptions({ minBlobLength: 65 })).toThrow(/minBlobLength/);
    expect(() => resolveEntropyOptions({ entropyThresholdBits: 6 })).toThrow(
      /entropyThresholdBits/,
    );
    expect(() => resolveEntropyOptions({ incompressibleRatio: 1 })).toThrow(/incompressibleRatio/);
    expect(() => resolveEntropyOptions({ incompressibleRatio: 0.93 })).toThrow(
      /incompressibleRatio/,
    );
  });

  it("FP: the defaults and stricter values load", () => {
    expect(resolveEntropyOptions({ minBlobLength: 64, entropyThresholdBits: 5.4 })).toEqual(
      defaultEntropyOptions,
    );
    expect(
      resolveEntropyOptions({ entropyThresholdBits: 4, incompressibleRatio: 0.8 }),
    ).toMatchObject({
      entropyThresholdBits: 4,
      incompressibleRatio: 0.8,
    });
  });

  it("refuses out-of-range values", () => {
    expect(() => resolveEntropyOptions({ minBlobLength: 4 })).toThrow(/minBlobLength/);
    expect(() => resolveEntropyOptions({ minBlobLength: 20.5 })).toThrow(/integer/);
    expect(() => resolveEntropyOptions({ entropyThresholdBits: 0 })).toThrow(
      /entropyThresholdBits/,
    );
    expect(() => resolveEntropyOptions({ incompressibleRatio: 1.5 })).toThrow(
      /incompressibleRatio/,
    );
    expect(() => resolveEntropyOptions({ threshold: 3 })).toThrow(/unknown option/);
  });
});
