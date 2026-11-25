import { describe, expect, it } from "vitest";
import { resolveSemanticScramblerConfig } from "./config.js";
import { defaultScramblerOptions, scramble } from "./scrambler.js";

describe("resolveSemanticScramblerConfig", () => {
  it("defaults to enabled with every transform on", () => {
    expect(resolveSemanticScramblerConfig(undefined)).toEqual({
      enabled: true,
      options: defaultScramblerOptions,
    });
  });

  it("attack: switching any transform off is refused", () => {
    for (const key of Object.keys(defaultScramblerOptions)) {
      expect(() => resolveSemanticScramblerConfig({ [key]: false })).toThrow(
        new RegExp(`${key} is fixed on`),
      );
    }
  });

  it("FP: restating the defaults loads, and enabled: false still selects the other scrambler", () => {
    const { options } = resolveSemanticScramblerConfig({ expandContractions: true });
    expect(options).toEqual(defaultScramblerOptions);
    expect(scramble("I can't go", options).text).not.toContain("can't");
    expect(resolveSemanticScramblerConfig({ enabled: false }).enabled).toBe(false);
  });

  it("refuses non-boolean values and unknown keys", () => {
    expect(() => resolveSemanticScramblerConfig({ enabled: "no" })).toThrow(/must be a boolean/);
    expect(() => resolveSemanticScramblerConfig({ synonyms: true })).toThrow(/unknown option/);
  });
});
