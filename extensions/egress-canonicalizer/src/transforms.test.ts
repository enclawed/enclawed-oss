import { describe, expect, it } from "vitest";
import {
  canonicalize,
  canonicalizeJsonOrdering,
  foldMixedScriptHomoglyphs,
  normalizeUnicodeNfc,
  normalizeWhitespace,
  stripBidi,
  stripInvisible,
} from "./transforms.js";

// Invisible / non-ASCII inputs are constructed from code points so this test
// source contains no invisible characters of its own.
const cp = (...codes: number[]): string => String.fromCodePoint(...codes);
const ZWSP = cp(0x200b);
const WORD_JOINER = cp(0x2060);
const BOM = cp(0xfeff);
const TAG_H = cp(0xe0048); // Unicode Tag "H"
const VS_SUPPLEMENT = cp(0xe0101);
const ZWJ = cp(0x200d); // preserved
const VS16 = cp(0xfe0f); // preserved
const RLO = cp(0x202e); // right-to-left override
const LRI = cp(0x2066); // left-to-right isolate
const EM_SPACE = cp(0x2003);
const CYR_A = cp(0x0430); // Cyrillic small "a"
const CYR_O = cp(0x043e); // Cyrillic small "o"

describe("stripInvisible", () => {
  it("removes zero-width space, word joiner and BOM", () => {
    expect(stripInvisible(`a${ZWSP}b${WORD_JOINER}c${BOM}d`)).toBe("abcd");
  });

  it("removes Unicode Tag block characters (ASCII smuggling)", () => {
    expect(stripInvisible(`visible${TAG_H}text`)).toBe("visibletext");
  });

  it("removes the variation-selector supplement (VS smuggling)", () => {
    expect(stripInvisible(`x${VS_SUPPLEMENT}y`)).toBe("xy");
  });

  it("preserves ZWJ and the emoji presentation selector", () => {
    expect(stripInvisible(`a${ZWJ}b`)).toBe(`a${ZWJ}b`);
    expect(stripInvisible(`flag${VS16}`)).toBe(`flag${VS16}`);
  });
});

describe("stripBidi", () => {
  it("removes RTL overrides and isolates", () => {
    expect(stripBidi(`code${RLO}evil${LRI}`)).toBe("codeevil");
  });
});

describe("normalizeWhitespace", () => {
  it("folds exotic spaces and trims trailing whitespace", () => {
    expect(normalizeWhitespace(`a${EM_SPACE}b   `)).toBe("a b");
  });

  it("keeps interior ordinary spaces and newlines", () => {
    expect(normalizeWhitespace("a b\nc d")).toBe("a b\nc d");
  });
});

describe("foldMixedScriptHomoglyphs", () => {
  it("folds a mixed-script token to ASCII", () => {
    // "p<cyrillic-a>yp<cyrillic-a>l" — Latin + Cyrillic in one token.
    expect(foldMixedScriptHomoglyphs(`p${CYR_A}yp${CYR_A}l`)).toBe("paypal");
  });

  it("leaves a pure-Cyrillic word untouched", () => {
    const word = `${CYR_A}${CYR_O}${CYR_A}`; // no Latin — legitimate
    expect(foldMixedScriptHomoglyphs(word)).toBe(word);
  });

  it("leaves pure-ASCII text untouched", () => {
    expect(foldMixedScriptHomoglyphs("hello world")).toBe("hello world");
  });
});

describe("normalizeUnicodeNfc", () => {
  it("collapses a decomposed sequence to its canonical form", () => {
    const decomposed = `e${cp(0x0301)}`; // e + combining acute
    const composed = cp(0x00e9); // é
    expect(normalizeUnicodeNfc(decomposed)).toBe(composed);
  });
});

describe("canonicalizeJsonOrdering", () => {
  it("sorts object keys (kills the permutation channel)", () => {
    expect(canonicalizeJsonOrdering('{"b":1,"a":2}')).toBe('{"a":2,"b":1}');
  });

  it("sorts nested object keys", () => {
    expect(canonicalizeJsonOrdering('{"z":{"y":1,"x":2}}')).toBe('{"z":{"x":2,"y":1}}');
  });

  it("leaves non-JSON text untouched", () => {
    expect(canonicalizeJsonOrdering("just a message")).toBe("just a message");
  });
});

describe("canonicalize (composite)", () => {
  it("applies every transform and reports findings", () => {
    const input = `p${CYR_A}ypal${ZWSP}${TAG_H}  `;
    const result = canonicalize(input);
    expect(result.text).toBe("paypal");
    const codes = result.findings.map((f) => f.code);
    expect(codes).toContain("invisible-strip");
    expect(codes).toContain("homoglyph-fold");
  });

  it("is a no-op (no findings) for clean ASCII text", () => {
    const result = canonicalize("perfectly normal message");
    expect(result.text).toBe("perfectly normal message");
    expect(result.findings).toHaveLength(0);
  });

  it("reports estimated covert bits removed for invisible carriers", () => {
    const result = canonicalize(`secret${ZWSP}${ZWSP}${TAG_H}`);
    const finding = result.findings.find((f) => f.code === "invisible-strip");
    expect(finding?.estimatedBits).toBeGreaterThan(0);
  });

  it("honors disabled transforms", () => {
    const result = canonicalize(`a${ZWSP}b`, { stripInvisible: false });
    expect(result.text).toBe(`a${ZWSP}b`);
  });
});
