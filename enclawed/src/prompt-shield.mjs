// Defensive helpers for text that flows from untrusted sources (user,
// channel, retrieved document) into a model prompt. The framework does
// NOT promise these defeat all prompt injection — that is an open
// research area — but they neutralize the most common silent-confusion
// vectors so they show up as visible characters rather than control
// signals to the model.

const CONTROL_CHARS = /[\u0000-\u0008\u000B-\u001F\u007F]/g; // C0 minus \t/\n
const BIDI_OVERRIDES = /[\u202A-\u202E\u2066-\u2069]/g;
const ZERO_WIDTH = /[\u200B-\u200D\u2060\uFEFF]/g;

// Matches lines that look like role boundaries — "system:", "assistant:",
// "user:", "tool:", "function:". Case-insensitive, with optional leading
// whitespace and optional surrounding markdown emphasis.
const ROLE_BOUNDARY = /^[ \t>*_~`]*\b(system|assistant|user|tool|function)\b\s*:/gim;

// Matches LLM serialization tokens commonly used as role boundaries in
// actual chat-template formats: ChatML (<|im_start|>, <|im_end|>),
// Llama-2/Mistral instruct ([INST], [/INST]), <|system|>/<|user|>/
// <|assistant|>, GPT-style <|endoftext|>, and XML-style closings
// </system>, </user>, </assistant>. These are the modern prompt-
// injection vectors -- the older ROLE_BOUNDARY pattern (above) only
// catches the human-readable "system:" form and misses these.
const ROLE_BOUNDARY_TOKEN = /(<\|(?:im_start|im_end|endoftext|system|user|assistant|tool|function)\|>|<\/(?:system|user|assistant|tool|function)>|\[\/?INST\]|<\|reserved_special_token_\d+\|>)/gi;

const FENCE = /^```[a-z0-9_-]*\s*$/gim;

export function stripControlChars(text) {
  if (typeof text !== 'string') return text;
  return text.replace(CONTROL_CHARS, '\uFFFD');
}

export function stripBidi(text) {
  if (typeof text !== 'string') return text;
  return text.replace(BIDI_OVERRIDES, '');
}

export function stripZeroWidth(text) {
  if (typeof text !== 'string') return text;
  return text.replace(ZERO_WIDTH, '');
}

// Insert a marker prefix on lines that look like role boundaries so the
// model sees them as quoted user content, not as a fresh chat turn.
export function neutralizeRoleBoundaries(text, marker = '[USER-CONTENT] ') {
  if (typeof text !== 'string') return text;
  return text.replace(ROLE_BOUNDARY, (m) => marker + m);
}

// Escape unbalanced markdown code fences so the model cannot use a
// closing ``` to break out of a quoted block we wrap untrusted text in.
export function neutralizeFences(text) {
  if (typeof text !== 'string') return text;
  return text.replace(FENCE, (m) => '\u200B' + m);
}

// One-call sanitizer for "this string is about to be inlined into a
// model prompt as untrusted content". Order matters: strip controls
// first, then bidi/zero-width, then re-introduce visible markers.
export function sanitizeForPrompt(text) {
  if (typeof text !== 'string') return text;
  let out = stripControlChars(text);
  out = stripBidi(out);
  out = stripZeroWidth(out);
  out = neutralizeRoleBoundaries(out);
  out = neutralizeFences(out);
  return out;
}

// Detect (without modifying) whether a string contains injection-shaped
// content. Returns an array of finding ids; empty when clean.
export function detectInjection(text) {
  if (typeof text !== 'string') return [];
  const findings = [];
  if (CONTROL_CHARS.test(text)) findings.push('control-chars');
  CONTROL_CHARS.lastIndex = 0;
  if (BIDI_OVERRIDES.test(text)) findings.push('bidi-overrides');
  BIDI_OVERRIDES.lastIndex = 0;
  if (ZERO_WIDTH.test(text)) findings.push('zero-width');
  ZERO_WIDTH.lastIndex = 0;
  if (ROLE_BOUNDARY.test(text)) findings.push('role-boundary');
  ROLE_BOUNDARY.lastIndex = 0;
  if (ROLE_BOUNDARY_TOKEN.test(text)) findings.push('role-boundary-token');
  ROLE_BOUNDARY_TOKEN.lastIndex = 0;
  if (FENCE.test(text)) findings.push('fence');
  FENCE.lastIndex = 0;
  // Heuristic: imperative override phrasings common in jailbreaks.
  // Verb set extended beyond IGNORE/DISREGARD/OVERRIDE to cover the
  // attack patterns observed in practice: BYPASS (gate-skip),
  // FORGET (memory-reset), PURGE (memory-wipe). Filler set permits
  // up to three fillers from {THE, ALL, ANY, YOUR, ANY OF, ALL OF}
  // between the verb and the prior-reference word; the prior set is
  // {PREVIOUS, PRIOR, ABOVE, EARLIER, FOREGOING} and the target set
  // is broadened to include SAFEGUARDS, SAFETY, GUIDELINES, POLICIES,
  // CONSTRAINTS in addition to the original INSTRUCTIONS-class.
  if (/\b(IGNORE|DISREGARD|OVERRIDE|BYPASS|FORGET|PURGE)\s+(?:(?:THE|ALL|ANY|YOUR|OF)\s+){0,3}(PREVIOUS|PRIOR|ABOVE|EARLIER|FOREGOING)\s+(INSTRUCTIONS?|RULES?|MESSAGES?|PROMPTS?|CONTEXT|SAFEGUARDS?|SAFETY|GUIDELINES?|POLICIES|POLICY|CONSTRAINTS?)/i.test(text)) {
    findings.push('imperative-override');
  }
  // Imperative override variants where the prior-reference is omitted
  // entirely ("ignore your safety guidelines", "bypass your rules"):
  // verb + 1-2 fillers + target. Catches the prior-less form that
  // attackers use against more permissive models.
  if (/\b(IGNORE|DISREGARD|OVERRIDE|BYPASS|FORGET|PURGE)\s+(?:(?:THE|ALL|ANY|YOUR|OF)\s+){0,3}(SAFEGUARDS?|SAFETY|GUIDELINES?|POLICIES|POLICY|CONSTRAINTS?|RULES?)\b/i.test(text)) {
    findings.push('imperative-override');
  }
  return findings;
}
