import { describe, expect, it } from "vitest";
import { resolveNoiseOptions } from "./config.js";
import { defaultNoiseOptions, injectNoise } from "./noise.js";

describe("resolveNoiseOptions", () => {
  it("keeps every transform on by default", () => {
    expect(resolveNoiseOptions(undefined)).toEqual(defaultNoiseOptions);
  });

  it("attack: switching any transform off is refused", () => {
    for (const key of Object.keys(defaultNoiseOptions)) {
      expect(() => resolveNoiseOptions({ [key]: false })).toThrow(new RegExp(`${key} is fixed on`));
    }
  });

  it("FP: restating the defaults loads and the transforms still run", () => {
    const opts = resolveNoiseOptions({ collapsePunctuationRuns: true });
    expect(opts).toEqual(defaultNoiseOptions);
    expect(injectNoise("wow!!!", opts).text).not.toBe("wow!!!");
  });

  it("refuses non-boolean values and unknown keys", () => {
    expect(() => resolveNoiseOptions({ normalizeTypography: 1 })).toThrow(/must be a boolean/);
    expect(() => resolveNoiseOptions({ enabled: true })).toThrow(/unknown option/);
  });
});
