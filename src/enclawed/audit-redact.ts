// What the audit log never stores: secret values. Every string of a record's
// payload goes through this before the record is hashed and written, so the
// chain covers the redacted bytes and no secret reaches the file. The formats
// are the kit's credential detection (adapter/secret-content.ts: provider
// token formats and credential-shaped NAME=value assignments), the framework
// DLP scanner's cloud credential formats (AWS access key ids, Azure storage
// keys) and private-key blocks. Records already written are not rewritten:
// that would break the chain they belong to.
import { PROVIDER_TOKENS, redactSecretAssignments } from "./adapter/secret-content.js";

export const AUDIT_SECRET_PLACEHOLDER = "[secret removed by Enclawed]";

const EXTRA_FORMATS: readonly RegExp[] = [
  /\b(?:AKIA|ASIA)[0-9A-Z]{16,}\b/g,
  /AccountKey=[A-Za-z0-9+/=]{40,}/g,
  // A private-key block, to its END line or to the end of the string.
  /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----[\s\S]*?(?:-----END (?:[A-Z0-9]+ )*PRIVATE KEY-----|$)/g,
];

/** `s` with every secret value replaced; the same string when it holds none. */
export function redactAuditString(s: string): string {
  if (s.length < 8) {
    return s;
  }
  let out = s;
  for (const { re } of PROVIDER_TOKENS) {
    out = out.replace(re, AUDIT_SECRET_PLACEHOLDER);
  }
  for (const re of EXTRA_FORMATS) {
    out = out.replace(re, AUDIT_SECRET_PLACEHOLDER);
  }
  return redactSecretAssignments(out).text;
}
