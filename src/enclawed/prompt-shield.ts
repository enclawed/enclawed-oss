// Defensive helpers for text that flows from untrusted sources into a
// model prompt. NOT a complete prompt-injection defense — that is an
// open research area — but it neutralizes the most common silent-confusion
// vectors (control chars, bidi overrides, zero-width chars, role-boundary
// spoofing, code-fence breakout, common imperative jailbreak phrases) so
// they surface as visible content rather than control signals to the model.

const CONTROL_CHARS = /[\u0000-\u0008\u000B-\u001F\u007F]/g;
const BIDI_OVERRIDES = /[\u202A-\u202E\u2066-\u2069]/g;
const ZERO_WIDTH = /[\u200B-\u200D\u2060\uFEFF]/g;
const ROLE_BOUNDARY = /^[ \t>*_~`]*\b(system|assistant|user|tool|function)\b\s*:/gim;
const FENCE = /^```[a-z0-9_-]*\s*$/gim;
const IMPERATIVE_OVERRIDE =
  /\b(IGNORE|DISREGARD|OVERRIDE)\s+(?:(?:THE|ALL|ANY|YOUR)\s+){0,2}(PREVIOUS|PRIOR|ABOVE|EARLIER)\s+(INSTRUCTIONS?|RULES?|MESSAGES?|PROMPTS?|CONTEXT)/i;

export function stripControlChars(text: string): string {
  if (typeof text !== "string") return text;
  return text.replace(CONTROL_CHARS, "\uFFFD");
}
export function stripBidi(text: string): string {
  if (typeof text !== "string") return text;
  return text.replace(BIDI_OVERRIDES, "");
}
export function stripZeroWidth(text: string): string {
  if (typeof text !== "string") return text;
  return text.replace(ZERO_WIDTH, "");
}

export function neutralizeRoleBoundaries(text: string, marker = "[USER-CONTENT] "): string {
  if (typeof text !== "string") return text;
  return text.replace(ROLE_BOUNDARY, (m) => marker + m);
}

export function neutralizeFences(text: string): string {
  if (typeof text !== "string") return text;
  return text.replace(FENCE, (m) => "\u200B" + m);
}

export function sanitizeForPrompt(text: string): string {
  if (typeof text !== "string") return text;
  let out = stripControlChars(text);
  out = stripBidi(out);
  out = stripZeroWidth(out);
  out = neutralizeRoleBoundaries(out);
  out = neutralizeFences(out);
  return out;
}

export type InjectionFindingId =
  | "control-chars"
  | "bidi-overrides"
  | "zero-width"
  | "role-boundary"
  | "fence"
  | "imperative-override";

export function detectInjection(text: string): InjectionFindingId[] {
  if (typeof text !== "string") return [];
  const findings: InjectionFindingId[] = [];
  const checks: Array<[RegExp, InjectionFindingId]> = [
    [CONTROL_CHARS, "control-chars"],
    [BIDI_OVERRIDES, "bidi-overrides"],
    [ZERO_WIDTH, "zero-width"],
    [ROLE_BOUNDARY, "role-boundary"],
    [FENCE, "fence"],
    [IMPERATIVE_OVERRIDE, "imperative-override"],
  ];
  for (const [re, id] of checks) {
    re.lastIndex = 0;
    if (re.test(text)) findings.push(id);
    re.lastIndex = 0;
  }
  return findings;
}
