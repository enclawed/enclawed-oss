// Lightweight regex-based DLP scanner. Detects (a) US classification banner
// markings in free text, (b) common secret formats (cloud API keys, JWTs,
// PEM private keys), and (c) US PII patterns.
//
// LIMITATION: this is keyword/pattern-only and is meant as a deny-list
// belt-and-braces around a primary control (label-based access). It cannot
// detect classified content that lacks markings, paraphrased content, or
// embedded binary data. A real DLP control requires content-aware analysis,
// trained classifiers, and human review of escalations. See
// enclawed/MODIFICATIONS.md "DLP and content inspection".

const PATTERNS = [
  // Sensitive-data markings — generic + US-gov
  { id: 'industry-classification-banner', severity: 'critical',
    re: /\b(RESTRICTED-PLUS|RESTRICTED|CONFIDENTIAL|INTERNAL\s*ONLY|HIGHLY\s*CONFIDENTIAL)\s*\/\/[A-Z0-9 \/_.-]+/g },
  { id: 'us-classification-banner', severity: 'critical',
    re: /\b(TOP\s*SECRET|SECRET|CONFIDENTIAL|CUI)\s*\/\/[A-Z0-9 \/_.-]+/g },
  { id: 'us-doe-restricted-data', severity: 'critical',
    re: /\b(RESTRICTED\s*DATA|FORMERLY\s*RESTRICTED\s*DATA|FRD|RD\b)/g },
  { id: 'us-sci-codeword', severity: 'high',
    re: /\b(NOFORN|ORCON|PROPIN|HCS|TK|SI|G|HUMINT)\b/g },
  { id: 'industry-distribution-caveat', severity: 'medium',
    re: /\b(EYES_ONLY|VENDOR_ONLY|DO_NOT_FORWARD|UNDER_NDA|UNDER\s+NDA)\b/g },
  // Cloud / vendor secrets
  // {16,} (not exact {16}) so a real AKIA-prefixed token doesn't escape just
  // because of trailing alphanumeric noise that breaks the {16}\b boundary.
  { id: 'aws-access-key-id', severity: 'high', re: /\b(AKIA|ASIA)[0-9A-Z]{16,}/g },
  { id: 'gcp-service-account', severity: 'high', re: /"type"\s*:\s*"service_account"/g },
  { id: 'azure-storage-key', severity: 'high', re: /AccountKey=[A-Za-z0-9+/=]{40,}/g },
  { id: 'github-token', severity: 'high', re: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g },
  { id: 'gitlab-token', severity: 'high', re: /\bglpat-[A-Za-z0-9_-]{20,}\b/g },
  { id: 'openai-key', severity: 'high', re: /\bsk-[A-Za-z0-9_-]{20,}\b/g },
  { id: 'anthropic-key', severity: 'high', re: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g },
  { id: 'slack-bot-token', severity: 'high', re: /\bxox[abprs]-[A-Za-z0-9-]{20,}\b/g },
  { id: 'stripe-key', severity: 'high', re: /\b(sk|pk|rk)_(test|live)_[A-Za-z0-9]{20,}\b/g },
  // Loose secret-prefix shapes (high severity). These supplement the strict
  // patterns above to catch LLM-emitted near-misses that defeat the strict
  // regex: short fake keys (sk-XXXXX, AKIA1234), tokens prefixed by another
  // word char so the leading \b fails (_AKIA..., DEBUG=ghp_...), and
  // OpenAI-style keys that include an = padding char (sk-=...). Risk on legit
  // text is low because the prefix tokens (sk-, AKIA, ASIA, ghp_, ghu_, ghs_,
  // ghr_, gho_, glpat-, xoxb-, xoxa-, xoxp-, xoxr-, xoxs-) are themselves
  // diagnostic of a secret-shape; a legit string carrying any of these followed
  // by 8+ identifier characters is almost always either a real secret or a
  // documented placeholder.
  { id: 'openai-key-loose',  severity: 'high', re: /sk-(?:ant-)?[A-Za-z0-9_=-]{8,}/g },
  { id: 'aws-shape-loose',   severity: 'high', re: /(?:AKIA|ASIA)[A-Z0-9]{8,}/g },
  { id: 'github-token-loose',severity: 'high', re: /gh[pousr]_[A-Za-z0-9]{8,}/g },
  { id: 'gitlab-token-loose',severity: 'high', re: /glpat-[A-Za-z0-9_=-]{8,}/g },
  { id: 'slack-token-loose', severity: 'high', re: /xox[abprs]-[A-Za-z0-9-]{8,}/g },
  { id: 'jwt', severity: 'medium',
    re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g },
  { id: 'pem-private-key', severity: 'critical',
    re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED |PGP )?PRIVATE KEY-----/g },
  // PII (international + US)
  { id: 'email-address', severity: 'low',
    re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g },
  { id: 'phone-e164', severity: 'medium',
    re: /(?<![\w-])\+[1-9]\d{6,14}(?!\w)/g },
  { id: 'credit-card-pan', severity: 'high',
    re: /\b(?:\d[ -]?){13,19}\b/g },
  { id: 'iban', severity: 'high',
    re: /\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/g },
  { id: 'us-ssn', severity: 'high',
    re: /\b(?!000|666|9\d{2})\d{3}[- ]?(?!00)\d{2}[- ]?(?!0000)\d{4}\b/g },
];

// Hard cap on input length to bound regex CPU time. A real DLP gateway
// would chunk huge inputs; this scanner is for log lines and short
// messages. 1 MiB is generous for that role and still fast.
export const SCAN_INPUT_MAX_BYTES = 1 * 1024 * 1024;

export class DlpInputTooLargeError extends Error {
  constructor(actual, limit) {
    super(`DLP input too large: ${actual} bytes > ${limit} byte cap`);
    this.name = 'DlpInputTooLargeError';
    this.actual = actual;
    this.limit = limit;
  }
}

export function scan(text, opts = {}) {
  if (typeof text !== 'string') return [];
  const limit = opts.maxBytes ?? SCAN_INPUT_MAX_BYTES;
  // Length in code units approximates byte length closely enough for the cap;
  // we want to cheaply refuse pathological inputs, not measure exactly.
  if (text.length > limit) {
    if (opts.onOversize === 'truncate') {
      text = text.slice(0, limit);
    } else {
      throw new DlpInputTooLargeError(text.length, limit);
    }
  }
  const findings = [];
  for (const p of PATTERNS) {
    p.re.lastIndex = 0;
    let m;
    while ((m = p.re.exec(text)) !== null) {
      findings.push({
        id: p.id,
        severity: p.severity,
        match: m[0],
        index: m.index,
      });
    }
  }
  return findings;
}

export function highestSeverity(findings) {
  const order = { critical: 4, high: 3, medium: 2, low: 1 };
  let max = null;
  for (const f of findings) {
    if (max === null || order[f.severity] > order[max]) max = f.severity;
  }
  return max;
}

export function redact(text, { placeholder = '[REDACTED]', minSeverity = 'medium' } = {}) {
  if (typeof text !== 'string') return text;
  const order = { low: 1, medium: 2, high: 3, critical: 4 };
  const threshold = order[minSeverity] ?? 2;
  let out = text;
  // Run patterns sorted by severity descending so a longer match wins.
  const sorted = [...PATTERNS].sort(
    (a, b) => order[b.severity] - order[a.severity],
  );
  for (const p of sorted) {
    if ((order[p.severity] ?? 0) < threshold) continue;
    out = out.replace(p.re, placeholder);
  }
  return out;
}
