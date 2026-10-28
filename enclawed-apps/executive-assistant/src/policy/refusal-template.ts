// Frozen refusal text for non-contacts.
//
// Critical design property: this text is NEVER LLM-generated. It is a
// constant string the agent's prose pipeline cannot influence, which closes
// a class of F5-shaped exfil (prompt-injection telling the LLM to "include
// the calendar in the polite refusal"). The refusal is bound to the
// non-contact decision before the LLM is ever invoked.
//
// Per the in-process SkillManifest built in runApp.ts the cap exercised
// here is `fs.write.rev` (create_draft), not `publish`: a refusal is
// delivered as a draft like any other reply and only `send_draft` flips
// it to `publish`. The user can inspect every refusal draft in the audit
// log regardless of how HITL is configured.

export const REFUSAL_TEMPLATE = Object.freeze({
  subject: "Re: {{originalSubject}}",
  // Three rules of thumb baked into the body:
  //   1. Acknowledge receipt (helps deliverability heuristics).
  //   2. State the constraint plainly, no apology theater.
  //   3. Offer a recoverable path (same-address-as-before) so legitimate
  //      first-contact senders are not silently stonewalled.
  body: [
    "Thanks for reaching out.",
    "",
    "I'm an AI executive assistant running on behalf of my principal, and I'm not",
    "permitted to share my principal's calendar or contact details with",
    "senders who aren't in their address book.",
    "",
    "If you've corresponded with my principal before, please make sure",
    "you're sending from the same address; otherwise I can take a message",
    "and flag it for them to triage personally.",
    "",
    "— {{signature}}",
  ].join("\n"),
} as const);

// Stable rendering used for both audit projection and final draft body.
// Keeps the (op, target) projection F4-tight: target includes a hash over
// THIS exact text, so a tampered refusal payload breaks the biconditional.
export function buildRefusalBody(input: {
  originalSubject: string;
  /**
   * How the refusal signs off. Operator-configured (the persona display
   * name from .env), never taken from the inbound message, so the
   * "text the prose pipeline cannot influence" property still holds --
   * the signature is not attacker-reachable. It defaults to a neutral
   * label rather than the demo string this template used to ship, which
   * signed every real deployment's refusals "(enclawed demo)".
   */
  signature?: string;
}): {
  subject: string;
  body: string;
} {
  const subject = REFUSAL_TEMPLATE.subject.replace(
    "{{originalSubject}}",
    sanitizeSubject(input.originalSubject),
  );
  const signature = sanitizeSignature(input.signature);
  return { subject, body: REFUSAL_TEMPLATE.body.replace("{{signature}}", signature) };
}

/**
 * Same control-character discipline as the subject: this lands in the
 * mail body and in the audit projection, and neither wants newlines.
 */
function sanitizeSignature(raw: string | undefined): string {
  const fallback = "Executive Assistant";
  if (typeof raw !== "string") {
    return fallback;
  }
  const cleaned = raw.replace(SUBJECT_CONTROL_RE, " ").trim().slice(0, 80);
  return cleaned.length > 0 ? cleaned : fallback;
}

// Drop newlines and control characters from the subject — Gmail's MIME
// parser is forgiving, the audit logger is not (control-char rejection at
// audit-log.ts:30-43), and we never want to be the source of a log-injection
// vector. Truncated to 200 chars to keep the projection key bounded.
// eslint-disable-next-line no-control-regex
const SUBJECT_CONTROL_RE = /[\u0000-\u001F\u007F]+/g;
function sanitizeSubject(raw: string): string {
  if (typeof raw !== "string") {
    return "";
  }
  const collapsed = raw.replace(SUBJECT_CONTROL_RE, " ").trim();
  return collapsed.length > 200 ? collapsed.slice(0, 200) + "…" : collapsed;
}
