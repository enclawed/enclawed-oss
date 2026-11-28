// Output canonicalization — the lossless covert-channel killer.
//
// Each transform destroys the bits an attacker can encode in one textual
// dimension while preserving the meaning of legitimate text:
//   - Unicode NFC          : collapses equivalent code-point sequences
//   - invisible-char strip : removes tag chars / zero-width / BOM stego carriers
//   - bidi-control strip   : removes RTL/LTR override stego (and Trojan-Source)
//   - mixed-script fold    : folds homoglyph attacks (Latin+Cyrillic in one word)
//   - whitespace normalize : removes trailing + exotic-space stego
//   - JSON ordering        : canonicalizes object-key order (permutation channel)
//
// Transforms only ever *remove* covert capacity; legitimate single-script text,
// emoji (ZWJ and U+FE0E/U+FE0F presentation selectors preserved) and ordinary
// punctuation are untouched. Every control / invisible code point is expressed
// as a numeric range and the matching regexes are built programmatically, so
// this source file contains no invisible characters of its own.

export type CanonicalizerOptions = {
  unicodeNfc: boolean;
  stripInvisible: boolean;
  stripBidi: boolean;
  foldMixedScript: boolean;
  normalizeWhitespace: boolean;
  canonicalizeJson: boolean;
};

export const defaultCanonicalizerOptions: CanonicalizerOptions = {
  unicodeNfc: true,
  stripInvisible: true,
  stripBidi: true,
  foldMixedScript: true,
  normalizeWhitespace: true,
  canonicalizeJson: true,
};

export type TransformFinding = {
  severity: "info" | "low" | "medium" | "high";
  code: string;
  message: string;
  estimatedBits: number;
};

export type CanonicalizeResult = { text: string; findings: TransformFinding[] };

type Range = readonly [number, number];

function buildRangeRegex(ranges: readonly Range[], flags: string): RegExp {
  const cls = ranges
    .map(([lo, hi]) =>
      lo === hi ? `\\u{${lo.toString(16)}}` : `\\u{${lo.toString(16)}}-\\u{${hi.toString(16)}}`,
    )
    .join("");
  return new RegExp(`[${cls}]`, flags);
}

// --- invisible characters -------------------------------------------------
// No legitimate use in chat/agent text. ZWJ (U+200D) and ZWNJ (U+200C) are
// deliberately EXCLUDED — they carry meaning in emoji sequences / Indic
// scripts — as are the U+FE0E/U+FE0F emoji presentation selectors.
const INVISIBLE_RANGES: readonly Range[] = [
  [0x200b, 0x200b], // zero-width space
  [0x2060, 0x2064], // word joiner + invisible math operators
  [0xfeff, 0xfeff], // BOM / zero-width no-break space
  [0x180e, 0x180e], // Mongolian vowel separator
  [0xfe00, 0xfe0d], // variation selectors 1-14 (VS15/16 preserved)
  [0xe0000, 0xe007f], // Unicode Tag block ("ASCII smuggling")
  [0xe0100, 0xe01ef], // variation-selector supplement ("VS smuggling")
];

// --- bidirectional controls ----------------------------------------------
// U+202A-U+202E embeddings/overrides, U+2066-U+2069 isolates — the
// Trojan-Source / bidi-stego carrier.
const BIDI_RANGES: readonly Range[] = [
  [0x202a, 0x202e],
  [0x2066, 0x2069],
];

// --- exotic whitespace ----------------------------------------------------
// Unicode spaces an attacker can interleave as a binary alphabet. Ordinary
// spaces, tabs, newlines and U+00A0 NBSP are intentionally excluded.
const EXOTIC_SPACE_RANGES: readonly Range[] = [
  [0x2000, 0x200a], // en/em/thin/hair spaces
  [0x202f, 0x202f], // narrow no-break space
  [0x205f, 0x205f], // medium mathematical space
  [0x3000, 0x3000], // ideographic space
];

const INVISIBLE_RE = buildRangeRegex(INVISIBLE_RANGES, "gu");
const BIDI_RE = buildRangeRegex(BIDI_RANGES, "gu");
const EXOTIC_SPACE_RE = buildRangeRegex(EXOTIC_SPACE_RANGES, "gu");

/** NFC normalization — equivalent sequences collapse to one canonical form. */
export function normalizeUnicodeNfc(input: string): string {
  return input.normalize("NFC");
}

/** Count regex matches without mutating lastIndex of a shared regex. */
function countMatches(input: string, ranges: readonly Range[]): number {
  return (input.match(buildRangeRegex(ranges, "gu")) ?? []).length;
}

/** Remove invisible/tag/zero-width stego carriers. */
export function stripInvisible(input: string): string {
  return input.replace(INVISIBLE_RE, "");
}

/** Remove bidirectional control characters. */
export function stripBidi(input: string): string {
  return input.replace(BIDI_RE, "");
}

/** Normalize trailing whitespace and exotic Unicode spaces. */
export function normalizeWhitespace(input: string): string {
  return input
    .replace(EXOTIC_SPACE_RE, " ")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/u, ""))
    .join("\n");
}

// --- homoglyph confusables -----------------------------------------------
// Cyrillic / Greek code points that are visually identical to ASCII letters.
const CONFUSABLES: Readonly<Record<string, string>> = {
  // Cyrillic → Latin
  а: "a",
  е: "e",
  о: "o",
  р: "p",
  с: "c",
  у: "y",
  х: "x",
  і: "i",
  ѕ: "s",
  ј: "j",
  һ: "h",
  А: "A",
  В: "B",
  Е: "E",
  К: "K",
  М: "M",
  Н: "H",
  О: "O",
  Р: "P",
  С: "C",
  Т: "T",
  У: "Y",
  Х: "X",
  Ѕ: "S",
  І: "I",
  // Greek → Latin
  ο: "o",
  Ο: "O",
  Α: "A",
  Β: "B",
  Ε: "E",
  Ζ: "Z",
  Η: "H",
  Ι: "I",
  Κ: "K",
  Μ: "M",
  Ν: "N",
  Ρ: "P",
  Τ: "T",
  Υ: "Y",
  Χ: "X",
  α: "a",
  ι: "i",
  ν: "v",
};

const LATIN_RE = /[A-Za-z]/u;
const CYRILLIC_RE = buildRangeRegex([[0x0400, 0x052f]], "u");
const GREEK_RE = buildRangeRegex([[0x0370, 0x03ff]], "u");

/**
 * Fold homoglyphs, but ONLY inside whitespace-delimited tokens that mix Latin
 * with Cyrillic/Greek. A pure-Cyrillic word (legitimate Russian) is untouched;
 * a token like "paypal" with a Cyrillic 'a' is folded to ASCII.
 */
export function foldMixedScriptHomoglyphs(input: string): string {
  return input
    .split(/(\s+)/u)
    .map((token) => {
      if (!LATIN_RE.test(token)) {
        return token;
      }
      if (!CYRILLIC_RE.test(token) && !GREEK_RE.test(token)) {
        return token;
      }
      return Array.from(token, (ch) => CONFUSABLES[ch] ?? ch).join("");
    })
    .join("");
}

/** Recursively sort object keys so element order carries no information. */
function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJsonValue);
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).toSorted()) {
      out[key] = sortJsonValue((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

/**
 * If the whole payload is a JSON object/array, re-emit it with sorted keys.
 * Destroys the log2(n!) bits an attacker can encode in object-key ordering.
 * Non-JSON payloads are returned unchanged.
 */
export function canonicalizeJsonOrdering(input: string): string {
  const trimmed = input.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    return input;
  }
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== "object") {
      return input;
    }
    return JSON.stringify(sortJsonValue(parsed));
  } catch {
    return input;
  }
}

/**
 * Run the configured transforms in order and report what each one removed.
 * Returns the canonicalized text plus a finding per transform that fired.
 */
export function canonicalize(
  input: string,
  options?: Partial<CanonicalizerOptions>,
): CanonicalizeResult {
  const opts = { ...defaultCanonicalizerOptions, ...options };
  const findings: TransformFinding[] = [];
  let text = input;

  if (opts.unicodeNfc) {
    const next = normalizeUnicodeNfc(text);
    if (next !== text) {
      findings.push({
        severity: "low",
        code: "unicode-nfc",
        message: "normalized non-canonical Unicode sequences (NFC)",
        estimatedBits: Math.abs(text.length - next.length) * 4,
      });
      text = next;
    }
  }

  if (opts.stripInvisible) {
    const removed = countMatches(text, INVISIBLE_RANGES);
    if (removed > 0) {
      text = stripInvisible(text);
      findings.push({
        severity: "high",
        code: "invisible-strip",
        message: `removed ${removed} invisible/tag/zero-width character(s)`,
        // each invisible carrier can encode several bits; bound generously
        estimatedBits: removed * 8,
      });
    }
  }

  if (opts.stripBidi) {
    const removed = countMatches(text, BIDI_RANGES);
    if (removed > 0) {
      text = stripBidi(text);
      findings.push({
        severity: "high",
        code: "bidi-strip",
        message: `removed ${removed} bidirectional control character(s)`,
        estimatedBits: removed * 4,
      });
    }
  }

  if (opts.foldMixedScript) {
    const next = foldMixedScriptHomoglyphs(text);
    if (next !== text) {
      let folded = 0;
      for (let i = 0; i < next.length && i < text.length; i++) {
        if (next[i] !== text[i]) {
          folded++;
        }
      }
      text = next;
      findings.push({
        severity: "medium",
        code: "homoglyph-fold",
        message: `folded ${folded} mixed-script homoglyph(s) to ASCII`,
        estimatedBits: folded,
      });
    }
  }

  if (opts.normalizeWhitespace) {
    const next = normalizeWhitespace(text);
    if (next !== text) {
      findings.push({
        severity: "medium",
        code: "whitespace-normalize",
        message: "normalized trailing/exotic whitespace",
        estimatedBits: Math.abs(text.length - next.length) * 2,
      });
      text = next;
    }
  }

  if (opts.canonicalizeJson) {
    const next = canonicalizeJsonOrdering(text);
    if (next !== text) {
      findings.push({
        severity: "low",
        code: "json-key-order",
        message: "canonicalized JSON object-key ordering",
        estimatedBits: 16,
      });
      text = next;
    }
  }

  return { text, findings };
}
