// Email-based HITL prompt for the bicriterion broker.
//
// When the broker decides keypress is required, this builder's returned
// prompt function:
//   1. composes an email to the principal explaining the call (cap +
//      target + redacted args + a fresh correlation token);
//   2. sends it via SMTP and APPENDs it to INBOX with the enclawed/hitl
//      label so the daily loop skips it instead of re-replying to it;
//   3. polls INBOX for a reply from the principal whose subject still
//      carries the correlation token;
//   4. parses the first non-quoted line: y/yes/approve/ok → approve,
//      n/no/deny/cancel → deny, anything else → deny (defensive);
//   5. labels the response with enclawed/hitl so the daily loop also
//      ignores it;
//   6. on timeout (default 30 min), resolves to deny.
//
// What this is NOT:
//   - gated. Every byte on the wire here uses the same app-specific
//     password the bridges use, but the SkillGate is intentionally
//     bypassed — HITL traffic IS the broker's question, not an action
//     the broker is gating. Routing HITL email through the gate would
//     recurse forever (every HITL email would itself require HITL).
//   - registered in mcp-attested. This module talks IMAP/SMTP directly;
//     it does not register a server, declare any tools, or touch the
//     QClearedMcpClient surface. The runtime invariant the tool wrappers
//     guard (every external write goes through the gate) does NOT apply
//     to broker-internal channels, by construction.

import { Buffer } from "node:buffer";
import { randomBytes } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import type { BrokerDecision, BrokerRequest } from "enclawed/framework";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import nodemailer, { type Transporter } from "nodemailer";
import { logTimestamp } from "../log-timestamp.js";

export type EmailHitlPromptOptions = Readonly<{
  imap: { host: string; port: number; secure: boolean };
  smtp: { host: string; port: number; secure: boolean };
  /**
   * Principal's mailbox address. This is the SMTP/IMAP identity the
   * secretary authenticates as (matches the keyring account) and the
   * From: header on the outgoing HITL request. The HITL email is
   * SENT BY this address.
   */
  principalEmail: string;
  /**
   * Address the principal will REPLY FROM when approving. Defaults to
   * principalEmail (the self-send case where you reply from the same
   * mailbox the secretary is signed in to). Override when the operator
   * reads / replies from a different identity than the mailbox the
   * secretary is sending from — typical configurations:
   *
   *   - principal mailbox is a dedicated service account
   *     (`secretary@…`), operator replies from a personal address
   *     (`alfredo@…`) the service account forwards to;
   *   - operator replies from a Workspace "send-as" alias mapped to
   *     the principal mailbox;
   *   - operator replies from their phone whose default account is a
   *     different identity than the install-time principal.
   *
   * The broker matches the From: header on the incoming reply against
   * THIS field, not principalEmail. The reply still has to land in the
   * principal mailbox's INBOX (because that's where the secretary
   * polls), but mail clients route the reply To: the original sender
   * (= principalEmail) automatically, so the operator only has to send
   * normally.
   */
  replyFromAddress?: string;
  /** Same app-specific password the bridges use. */
  password: string;
  /** Display name to stamp on the From: header (matches the bridge's). */
  fromDisplayName: string;
  /** Max time to wait for the principal's reply. Default 30 min. */
  timeoutMs?: number;
  /** How often to poll INBOX while waiting. Default 30 s. */
  pollIntervalMs?: number;
  /** Label applied to both the request and the response. Default enclawed/hitl. */
  hitlLabel?: string;
  /** Logger (defaults to stderr). */
  log?: (level: "info" | "warn" | "error", msg: string) => void;
}>;

const DEFAULT_TIMEOUT_MS = 30 * 60_000;
const DEFAULT_POLL_INTERVAL_MS = 30_000;
const DEFAULT_HITL_LABEL = "enclawed/hitl";

// Subject prefix the secretary stamps on every HITL email. The principal
// replies and their mail client adds "Re: " in front; we strip "Re: " (and
// case variants) before matching, so the polling loop pairs request and
// reply by the embedded correlation token alone.
const HITL_SUBJECT_PREFIX = "Enclawed HITL";

export function buildEmailHitlPrompt(
  opts: EmailHitlPromptOptions,
): (req: BrokerRequest) => Promise<BrokerDecision> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const pollIntervalMs = opts.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const hitlLabel = opts.hitlLabel ?? DEFAULT_HITL_LABEL;
  const log = opts.log ?? defaultLog;
  const replyFromAddress = (opts.replyFromAddress ?? opts.principalEmail).toLowerCase().trim();
  const smtp: Transporter = nodemailer.createTransport({
    host: opts.smtp.host,
    port: opts.smtp.port,
    secure: opts.smtp.secure,
    auth: { user: opts.principalEmail, pass: opts.password },
  });

  return async (req) => {
    const correlation = newCorrelationToken();
    const subject = `${HITL_SUBJECT_PREFIX} approval needed [${correlation}]`;
    const body = renderRequestBody(req, correlation, timeoutMs);
    const fromHeader = `${opts.fromDisplayName} <${opts.principalEmail}>`;

    // Send the request. Errors here are not gated by anything (no broker
    // to ask) — log + deny.
    let sentAt: Date;
    try {
      const send = await smtp.sendMail({
        from: fromHeader,
        to: replyFromAddress,
        subject,
        text: body,
        headers: {
          "X-Enclawed-HITL-Correlation": correlation,
          "X-Enclawed-HITL-RequestId": req.requestId,
        },
      });
      log(
        "info",
        `email-hitl: sent request ${correlation} messageId=${send.messageId ?? "(none)"} ` +
          `— delivered to ${maskAddress(replyFromAddress)}, awaiting reply from ` +
          `that address (subject must start with "Re:")`,
      );
      sentAt = new Date();
    } catch (err) {
      const reason = `email-hitl: SMTP send failed: ${(err as Error).message}`;
      log("warn", `${reason} — defaulting to DENY`);
      return { decision: "deny", reason };
    }

    // Label the just-sent request (it will land in Sent + INBOX on Gmail
    // self-send; on other providers it may only be in Sent). Failure to
    // label is non-fatal — the daily loop skips by subject prefix too.
    try {
      await labelMessage({
        imapOpts: opts,
        principalEmail: opts.principalEmail,
        password: opts.password,
        correlation,
        label: hitlLabel,
        fromAddress: opts.principalEmail,
        sinceMs: sentAt.getTime() - 30_000,
      });
    } catch (err) {
      log("warn", `email-hitl: failed to label request ${correlation}: ${(err as Error).message}`);
    }

    // Poll INBOX until we see a reply from the principal carrying the
    // correlation token, or the deadline passes.
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        const reply = await fetchReply({
          imapOpts: opts,
          mailboxLogin: opts.principalEmail,
          expectedReplyFrom: replyFromAddress,
          password: opts.password,
          correlation,
          sinceMs: sentAt.getTime(),
          log,
        });
        if (reply) {
          // Label the response so the daily loop also ignores it.
          try {
            await labelMessage({
              imapOpts: opts,
              principalEmail: opts.principalEmail,
              password: opts.password,
              correlation,
              label: hitlLabel,
              fromAddress: opts.principalEmail,
              sinceMs: sentAt.getTime(),
            });
          } catch (err) {
            log(
              "warn",
              `email-hitl: failed to label response ${correlation}: ${(err as Error).message}`,
            );
          }
          const verdict = parseVerdict(reply.bodyText);
          log("info", `email-hitl: ${correlation} → ${verdict.decision} (${verdict.reason})`);
          return verdict;
        }
      } catch (err) {
        log("warn", `email-hitl: poll failed for ${correlation}: ${(err as Error).message}`);
        // Fall through to the sleep; a transient IMAP error shouldn't
        // collapse the whole prompt.
      }
      try {
        await sleep(Math.min(pollIntervalMs, Math.max(0, deadline - Date.now())));
      } catch {
        break;
      }
    }
    const reason = `email-hitl: no reply within ${Math.floor(timeoutMs / 60_000)}min for ${correlation}`;
    log("warn", `${reason} — DENY`);
    return { decision: "deny", reason };
  };
}

// Reduce an email address to first-letter-of-local + obfuscated domain
// + TLD: "alfredo.metere@enclawed.com" -> "a***@***.com". Used in
// service.log to surface what the broker is matching against without
// leaking the operator's personal identity to anyone reading the log.
// The full address still lives in the OS keyring (encrypted at rest);
// nothing recoverable should land on disk via this function.
function maskAddress(a: string): string {
  const at = a.indexOf("@");
  if (at < 1) {
    return "***";
  }
  const localFirst = a[0] ?? "*";
  const lastDot = a.lastIndexOf(".");
  const tld = lastDot > at ? a.slice(lastDot) : "";
  return `${localFirst}***@***${tld}`;
}

function newCorrelationToken(): string {
  // 8 random bytes → 16 hex chars. Long enough that a coincident match
  // against an unrelated email is effectively impossible, short enough
  // to fit on one subject line.
  return randomBytes(8).toString("hex");
}

function renderRequestBody(req: BrokerRequest, correlation: string, timeoutMs: number): string {
  const minutes = Math.floor(timeoutMs / 60_000);
  const summary = renderHumanSummary(req);
  return [
    `The secretary needs your approval:`,
    ``,
    summary,
    ``,
    `Reply YES (or NO) on the first line of your reply to ${
      minutes === 1 ? "approve or deny" : `approve or deny within ${minutes} minutes`
    }. Anything else or no reply means DENY — the action will NOT execute.`,
    ``,
    `— Enclawed Secretary`,
    ``,
    `---`,
    `correlation: ${correlation}  (do not edit the subject line — it pairs your reply with this request)`,
  ].join("\n");
}

// Translate the broker's (cap, target, args) tuple into a human-
// readable line or two that the operator can decide on without
// knowing what "cap=publish" means or having to decode a target
// string. Falls back to a generic "unrecognised action" line that
// dumps the raw tuple so the operator can at least eyeball it.
function renderHumanSummary(req: BrokerRequest): string {
  const target = req.call.target;
  const args = (req.call.args ?? {}) as Record<string, unknown>;

  // calendar:event/<uid>#delete
  const deleteMatch = /^calendar:event\/(.+)#delete$/.exec(target);
  if (deleteMatch) {
    const eventId = decodeURIComponent(deleteMatch[1] ?? "");
    const linkedSummary = typeof args["linkedSummary"] === "string" ? args["linkedSummary"] : "";
    const linkedStart =
      typeof args["linkedStartsAtIso"] === "string" ? args["linkedStartsAtIso"] : "";
    const linkedEnd = typeof args["linkedEndsAtIso"] === "string" ? args["linkedEndsAtIso"] : "";
    const desc =
      linkedSummary && linkedStart
        ? `"${linkedSummary}" (${formatWhen(linkedStart, linkedEnd)})`
        : `event ${eventId.slice(0, 12)}…`;
    return `Action:    DELETE calendar event ${desc}`;
  }

  // calendar:event/new#sha256=... or calendar:event/<uid>#sha256=... (create/update)
  const writeMatch = /^calendar:event\/([^#]+)#sha256=/.exec(target);
  if (writeMatch) {
    const what = writeMatch[1] === "new" ? "ADD calendar event" : "UPDATE calendar event";
    const summary = typeof args["summary"] === "string" ? args["summary"] : "(no title)";
    const start = typeof args["startsAtIso"] === "string" ? args["startsAtIso"] : "";
    const end = typeof args["endsAtIso"] === "string" ? args["endsAtIso"] : "";
    const attendeesRaw = args["attendees"];
    const attendees = Array.isArray(attendeesRaw)
      ? (attendeesRaw as unknown[]).filter((x): x is string => typeof x === "string")
      : [];
    const lines = [
      `Action:    ${what}`,
      `What:      "${summary}"`,
      `When:      ${formatWhen(start, end)}`,
    ];
    if (attendees.length > 0) {
      lines.push(`Attendees: ${attendees.join(", ")}`);
    }
    return lines.join("\n");
  }

  // gmail:send/<draftId>#sha256=...;to=<recipient>
  const sendMatch = /^gmail:send\/[A-Za-z0-9_-]+#sha256=[0-9a-f]{64};to=(.+)$/.exec(target);
  if (sendMatch) {
    const recipient = decodeURIComponent(sendMatch[1] ?? "");
    return `Action:    SEND email to ${recipient}`;
  }

  // Unrecognised — fall back to a compact view of the raw tuple.
  const argsCompact = truncate(JSON.stringify(args), 400);
  return [
    `Action:    ${req.call.cap} (target: ${truncate(target, 120)})`,
    `Args:      ${argsCompact}`,
  ].join("\n");
}

// Format an RFC 3339 UTC range in the principal's local TZ — the
// HITL approval email is read by a human, not a machine, so the
// principal should see "Sun May 31, 2026, 3:00–4:00 PM PDT", not
// the UTC bytes that hit the calendar wire.
function formatWhen(startIso: string, endIso: string): string {
  if (!startIso) {
    return "(no time)";
  }
  const start = new Date(startIso);
  if (Number.isNaN(start.getTime())) {
    return startIso;
  }
  const tz = process.env.TZ ?? "UTC";
  const dateFmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const timeFmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
  const dayKeyFmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  if (!endIso) {
    return `${dateFmt.format(start)}, ${timeFmt.format(start)}`;
  }
  const end = new Date(endIso);
  if (Number.isNaN(end.getTime())) {
    return `${dateFmt.format(start)}, ${timeFmt.format(start)} → ${endIso}`;
  }
  const sameDay = dayKeyFmt.format(start) === dayKeyFmt.format(end);
  if (sameDay) {
    const startTimeNoTz = timeFmt.format(start).replace(/\s+\S+$/, "");
    return `${dateFmt.format(start)}, ${startTimeNoTz} – ${timeFmt.format(end)}`;
  }
  return `${dateFmt.format(start)}, ${timeFmt.format(start)} → ${dateFmt.format(end)}, ${timeFmt.format(end)}`;
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "…[truncated]" : s;
}

const APPROVE_TOKENS = new Set(["y", "yes", "approve", "approved", "ok", "okay"]);
const DENY_TOKENS = new Set(["n", "no", "deny", "denied", "cancel", "reject", "rejected"]);

function parseVerdict(bodyText: string): BrokerDecision {
  // Use the first non-empty, non-quoted line. Mail clients prefix quoted
  // lines with ">" or with the "On <date>, X wrote:" header. We stop at
  // either signal.
  const lines = bodyText.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      continue;
    }
    if (line.startsWith(">")) {
      break; // entered the quoted block
    }
    if (/^on .+ wrote:?\s*$/i.test(line)) {
      break;
    }
    // Strip trailing punctuation so "yes." / "yes!" / "no," parse cleanly.
    const word =
      line
        .toLowerCase()
        .replace(/[.!?,;:]+$/g, "")
        .split(/\s+/, 1)[0] ?? "";
    if (APPROVE_TOKENS.has(word)) {
      return { decision: "approve", reason: `email-hitl: reply "${line.slice(0, 40)}"` };
    }
    if (DENY_TOKENS.has(word)) {
      return { decision: "deny", reason: `email-hitl: reply "${line.slice(0, 40)}"` };
    }
    // First content line was neither — defensive deny.
    return {
      decision: "deny",
      reason: `email-hitl: first line not YES/NO ("${line.slice(0, 40)}")`,
    };
  }
  return { decision: "deny", reason: "email-hitl: reply body had no decision line" };
}

async function fetchReply(args: {
  imapOpts: EmailHitlPromptOptions;
  /** IMAP login identity — the secretary's mailbox credentials. */
  mailboxLogin: string;
  /**
   * Address the broker expects the principal's reply to come from.
   * Distinct from mailboxLogin when the operator's reply identity
   * differs from the mailbox the secretary signs in to.
   */
  expectedReplyFrom: string;
  password: string;
  correlation: string;
  sinceMs: number;
  log: (level: "info" | "warn" | "error", msg: string) => void;
}): Promise<{ messageUid: number; bodyText: string } | null> {
  const imap = await openImap(args.imapOpts, args.mailboxLogin, args.password);
  try {
    const lock = await imap.getMailboxLock("INBOX");
    try {
      // SUBJECT search matches anywhere in the header (so "Re: Enclawed
      // HITL ... [token]" matches the bare correlation token). Combine
      // with SINCE to keep the search bounded.
      const since = new Date(args.sinceMs);
      const uids = await imap.search({ subject: args.correlation, since });
      if (!uids || uids.length === 0) {
        return null;
      }
      // The most recent matching message is the reply we want (the
      // request itself is older). Sort by uid descending.
      const sorted = [...uids].toSorted((a, b) => b - a);
      for (const uid of sorted) {
        const msg = await imap.fetchOne(uid, { source: true, envelope: true, internalDate: true });
        if (!msg || !msg.envelope || !msg.source) {
          continue;
        }
        const fromAddrs = msg.envelope.from ?? [];
        const seenFrom = fromAddrs
          .map((a) => (a.address ?? "").toLowerCase().trim())
          .filter((s) => s.length > 0);
        const fromMatches = seenFrom.includes(args.expectedReplyFrom.toLowerCase());
        const subj = msg.envelope.subject ?? "";
        const subjMatches = /^re\s*:/i.test(subj);

        if (subjMatches && !fromMatches) {
          // Surface the rejected From: at WARN so the operator can see
          // why their reply didn't count — almost certainly they replied
          // from a different account / alias / send-as identity than the
          // one captured at install. Addresses are masked so the log
          // file (which sits at rest unencrypted under ~/.enclawed) does
          // not leak the operator's personal identity to anyone with
          // read access.
          args.log(
            "warn",
            `email-hitl: ignoring Re:-prefixed reply uid=${uid} ` +
              `from=[${seenFrom.map(maskAddress).join(",") || "(none)"}] — ` +
              `reply must come from ${maskAddress(args.expectedReplyFrom)} ` +
              `(case-insensitive)`,
          );
          continue;
        }
        if (!fromMatches) {
          continue; // silent: someone forwarded the request or sent unrelated mail
        }
        if (!subjMatches) {
          continue; // silent: this is the outgoing request itself (no Re:)
        }
        const src = Buffer.isBuffer(msg.source) ? msg.source : Buffer.from(msg.source);
        const parsed = await simpleParser(src);
        const text = (parsed.text ?? "").toString();
        return { messageUid: uid, bodyText: text };
      }
      return null;
    } finally {
      lock.release();
    }
  } finally {
    await imap.logout().catch(() => {});
  }
}

async function labelMessage(args: {
  imapOpts: EmailHitlPromptOptions;
  principalEmail: string;
  password: string;
  correlation: string;
  label: string;
  fromAddress: string;
  sinceMs: number;
}): Promise<void> {
  const imap = await openImap(args.imapOpts, args.principalEmail, args.password);
  try {
    const lock = await imap.getMailboxLock("INBOX");
    try {
      const since = new Date(args.sinceMs);
      const uids = await imap.search({ subject: args.correlation, since });
      if (!uids || uids.length === 0) {
        return;
      }
      // X-GM-LABELS is a Gmail extension. On other providers (Fastmail,
      // iCloud, Dovecot) this STORE will be a no-op or unsupported error;
      // either is fine — the daily loop also skips by subject prefix as
      // a secondary signal, and the IMAP server simply rejects the
      // unknown flag. We swallow STORE errors silently.
      try {
        await (
          imap as unknown as {
            store: (
              range: number[],
              flags: { add?: string[] },
              opts: { useLabels: boolean },
            ) => Promise<unknown>;
          }
        ).store(uids, { add: [args.label] }, { useLabels: true });
      } catch {
        // Non-Gmail provider — labelling unsupported; fall through.
      }
    } finally {
      lock.release();
    }
  } finally {
    await imap.logout().catch(() => {});
  }
}

async function openImap(
  imapOpts: EmailHitlPromptOptions,
  user: string,
  pass: string,
): Promise<ImapFlow> {
  const client = new ImapFlow({
    host: imapOpts.imap.host,
    port: imapOpts.imap.port,
    secure: imapOpts.imap.secure,
    auth: { user, pass },
    logger: false,
  });
  await client.connect();
  return client;
}

function defaultLog(level: "info" | "warn" | "error", msg: string): void {
  const stream = level === "info" ? process.stdout : process.stderr;
  stream.write(`${logTimestamp()} [secretary ${level}] ${msg}\n`);
}
