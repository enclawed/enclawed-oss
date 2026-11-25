import { describe, expect, it } from "vitest";
import { resolveAudioScramblerOptions } from "./config.js";
import { defaultAudioScramblerOptions } from "./scrambler.js";

describe("resolveAudioScramblerOptions", () => {
  it("keeps the defaults when nothing is set", () => {
    expect(resolveAudioScramblerOptions({})).toEqual(defaultAudioScramblerOptions);
  });

  it("accepts the floor in dB and as a fraction", () => {
    expect(resolveAudioScramblerOptions({ perceptualFloorDb: -40 }).perceptualFloor).toBeCloseTo(
      0.01,
    );
    expect(resolveAudioScramblerOptions({ perceptualFloor: 0.05 }).perceptualFloor).toBe(0.05);
  });

  it("attack: a wider band or a lower floor than shipped is refused", () => {
    expect(() => resolveAudioScramblerOptions({ maxHz: 20001 })).toThrow(/maxHz/);
    expect(() => resolveAudioScramblerOptions({ maxHz: 96000 })).toThrow(/maxHz/);
    expect(() => resolveAudioScramblerOptions({ minHz: 0 })).toThrow(/minHz/);
    expect(() => resolveAudioScramblerOptions({ minHz: 19.9 })).toThrow(/minHz/);
    expect(() => resolveAudioScramblerOptions({ perceptualFloor: 0 })).toThrow(/perceptualFloor/);
    expect(() => resolveAudioScramblerOptions({ perceptualFloor: 0.001 })).toThrow(
      /perceptualFloor/,
    );
    expect(() => resolveAudioScramblerOptions({ perceptualFloorDb: -1000 })).toThrow(
      /perceptualFloorDb/,
    );
    expect(() => resolveAudioScramblerOptions({ perceptualFloorDb: -51 })).toThrow(
      /perceptualFloorDb/,
    );
    expect(() => resolveAudioScramblerOptions({ maxHz: Number.POSITIVE_INFINITY })).toThrow();
    expect(() => resolveAudioScramblerOptions({ maxHz: "20000" })).toThrow(/maxHz/);
    expect(() => resolveAudioScramblerOptions({ band: [0, 1e6] })).toThrow(/unknown option/);
  });

  it("FP: a narrower band and a higher floor are accepted", () => {
    expect(
      resolveAudioScramblerOptions({ minHz: 50, maxHz: 16000, perceptualFloorDb: -40 }),
    ).toMatchObject({ minHz: 50, maxHz: 16000 });
    expect(resolveAudioScramblerOptions({ maxHz: 20000, minHz: 20 })).toEqual(
      defaultAudioScramblerOptions,
    );
    expect(resolveAudioScramblerOptions({ perceptualFloorDb: -50 }).perceptualFloor).toBeCloseTo(
      0.00316,
      5,
    );
  });

  it("refuses invalid or conflicting settings", () => {
    expect(() => resolveAudioScramblerOptions({ perceptualFloorDb: 3 })).toThrow();
    expect(() => resolveAudioScramblerOptions({ perceptualFloor: 1 })).toThrow();
    expect(() =>
      resolveAudioScramblerOptions({ perceptualFloor: 0.01, perceptualFloorDb: -40 }),
    ).toThrow();
    expect(() => resolveAudioScramblerOptions({ minHz: 30000 })).toThrow();
    expect(() => resolveAudioScramblerOptions({ maxHz: Number.NaN })).toThrow();
  });
});
