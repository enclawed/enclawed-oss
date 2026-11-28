import { describe, expect, it } from "vitest";
import {
  collapsePunctuationRuns,
  collapseWhitespaceRuns,
  injectNoise,
  normalizeTypography,
} from "./noise.js";

const cp = (n: number): string => String.fromCodePoint(n);

describe("collapseWhitespaceRuns", () => {
  it("collapses runs of spaces", () => {
    expect(collapseWhitespaceRuns("a     b")).toBe("a b");
  });
  it("collapses excess blank lines", () => {
    expect(collapseWhitespaceRuns("a\n\n\n\n\nb")).toBe("a\n\nb");
  });
  it("leaves single spacing intact", () => {
    expect(collapseWhitespaceRuns("a b\nc")).toBe("a b\nc");
  });
});

describe("normalizeTypography", () => {
  it("folds curly quotes to straight quotes", () => {
    expect(normalizeTypography(`${cp(0x201c)}hi${cp(0x201d)}`)).toBe('"hi"');
  });
  it("folds em/en dashes to hyphen and ellipsis char to dots", () => {
    expect(normalizeTypography(`a${cp(0x2014)}b${cp(0x2026)}`)).toBe("a-b...");
  });
});

describe("collapsePunctuationRuns", () => {
  it("collapses repeated punctuation", () => {
    expect(collapsePunctuationRuns("wow!!! really??? yes...")).toBe("wow! really? yes.");
  });
});

describe("injectNoise", () => {
  it("applies every transform and reports findings", () => {
    const result = injectNoise(`hey${cp(0x2014)}there!!!   done`);
    expect(result.text).toBe("hey-there! done");
    expect(result.findings.length).toBeGreaterThan(0);
  });

  it("is a no-op for already-canonical text", () => {
    const result = injectNoise("a normal, tidy sentence.");
    expect(result.text).toBe("a normal, tidy sentence.");
    expect(result.findings).toHaveLength(0);
  });

  it("honors disabled transforms", () => {
    const result = injectNoise("a     b", { collapseWhitespaceRuns: false });
    expect(result.text).toBe("a     b");
  });
});
