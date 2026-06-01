// Secretary-specific DLP layer on top of the framework's dlp-scanner.
//
// The framework scanner (src/enclawed/dlp-scanner.ts) already catches:
//   - classified markings (RESTRICTED-PLUS//, TOP SECRET//, SCI codewords)
//   - cloud/vendor secrets (AKIA, ghp_, sk-ant-, …)
//   - PII (email, phone, PAN/Luhn, IBAN, SSN)
//
// For the secretary scenario we layer on three extra concerns:
//
//   - Calendar-leak heuristic: ISO-8601 datetimes or recurring meeting
//     phrases appearing in an OUTBOUND draft to a NON-CONTACT recipient.
//     The hard refusal-gate already prevents the LLM from seeing calendar
//     data on non-contact paths, but the scanner is a defense-in-depth
//     check so a misconfigured downstream tool can't slip schedule prose.
//
//   - Contact-list-leak heuristic: outbound draft body containing two or
//     more distinct email addresses that don't belong to the recipient.
//     Catches "forward my address book to <attacker>" prompt injections.
//
//   - URL exfil heuristic: outbound draft body containing a URL whose host
//     is not on the egress allowlist (any non-Google host, basically).
//     Catches covert-channel exfil via UTM params / image beacons even
//     before the egress guard would block the underlying fetch.
//
// Every finding carries an explicit severity that the bicriterion broker
// uses to route the call (medium+ -> require keypress; critical -> deny).

import { dlpScan as frameworkScan, type DlpFinding as Finding } from "enclawed/framework";

export type SecretarySeverity = "low" | "medium" | "high" | "critical";

export type SecretaryFinding = Readonly<{
  source: "framework" | "calendar" | "contact-list" | "url-exfil";
  rule: string;
  severity: SecretarySeverity;
  /** Byte range in the scanned text. */
  start: number;
  end: number;
  /** Truncated, redacted excerpt for audit. Never the raw payload. */
  excerpt: string;
}>;

export type SecretaryScanContext = Readonly<{
  /** Recipient classification: true iff in the People API contact list. */
  recipientIsContact: boolean;
  /** Recipient's primary email (used for de-deduping in contact-list check). */
  recipientEmail: string;
  /** Host allowlist (typically `policy.allowedHosts`). */
  egressAllowedHosts: ReadonlySet<string>;
}>;

const ISO_DATETIME_RE = /\b\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:?\d{2})?\b/g;

// "every Tuesday at 3pm", "next Thursday at 10:30", "Mon 9am" — coarse,
// errs on the side of flagging because the cost of a false positive is one
// keypress, and the cost of a false negative is a calendar leak.
const RECURRING_MEETING_RE =
  /\b(?:every|next|this|on)\s+(?:mon|tue|tues|wed|thu|thur|fri|sat|sun)[a-z]*\b[^.\n]{0,30}\b\d{1,2}(?::\d{2})?\s*(?:am|pm|AM|PM)?/g;

// E.164 + RFC-5321-ish local-part. We scan with a more permissive regex
// here than the framework PII regex because we want the COUNT, not the
// canonical form.
const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;

const URL_RE = /\b(?:https?:\/\/)([A-Za-z0-9.-]+)(?::\d+)?(?:\/[^\s)]*)?/g;

/**
 * Scan an outbound draft body. Returns the combined finding set from the
 * framework scanner plus secretary-specific heuristics. The body is NEVER
 * mutated — redaction is the broker's call, not the scanner's.
 */
export function scanOutboundDraft(
  body: string,
  ctx: SecretaryScanContext,
): ReadonlyArray<SecretaryFinding> {
  const findings: SecretaryFinding[] = [];

  // 1. Framework patterns (classified markings, vendor secrets, PII).
  for (const f of frameworkScan(body)) {
    findings.push(adaptFrameworkFinding(f));
  }

  // 2. Calendar-leak: only relevant to non-contact replies (refusal path).
  if (!ctx.recipientIsContact) {
    for (const re of [ISO_DATETIME_RE, RECURRING_MEETING_RE]) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(body)) !== null) {
        findings.push({
          source: "calendar",
          rule: re === ISO_DATETIME_RE ? "iso-datetime" : "recurring-meeting",
          severity: "high",
          start: m.index,
          end: m.index + m[0].length,
          excerpt: redactExcerpt(m[0]),
        });
      }
    }
  }

  // 3. Contact-list-leak: outbound draft containing two or more distinct
  //    other-party emails. Recipient's own email is excluded.
  const seenEmails = new Set<string>();
  EMAIL_RE.lastIndex = 0;
  let em: RegExpExecArray | null;
  while ((em = EMAIL_RE.exec(body)) !== null) {
    const addr = em[0].toLowerCase();
    if (addr === ctx.recipientEmail.toLowerCase()) {
      continue;
    }
    seenEmails.add(addr);
    if (seenEmails.size >= 2) {
      findings.push({
        source: "contact-list",
        rule: "multi-email-leak",
        severity: "critical",
        start: em.index,
        end: em.index + em[0].length,
        excerpt: redactExcerpt(em[0]),
      });
      break; // one finding is enough; no need to flood the report.
    }
  }

  // 4. URL exfil: any HTTP(S) URL whose host is not on the egress
  //    allowlist. Note we treat `googleapis.com` subdomains as allowed
  //    because the bridge talks to *.googleapis.com.
  URL_RE.lastIndex = 0;
  let um: RegExpExecArray | null;
  while ((um = URL_RE.exec(body)) !== null) {
    const host = (um[1] ?? "").toLowerCase();
    if (!hostIsAllowed(host, ctx.egressAllowedHosts)) {
      findings.push({
        source: "url-exfil",
        rule: "off-allowlist-host",
        severity: "critical",
        start: um.index,
        end: um.index + um[0].length,
        excerpt: redactExcerpt(host),
      });
    }
  }

  return Object.freeze(findings);
}

function adaptFrameworkFinding(f: Finding): SecretaryFinding {
  return {
    source: "framework",
    rule: f.id,
    severity: mapSeverity(f.severity),
    start: f.index,
    end: f.index + f.match.length,
    excerpt: redactExcerpt(f.match),
  };
}

function mapSeverity(s: string): SecretarySeverity {
  if (s === "critical" || s === "high" || s === "medium" || s === "low") {
    return s;
  }
  return "medium";
}

function hostIsAllowed(host: string, allowed: ReadonlySet<string>): boolean {
  if (allowed.has(host)) {
    return true;
  }
  // googleapis.com subdomains are implicitly allowed when any *.googleapis.com
  // host appears in the allowlist (which the secretary's policy does — gmail,
  // calendar, people, oauth2, gmailmcp, calendarmcp).
  if (host.endsWith(".googleapis.com")) {
    for (const a of allowed) {
      if (a.endsWith(".googleapis.com") || a === "googleapis.com") {
        return true;
      }
    }
  }
  return false;
}

function redactExcerpt(raw: string): string {
  if (raw.length <= 8) {
    return "***";
  }
  return raw.slice(0, 4) + "…" + raw.slice(-2);
}

/** Highest severity in a finding set. Returns null if no findings. */
export function maxSeverity(findings: ReadonlyArray<SecretaryFinding>): SecretarySeverity | null {
  let rank = -1;
  let out: SecretarySeverity | null = null;
  const ORDER: Record<SecretarySeverity, number> = { low: 0, medium: 1, high: 2, critical: 3 };
  for (const f of findings) {
    if (ORDER[f.severity] > rank) {
      rank = ORDER[f.severity];
      out = f.severity;
    }
  }
  return out;
}
