// Static credential / PII detection.
//
// Credentials (API keys, private keys, JWTs, Luhn-valid card numbers) are
// high-confidence — near-zero false positives — and drive a hard block in
// enforce mode. Generic PII (email, IP) is lower-confidence and informational
// only: it is reported but never blocks, because legitimate messages routinely
// contain it.

export type SecretSeverity = "low" | "high";

export type SecretMatch = {
  kind: string;
  severity: SecretSeverity;
  index: number;
  length: number;
};

// High-confidence credential carriers.
const CREDENTIAL_PATTERNS: ReadonlyArray<{ kind: string; re: RegExp }> = [
  { kind: "openai-key", re: /sk-[A-Za-z0-9]{20,}/g },
  { kind: "github-token", re: /gh[pousr]_[A-Za-z0-9]{30,}/g },
  { kind: "slack-token", re: /xox[baprs]-[A-Za-z0-9-]{10,}/g },
  { kind: "aws-access-key", re: /AKIA[0-9A-Z]{16}/g },
  { kind: "google-api-key", re: /AIza[0-9A-Za-z_-]{35}/g },
  { kind: "private-key-block", re: /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/g },
  {
    kind: "jwt",
    re: /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
  },
  { kind: "bearer-token", re: /Bearer\s+[A-Za-z0-9._~+/-]{20,}={0,2}/g },
];

// Lower-confidence PII — reported, never blocks.
const PII_PATTERNS: ReadonlyArray<{ kind: string; re: RegExp }> = [
  { kind: "email", re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g },
  { kind: "ipv4", re: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g },
];

const CARD_RE = /\b(?:\d[ -]?){13,19}\b/g;

/** Luhn checksum — filters credit-card false positives. */
export function luhnValid(raw: string): boolean {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 13 || digits.length > 19) {
    return false;
  }
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) {
        d -= 9;
      }
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

/** Scan text for credential and PII patterns. */
export function scanSecrets(text: string): SecretMatch[] {
  const out: SecretMatch[] = [];
  for (const { kind, re } of CREDENTIAL_PATTERNS) {
    for (const match of text.matchAll(re)) {
      out.push({ kind, severity: "high", index: match.index ?? 0, length: match[0].length });
    }
  }
  for (const match of text.matchAll(CARD_RE)) {
    if (luhnValid(match[0])) {
      out.push({
        kind: "credit-card",
        severity: "high",
        index: match.index ?? 0,
        length: match[0].length,
      });
    }
  }
  for (const { kind, re } of PII_PATTERNS) {
    for (const match of text.matchAll(re)) {
      out.push({ kind, severity: "low", index: match.index ?? 0, length: match[0].length });
    }
  }
  return out.toSorted((a, b) => a.index - b.index);
}
