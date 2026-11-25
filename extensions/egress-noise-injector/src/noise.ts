// Semantic noise injection — Shannon-entropy destruction of covert encodings.
//
// Where the canonicalizer removes *invisible* stego carriers losslessly, the
// noise injector collapses the *visible* equivalence classes a human reader
// cannot distinguish: runs of whitespace, typographic variants, repeated
// punctuation. Any data an attacker encoded in "how many spaces" or "which
// dash" or "how many exclamation marks" is destroyed because every member of
// the equivalence class maps to one canonical representative.
//
// This is mildly lossy (a user's triple space becomes one), so the stage runs
// in `audit` mode by default and is escalated to `enforce` per deployment.

export type NoiseOptions = {
  collapseWhitespaceRuns: boolean;
  normalizeTypography: boolean;
  collapsePunctuationRuns: boolean;
};

export const defaultNoiseOptions: NoiseOptions = {
  collapseWhitespaceRuns: true,
  normalizeTypography: true,
  collapsePunctuationRuns: true,
};

export type NoiseFinding = {
  severity: "info" | "low" | "medium" | "high";
  code: string;
  message: string;
  estimatedBits: number;
};

export type NoiseResult = { text: string; findings: NoiseFinding[] };

// Typographic variants → canonical ASCII. Built from code points so the source
// carries no ambiguous characters.
const TYPOGRAPHY: ReadonlyArray<readonly [number, string]> = [
  [0x2018, "'"], // left single quote
  [0x2019, "'"], // right single quote
  [0x201c, '"'], // left double quote
  [0x201d, '"'], // right double quote
  [0x2013, "-"], // en dash
  [0x2014, "-"], // em dash
  [0x2026, "..."], // horizontal ellipsis
  [0x00a0, " "], // no-break space
];

/** Collapse runs of spaces/tabs/newlines to a canonical minimum. */
export function collapseWhitespaceRuns(input: string): string {
  return input
    .replace(/[^\S\r\n]{2,}/gu, " ")
    .replace(/\t/gu, " ")
    .replace(/\n{3,}/gu, "\n\n");
}

/** Map typographic variants onto canonical ASCII. */
export function normalizeTypography(input: string): string {
  let out = input;
  for (const [cp, replacement] of TYPOGRAPHY) {
    out = out.split(String.fromCodePoint(cp)).join(replacement);
  }
  return out;
}

/** Collapse repeated punctuation (`!!!` -> `!`, `???` -> `?`). */
export function collapsePunctuationRuns(input: string): string {
  return input.replace(/([!?.])\1{1,}/gu, "$1");
}

/** Apply the configured noise-injection transforms. */
export function injectNoise(input: string, options?: Partial<NoiseOptions>): NoiseResult {
  const opts = { ...defaultNoiseOptions, ...options };
  const findings: NoiseFinding[] = [];
  let text = input;

  if (opts.collapseWhitespaceRuns) {
    const next = collapseWhitespaceRuns(text);
    if (next !== text) {
      findings.push({
        severity: "low",
        code: "whitespace-run-collapse",
        message: "collapsed whitespace runs (destroys whitespace-count encoding)",
        estimatedBits: Math.abs(text.length - next.length),
      });
      text = next;
    }
  }

  if (opts.normalizeTypography) {
    const next = normalizeTypography(text);
    if (next !== text) {
      findings.push({
        severity: "low",
        code: "typography-normalize",
        message: "normalized typographic variants (destroys glyph-choice encoding)",
        estimatedBits: 8,
      });
      text = next;
    }
  }

  if (opts.collapsePunctuationRuns) {
    const next = collapsePunctuationRuns(text);
    if (next !== text) {
      findings.push({
        severity: "low",
        code: "punctuation-run-collapse",
        message: "collapsed repeated punctuation (destroys punctuation-count encoding)",
        estimatedBits: Math.abs(text.length - next.length),
      });
      text = next;
    }
  }

  return { text, findings };
}
