import { describe, expect, it } from "vitest";
import { resolveImageScramblerConfig } from "./config.js";
import { defaultImageScramblerOptions } from "./scrambler.js";

describe("resolveImageScramblerConfig", () => {
  it("keeps the RGB defaults when nothing is set", () => {
    expect(resolveImageScramblerConfig(undefined)).toEqual({
      enabled: true,
      options: defaultImageScramblerOptions,
    });
  });

  it("reads colorSpace, depthLevels and luminanceBuckets", () => {
    expect(
      resolveImageScramblerConfig({ colorSpace: "cmyk", depthLevels: 32, luminanceBuckets: 4 })
        .options,
    ).toEqual({ colorSpace: "cmyk", depthLevels: 32, luminanceBuckets: 4 });
  });

  it("accepts the deprecated colorSpaceRoundtrip alias", () => {
    expect(resolveImageScramblerConfig({ colorSpaceRoundtrip: true }).options.colorSpace).toBe(
      "cmyk",
    );
    expect(resolveImageScramblerConfig({ colorSpaceRoundtrip: false }).options.colorSpace).toBe(
      "rgb",
    );
    expect(
      resolveImageScramblerConfig({ colorSpaceRoundtrip: true, colorSpace: "cmyk" }).options
        .colorSpace,
    ).toBe("cmyk");
  });

  it("attack: values that weaken or switch off the defense are refused", () => {
    expect(() => resolveImageScramblerConfig({ luminanceBuckets: 1 })).toThrow(/luminanceBuckets/);
    expect(() => resolveImageScramblerConfig({ luminanceBuckets: 9 })).toThrow(/luminanceBuckets/);
    expect(() => resolveImageScramblerConfig({ luminanceBuckets: 256 })).toThrow(
      /luminanceBuckets/,
    );
    expect(() => resolveImageScramblerConfig({ depthLevels: 65 })).toThrow(/depthLevels/);
    expect(() => resolveImageScramblerConfig({ depthLevels: 128 })).toThrow(/depthLevels/);
    expect(() => resolveImageScramblerConfig({ depthLevels: 256 })).toThrow(/depthLevels/);
  });

  it("FP: the defaults and coarser settings load", () => {
    expect(
      resolveImageScramblerConfig({ depthLevels: 64, luminanceBuckets: 8 }).options,
    ).toMatchObject({ depthLevels: 64, luminanceBuckets: 8 });
    expect(
      resolveImageScramblerConfig({ depthLevels: 2, luminanceBuckets: 2 }).options,
    ).toMatchObject({ depthLevels: 2, luminanceBuckets: 2 });
  });

  it("refuses bad or conflicting values", () => {
    expect(() =>
      resolveImageScramblerConfig({ colorSpaceRoundtrip: true, colorSpace: "rgb" }),
    ).toThrow(/conflicts/);
    expect(() => resolveImageScramblerConfig({ colorSpace: "lab" })).toThrow(/one of rgb, cmyk/);
    expect(() => resolveImageScramblerConfig({ depthLevels: 1 })).toThrow(/depthLevels/);
    expect(() => resolveImageScramblerConfig({ depthLevels: 64.5 })).toThrow(/integer/);
    expect(() => resolveImageScramblerConfig({ luminanceBuckets: 0 })).toThrow(/luminanceBuckets/);
    expect(() => resolveImageScramblerConfig({ bits: 6 })).toThrow(/unknown option/);
  });
});
