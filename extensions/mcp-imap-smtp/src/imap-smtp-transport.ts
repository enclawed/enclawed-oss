// IMAP + SMTP MCP transport.
//
// Implements the `McpTransport` contract from mcp-attested: a single
// `call(method, params)` entry point that the QClearedMcpClient
// invokes. Inside, we translate the JSON-RPC `tools/call` envelope
// into IMAP commands (reads + the draft/label writes) and SMTP
// message-send.
//
// This file owns the connection lifecycle for both protocols. IMAP
// is lazily opened on first use, kept warm for the process lifetime,
// and re-established on any error. SMTP transporters are reused
// across calls — nodemailer's createTransport handles pooling.
//
// All five canonical tools land in PR3:
//   - search_threads        IMAP SEARCH + grouping by X-GM-THRID
//   - get_thread            IMAP FETCH on All Mail filtered by threadId
//   - create_draft          MIME compose via nodemailer streamTransport,
//                           IMAP APPEND to [Gmail]/Drafts
//   - send_draft            IMAP FETCH source by UID, SMTP send raw RFC822,
//                           IMAP \Deleted + EXPUNGE on the draft
//   - modify_thread_labels  Gmail X-GM-LABELS manipulation; add via
//                           label-folder COPY, remove via raw IMAP STORE
//                           -X-GM-LABELS on All Mail

import { ImapFlow } from "imapflow";
// mailparser ships JS-only with no community @types package. The minimal
// surface we use is declared in mailparser-ambient.d.ts beside this file
// so we avoid adding @types/mailparser as a dependency.
import { simpleParser } from "mailparser";
import nodemailer, { type Transporter } from "nodemailer";
import type { JsonRpcResult } from "../../mcp-attested/src/http-transport.js";
import type { McpTransport } from "../../mcp-attested/src/server-registry.js";

export type SmtpConfig = Readonly<{
  host: string;
  port: number;
  secure: boolean;
  auth: { user: string; pass: string };
}>;

export type ImapSmtpTransportOptions = Readonly<{
  imap: { host: string; port: number; secure: boolean };
  smtp: { host: string; port: number; secure: boolean };
  username: string;
  password: string;
  /**
   * Optional display name to stamp on every outgoing draft's From:
   * header — the result is `"Display Name" <user@host>` per RFC 5322.
   * Frozen at construction; there is no setter.
   */
  fromDisplayName?: string;
  // Test seams: alternate IMAP / SMTP client factories so unit tests
  // can inject mocks without spawning real connections.
  imapFactory?: (cfg: ConstructorParameters<typeof ImapFlow>[0]) => ImapFlow;
  smtpFactory?: (cfg: SmtpConfig) => Transporter;
}>;

// Gmail-style folder names. imapflow normalises these on Gmail
// regardless of the user's interface language, but on other hosts
// (Fastmail, iCloud) the all-mail equivalent is just the inbox tree.
// search_threads / get_thread will fall back to INBOX when the named
// folder is not found.
const GMAIL_ALL_MAIL = "[Gmail]/All Mail";
const GMAIL_DRAFTS = "[Gmail]/Drafts";
const GMAIL_SENT = "[Gmail]/Sent Mail";

export type Address = Readonly<{ name?: string; address: string }>;
export type ThreadSummary = Readonly<{
  threadId: string;
  subject: string;
  from: Address | null;
  snippet: string;
  lastDate: string;
  unread: boolean;
  labels: ReadonlyArray<string>;
  /**
   * IMAP UID of the newest message in the thread (in the mailbox we
   * searched — INBOX for search_threads). Used by callers to dedupe
   * across polls without conflating a brand-new thread with a thread
   * that has been processed before but now has a follow-up: same
   * threadId + higher lastUid = new content arrived.
   */
  lastUid: number;
}>;
export type ThreadAttachment = Readonly<{
  filename: string;
  contentType: string;
  size: number;
}>;

export type ThreadMessage = Readonly<{
  messageId: string;
  date: string;
  from: Address | null;
  to: ReadonlyArray<Address>;
  cc: ReadonlyArray<Address>;
  subject: string;
  bodyText: string;
  labels: ReadonlyArray<string>;
  /**
   * Metadata-only attachment list (filename + MIME + size). The bytes
   * are fetched lazily by `get_attachment(threadId, messageIdx,
   * attachmentIdx)` so the daily-loop only pays the I/O when the
   * LLM explicitly asks to read one. Attachments arrive in order of
   * appearance in the MIME tree.
   */
  attachments: ReadonlyArray<ThreadAttachment>;
}>;

// create_draft input/output shapes. `inReplyTo` is the RFC 822
// Message-ID of the message being replied to; the MIME compose will
// set both In-Reply-To and References headers so Gmail threads the
// draft against the right conversation automatically.
export type CreateDraftInput = Readonly<{
  to: ReadonlyArray<string>;
  cc?: ReadonlyArray<string>;
  bcc?: ReadonlyArray<string>;
  subject: string;
  bodyText: string;
  inReplyTo?: string;
  references?: ReadonlyArray<string>;
}>;
export type CreateDraftOutput = Readonly<{
  draftId: string;
  messageId: string;
}>;
export type SendDraftInput = Readonly<{ draftId: string }>;
export type SendDraftOutput = Readonly<{
  messageId: string;
  sentAt: string;
  // Primary To address from the draft envelope, echoed back so the
  // runtime can do its F4 (wrong-target) verification against the
  // recipient the secretary intended to send to.
  recipient: string;
}>;
export type ModifyThreadLabelsInput = Readonly<{
  threadId: string;
  addLabels?: ReadonlyArray<string>;
  removeLabels?: ReadonlyArray<string>;
}>;
export type ModifyThreadLabelsOutput = Readonly<{
  threadId: string;
  applied: Readonly<{
    add: ReadonlyArray<string>;
    remove: ReadonlyArray<string>;
  }>;
}>;

// Snippet length matches Gmail's own ~200-char convention. Long enough
// to disambiguate threads in a search result, short enough to keep
// search responses compact.
const SNIPPET_BYTES = 240;

function normalizeAddress(a: { name?: string; address?: string } | undefined): Address | null {
  if (!a || !a.address) {
    return null;
  }
  return a.name && a.name.trim().length > 0
    ? { name: a.name.trim(), address: a.address.toLowerCase() }
    : { address: a.address.toLowerCase() };
}

function normalizeAddressList(
  list: ReadonlyArray<{ name?: string; address?: string }> | undefined,
): ReadonlyArray<Address> {
  if (!list) {
    return [];
  }
  return list.map(normalizeAddress).filter((a): a is Address => a !== null);
}

function bytesToString(buf: Buffer | string | undefined): string {
  if (!buf) {
    return "";
  }
  return typeof buf === "string" ? buf : buf.toString("utf8");
}

// imapflow's date-returning fields (envelope.date, internalDate) widened to
// `string | Date` so the caller has to coerce before formatting.
function toIsoDate(d: Date | string): string {
  return d instanceof Date ? d.toISOString() : new Date(d).toISOString();
}

// imapflow exposes a raw-command escape hatch at runtime (`imap.exec`) but
// does not re-export it from its .d.ts. We need it for IMAP commands that
// the high-level API doesn't model (UID EXPUNGE on a specific UID, and
// -X-GM-LABELS on Gmail). Wrap the runtime cast in one place so the typed
// surface stays narrow and visible.
type ImapExecAttr =
  | { type: "SEQUENCE"; value: string }
  | { type: "ATOM"; value: string }
  | { type: "STRING"; value: string }
  | { type: "LIST"; value: ImapExecAttr[] };
function imapExec(imap: ImapFlow, command: string, attributes: ImapExecAttr[]): Promise<unknown> {
  const runtime = imap as unknown as {
    exec: (command: string, attributes: ImapExecAttr[]) => Promise<unknown>;
  };
  return runtime.exec(command, attributes);
}

export class ImapSmtpTransport implements McpTransport {
  private readonly imapCfg: ConstructorParameters<typeof ImapFlow>[0];
  private readonly smtpCfg: SmtpConfig;
  private readonly username: string;
  private readonly fromHeader: string;
  private readonly imapFactory: (cfg: ConstructorParameters<typeof ImapFlow>[0]) => ImapFlow;
  private readonly smtpFactory: (cfg: SmtpConfig) => Transporter;
  private imap: ImapFlow | null = null;
  private smtp: Transporter | null = null;
  private connectingPromise: Promise<ImapFlow> | null = null;

  constructor(opts: ImapSmtpTransportOptions) {
    if (!opts.imap?.host) {
      throw new TypeError("ImapSmtpTransport: imap.host required");
    }
    if (!opts.smtp?.host) {
      throw new TypeError("ImapSmtpTransport: smtp.host required");
    }
    if (!opts.username) {
      throw new TypeError("ImapSmtpTransport: username required");
    }
    if (!opts.password) {
      throw new TypeError("ImapSmtpTransport: password required");
    }
    this.username = opts.username;
    // Compose the RFC 5322 From: header once. Quote the display name
    // to survive any character (including those that would otherwise
    // need encoding) and escape embedded quotes. This is the only
    // place the From: value is computed; createDraft + sendDraft
    // both read this field, never the raw username.
    const dispRaw = (opts.fromDisplayName ?? "").trim();
    this.fromHeader =
      dispRaw.length > 0
        ? `"${dispRaw.replace(/[\\"]/g, "\\$&")}" <${opts.username}>`
        : opts.username;
    this.imapCfg = {
      host: opts.imap.host,
      port: opts.imap.port,
      secure: opts.imap.secure,
      auth: { user: opts.username, pass: opts.password },
      // imapflow's default logger pretty-prints to stderr. The
      // secretary runs as a background service and the audit log is
      // the canonical observability surface; silence imapflow.
      logger: false,
      // Force IDLE to restart every 4 minutes. Without this, Gmail's
      // server-side idle-connection timeout (~30 min on free accounts,
      // less under load) silently drops the connection; the next
      // search returns stale/empty results and the operator sees
      // "secretary went silent after a while". 4 min is well under
      // every documented timeout window, cheap (one NOOP + reselect
      // per cycle), and forces imapflow to refresh its EXISTS state
      // so newly arrived mail shows up immediately.
      maxIdleTime: 4 * 60_000,
    };
    this.smtpCfg = {
      host: opts.smtp.host,
      port: opts.smtp.port,
      secure: opts.smtp.secure,
      auth: { user: opts.username, pass: opts.password },
    };
    this.imapFactory = opts.imapFactory ?? ((cfg) => new ImapFlow(cfg));
    this.smtpFactory = opts.smtpFactory ?? ((cfg) => nodemailer.createTransport(cfg));
  }

  async call(method: string, params: Record<string, unknown>): Promise<JsonRpcResult> {
    if (method !== "tools/call") {
      return { ok: false, reason: `IMAP+SMTP bridge: unsupported MCP method ${method}` };
    }
    const name = typeof params.name === "string" ? params.name : "";
    const args =
      params.arguments && typeof params.arguments === "object"
        ? (params.arguments as Record<string, unknown>)
        : {};
    // Single-shot reconnect-and-retry on connection-level errors.
    // imapflow throws `code=NoConnection` when the underlying TCP
    // socket is gone (Gmail per-account connection cap, idle TCP
    // reset, transient network blip). Under the daily-loop's bounded
    // concurrency, one failure currently cascades across every in-
    // flight tool call sharing the same connection — the second poll
    // reconnects, but the THIS-poll's writes are lost. Retry once
    // after a fresh getImap() and the operator-visible error rate
    // collapses without changing protocol-level error semantics.
    let attempt = 0;
    const MAX_ATTEMPTS = 2;
    let lastErr: unknown;
    while (attempt < MAX_ATTEMPTS) {
      attempt += 1;
      try {
        switch (name) {
          case "search_threads":
            return { ok: true, result: await this.searchThreads(args) };
          case "get_thread":
            return { ok: true, result: await this.getThread(args) };
          case "create_draft":
            return { ok: true, result: await this.createDraft(args) };
          case "send_draft":
            return { ok: true, result: await this.sendDraft(args) };
          case "modify_thread_labels":
            return { ok: true, result: await this.modifyThreadLabels(args) };
          case "mark_thread_seen":
            return { ok: true, result: await this.markThreadSeen(args) };
          case "get_attachment":
            return { ok: true, result: await this.getAttachment(args) };
          default:
            return {
              ok: false,
              reason: `IMAP+SMTP bridge: unknown tool: ${name}`,
            };
        }
      } catch (err) {
        lastErr = err;
        const e = err as { code?: unknown };
        const isTransient =
          typeof e.code === "string" &&
          (e.code === "NoConnection" ||
            e.code === "ECONNRESET" ||
            e.code === "ETIMEDOUT" ||
            e.code === "ENOTCONN" ||
            e.code === "ESOCKET" ||
            e.code === "EPIPE");
        if (isTransient && attempt < MAX_ATTEMPTS) {
          await this.dropConnection().catch(() => {});
          // Best-effort warm-reconnect so the next iteration's call
          // doesn't race with another caller's first attempt. Failure
          // here is non-fatal — the next call will try again.
          await this.getImap().catch(() => {});
          continue;
        }
        break;
      }
    }
    {
      const err = lastErr;
      // Drop the connection on any error so the next call reconnects
      // fresh. imapflow's per-error recovery is fine for transient
      // network issues but cannot recover from auth-state desync.
      await this.dropConnection().catch(() => {});
      // imapflow attaches code / command / responseText / serverResponseCode
      // when the failure is a server-side IMAP error (NO / BAD). Without
      // those, the upstream sees only "Command failed" — completely
      // opaque. Inline whichever fields are present so service.log
      // carries enough breadcrumbs to identify which IMAP verb against
      // which mailbox returned what status.
      const e = err as Error & {
        code?: unknown;
        command?: unknown;
        responseText?: unknown;
        serverResponseCode?: unknown;
        response?: unknown;
      };
      const parts: string[] = [];
      if (typeof e.code === "string" && e.code.length > 0) {
        parts.push(`code=${e.code}`);
      }
      if (typeof e.command === "string" && e.command.length > 0) {
        parts.push(`cmd=${e.command}`);
      }
      if (typeof e.serverResponseCode === "string" && e.serverResponseCode.length > 0) {
        parts.push(`status=${e.serverResponseCode}`);
      }
      const responseText =
        typeof e.responseText === "string"
          ? e.responseText
          : typeof e.response === "string"
            ? e.response
            : "";
      if (responseText) {
        // Trim long server responses; an IMAP BAD response is usually
        // < 200 chars, but a NO with attached APPEND can be longer.
        const t = responseText.length > 200 ? responseText.slice(0, 200) + "…" : responseText;
        parts.push(`response="${t}"`);
      }
      const ctx = parts.length > 0 ? ` (${parts.join(" ")})` : "";
      return { ok: false, reason: `imap+smtp ${name}: ${e.message ?? "Command failed"}${ctx}` };
    }
  }

  /** Close the cached IMAP connection. Idempotent. */
  async close(): Promise<void> {
    await this.dropConnection();
  }

  private async getImap(): Promise<ImapFlow> {
    if (this.imap?.usable) {
      // imapflow's `usable` flag only reflects the client's local
      // view of the connection. Gmail can silently half-close a long-
      // running TCP connection without sending FIN — the client
      // believes it's still talking, every command returns immediately
      // with stale/empty results, and the operator sees "secretary
      // went silent". A NOOP forces a real round-trip; if it errors,
      // the connection is dead and we drop + rebuild.
      try {
        await this.imap.noop();
        return this.imap;
      } catch {
        await this.dropConnection().catch(() => {});
      }
    }
    if (this.connectingPromise) {
      return this.connectingPromise;
    }
    this.connectingPromise = (async () => {
      const client = this.imapFactory(this.imapCfg);
      await client.connect();
      this.imap = client;
      this.connectingPromise = null;
      return client;
    })();
    try {
      return await this.connectingPromise;
    } catch (err) {
      this.connectingPromise = null;
      throw err;
    }
  }

  private async dropConnection(): Promise<void> {
    const c = this.imap;
    this.imap = null;
    this.connectingPromise = null;
    if (c) {
      try {
        await c.logout();
      } catch {
        // Best effort; the socket may already be gone.
      }
    }
  }

  private async searchThreads(args: Record<string, unknown>): Promise<{
    threads: ReadonlyArray<ThreadSummary>;
  }> {
    const query =
      typeof args.query === "string" && args.query.trim().length > 0
        ? args.query.trim()
        : "in:inbox";
    const maxResults =
      typeof args.maxResults === "number" && args.maxResults > 0
        ? Math.min(Math.floor(args.maxResults), 50)
        : 10;

    const imap = await this.getImap();
    const lock = await imap.getMailboxLock("INBOX", { readOnly: true });
    try {
      // gmailRaw passes the query verbatim into Gmail's X-GM-RAW
      // server-side parser. Falls back to a no-op SEARCH ALL on hosts
      // that don't implement the extension; we surface that mismatch
      // up to the caller via an empty result rather than guessing.
      // imapflow's search() returns false on a server-side empty / no-match
      // response (UIDPLUS-less servers behave this way). Treat that as
      // "no hits" rather than propagating false through the rest of the
      // pipeline.
      const searchRes = await imap.search({ gmailraw: query }, { uid: true });
      const uids: number[] = searchRes === false ? [] : searchRes;
      if (uids.length === 0) {
        return { threads: [] };
      }
      // Group by X-GM-THRID, keeping the HIGHEST-UID message per
      // thread as the summary (and as `lastUid` for the runtime
      // dedup). The previous "first occurrence wins" approach was
      // assuming the iteration order matched the descending sort,
      // but IMAP servers always return UID FETCH results in
      // ASCENDING order regardless of how the client listed them
      // (RFC 3501) — so it was silently storing the OLDEST message's
      // UID per thread, and follow-up messages in the same thread
      // were getting filtered out by isProcessed (lastUid never
      // changed across polls). Over-fetch by 4x maxResults to leave
      // room for threads with many in-bucket messages.
      const sorted = [...uids].toSorted((a, b) => b - a);
      const ceiling = Math.min(sorted.length, Math.max(maxResults * 4, 50));
      const target = sorted.slice(0, ceiling);
      const summaries = new Map<string, ThreadSummary>();
      for await (const msg of imap.fetch(
        target,
        {
          uid: true,
          envelope: true,
          flags: true,
          internalDate: true,
          threadId: true,
          labels: true,
          source: false,
          bodyParts: ["TEXT"],
        },
        { uid: true },
      )) {
        const tid = msg.threadId ?? `uid:${msg.uid}`;
        const existing = summaries.get(tid);
        if (existing && existing.lastUid >= msg.uid) {
          continue;
        }
        const env = msg.envelope ?? {};
        const flagsArr = msg.flags ? Array.from(msg.flags) : [];
        const labelSet = new Set<string>();
        if (msg.labels) {
          for (const l of msg.labels) {
            labelSet.add(l);
          }
        }
        const textBuf = msg.bodyParts?.get("TEXT");
        const snippet = bytesToString(textBuf).replace(/\s+/g, " ").trim().slice(0, SNIPPET_BYTES);
        summaries.set(tid, {
          threadId: tid,
          subject: env.subject ?? "(no subject)",
          from: normalizeAddress(env.from?.[0]),
          snippet,
          // imapflow's internalDate type widened to `string | Date`; coerce
          // before formatting so the output contract (always ISO-8601) holds.
          lastDate: toIsoDate(msg.internalDate ?? env.date ?? new Date(0)),
          unread: !flagsArr.includes("\\Seen"),
          labels: Object.freeze([...labelSet]),
          lastUid: msg.uid,
        });
      }
      // Order by lastUid descending (newest threads first) and cap.
      const threadOrder = [...summaries.values()]
        .toSorted((a, b) => b.lastUid - a.lastUid)
        .slice(0, maxResults)
        .map((s) => s.threadId);
      return {
        threads: Object.freeze(
          threadOrder
            .slice(0, maxResults)
            .map((tid) => summaries.get(tid))
            .filter((s): s is ThreadSummary => s !== undefined),
        ),
      };
    } finally {
      lock.release();
    }
  }

  private async getThread(args: Record<string, unknown>): Promise<{
    threadId: string;
    messages: ReadonlyArray<ThreadMessage>;
  }> {
    const threadId = typeof args.threadId === "string" ? args.threadId : "";
    if (!threadId) {
      throw new Error("threadId is required");
    }

    const imap = await this.getImap();
    // Gmail-style threading lives in All Mail. Fall back to INBOX on
    // hosts that don't expose [Gmail]/All Mail; the search-by-thread
    // semantics still work because X-GM-THRID is Gmail-only and would
    // have returned empty results from search_threads on a non-Gmail
    // host in the first place.
    const allMail = await this.firstExistingMailbox([GMAIL_ALL_MAIL, "INBOX"]);
    const lock = await imap.getMailboxLock(allMail, { readOnly: true });
    try {
      const searchRes = await imap.search({ threadId }, { uid: true });
      const uids: number[] = searchRes === false ? [] : searchRes;
      if (uids.length === 0) {
        return { threadId, messages: [] };
      }
      const sorted = [...uids].toSorted((a, b) => a - b);
      const messages: ThreadMessage[] = [];
      for await (const msg of imap.fetch(
        sorted,
        {
          uid: true,
          envelope: true,
          flags: true,
          internalDate: true,
          labels: true,
          source: true,
        },
        { uid: true },
      )) {
        const env = msg.envelope ?? {};
        const labelSet = new Set<string>();
        if (msg.labels) {
          for (const l of msg.labels) {
            labelSet.add(l);
          }
        }
        const parsed = msg.source ? await simpleParser(msg.source) : null;
        const bodyText = parsed?.text?.trim() ?? "";
        const attachments: ThreadAttachment[] = [];
        for (const att of parsed?.attachments ?? []) {
          // mailparser also exposes inline parts (embedded images,
          // signed/encrypted blocks); only count entries with a real
          // filename or an explicit "attachment" disposition so the
          // list the LLM sees matches what the operator would call
          // an attachment in their mail client.
          const filename =
            typeof att.filename === "string" && att.filename.length > 0 ? att.filename : "";
          const disposition =
            typeof att.contentDisposition === "string" ? att.contentDisposition : "";
          if (!filename && disposition !== "attachment") continue;
          attachments.push({
            filename: filename || "(unnamed)",
            contentType:
              typeof att.contentType === "string" ? att.contentType : "application/octet-stream",
            size: typeof att.size === "number" ? att.size : 0,
          });
        }
        messages.push({
          messageId: env.messageId ?? `<uid-${msg.uid}@imap.local>`,
          date: toIsoDate(env.date ?? msg.internalDate ?? new Date(0)),
          from: normalizeAddress(env.from?.[0]),
          to: normalizeAddressList(env.to),
          cc: normalizeAddressList(env.cc),
          subject: env.subject ?? "(no subject)",
          bodyText,
          labels: Object.freeze([...labelSet]),
          attachments: Object.freeze(attachments),
        });
      }
      return { threadId, messages: Object.freeze(messages) };
    } finally {
      lock.release();
    }
  }

  private async createDraft(args: Record<string, unknown>): Promise<CreateDraftOutput> {
    const input = parseCreateDraftInput(args);
    // Threading: if the caller passed a Gmail X-GM-THRID, look up the
    // newest message in that thread and use its RFC 822 Message-ID
    // for the In-Reply-To / References headers. This keeps the
    // runtime contract identical to what the Google Gmail MCP
    // accepted (a threadId arg) while still letting an explicit
    // inReplyTo override take precedence.
    const threadId = typeof args.threadId === "string" ? args.threadId.trim() : "";
    let derivedInReplyTo = input.inReplyTo;
    let derivedReferences = input.references ? [...input.references] : undefined;
    if (threadId && !derivedInReplyTo) {
      try {
        const head = await this.headMessageOfThread(threadId);
        if (head?.messageId) {
          derivedInReplyTo = head.messageId;
          derivedReferences = [...(derivedReferences ?? []), head.messageId];
        }
      } catch {
        // Thread lookup failed; fall through with no In-Reply-To.
        // The draft will still send; it just won't thread cleanly.
      }
    }
    // Compose the RFC822 bytes via nodemailer's streamTransport. This
    // is identical to what would be sent over SMTP if we sent it now;
    // append-to-Drafts just stores those exact bytes server-side so
    // send_draft can later relay them unmodified.
    const composer = nodemailer.createTransport({ streamTransport: true, newline: "unix" });
    const info = await composer.sendMail({
      from: this.fromHeader,
      to: [...input.to],
      cc: input.cc ? [...input.cc] : undefined,
      bcc: input.bcc ? [...input.bcc] : undefined,
      subject: input.subject,
      text: input.bodyText,
      inReplyTo: derivedInReplyTo,
      references: derivedReferences,
    });
    // nodemailer 8 changed streamTransport's `info.message` from a Buffer
    // (7.x) to a Readable stream. Drain it deterministically so the rest
    // of the bridge does not have to care.
    const rfc822 = await drainToBuffer(info.message);
    const messageId = info.messageId ?? `<draft-${Date.now()}@imap-smtp.local>`;

    const imap = await this.getImap();
    const drafts = await this.firstExistingMailbox([GMAIL_DRAFTS, "Drafts", "INBOX"]);
    // imapflow's append() returns { uid, uidValidity, seq } when the
    // server advertises UIDPLUS — Gmail does. The UID is the durable
    // handle send_draft will use to look the message back up. On a
    // non-UIDPLUS server (or on error), append() returns false.
    const appendRes = await imap.append(drafts, rfc822, ["\\Draft"]);
    const draftUid =
      appendRes !== false && typeof appendRes?.uid === "number" ? appendRes.uid : null;
    if (draftUid === null) {
      throw new Error("IMAP APPEND succeeded but server returned no UID; cannot track draft");
    }
    return Object.freeze({ draftId: String(draftUid), messageId });
  }

  private async sendDraft(args: Record<string, unknown>): Promise<SendDraftOutput> {
    const draftId = typeof args.draftId === "string" ? args.draftId : "";
    if (!draftId) {
      throw new Error("draftId is required");
    }
    const uid = Number.parseInt(draftId, 10);
    if (!Number.isFinite(uid) || uid <= 0) {
      throw new Error(`invalid draftId: ${draftId}`);
    }

    const imap = await this.getImap();
    const drafts = await this.firstExistingMailbox([GMAIL_DRAFTS, "Drafts"]);

    // Fetch the draft's raw RFC822 bytes + Message-ID header.
    const lock = await imap.getMailboxLock(drafts, { readOnly: false });
    let rfc822: Buffer | null = null;
    let messageId = "";
    let toAddresses: string[] = [];
    try {
      for await (const msg of imap.fetch(
        String(uid),
        { uid: true, envelope: true, source: true },
        { uid: true },
      )) {
        if (msg.uid !== uid) {
          continue;
        }
        rfc822 = msg.source ?? null;
        messageId = msg.envelope?.messageId ?? "";
        toAddresses = (msg.envelope?.to ?? [])
          .map((a) => a.address)
          .filter((a): a is string => typeof a === "string");
      }
      if (!rfc822) {
        throw new Error(`draft ${draftId} not found in ${drafts}`);
      }

      // Relay via SMTP. nodemailer's `raw` mode bypasses MIME
      // composition and sends exactly the bytes we APPENDed earlier,
      // so the Message-ID and threading headers are preserved.
      //
      // The explicit `envelope` is what makes Gmail's server-side
      // auto-copy-to-Sent kick in: without it, nodemailer infers
      // MAIL FROM from the From: header — which contains a display
      // name ("Alfredo's Secretary <user@gmail.com>") — and Gmail
      // refuses to auto-mirror when the envelope sender doesn't
      // match the authenticated user exactly. Forcing MAIL FROM
      // to the bare authenticated address fixes that, which is
      // why HITL emails (sent via plain sendMail without raw mode)
      // landed in Sent but contact replies didn't.
      const smtp = this.getSmtp();
      await smtp.sendMail({
        from: this.fromHeader,
        to: toAddresses,
        raw: rfc822,
        envelope: {
          from: this.username,
          to: toAddresses,
        },
      });

      // Explicitly APPEND a copy to Sent Mail. Gmail historically
      // auto-copied SMTP submissions there server-side, but that
      // behaviour is only reliable when the SMTP envelope sender
      // exactly matches the authenticated user AND the operator
      // hasn't disabled "Show in IMAP" for the [Gmail]/Sent Mail
      // label. Operator observed "Sent folder is empty" with the
      // auto-copy path, so the bridge now appends explicitly. The
      // \Seen flag matches Gmail's normal sent-message state. On
      // non-Gmail providers we fall back to a "Sent" folder and, if
      // even that is missing, skip — the message has already been
      // delivered, the local Sent copy is a convenience not a
      // correctness requirement.
      let sentMirrorErr = "";
      try {
        const sent = await this.firstExistingMailbox([GMAIL_SENT, "Sent", "Sent Items"]);
        await imap.append(sent, rfc822, ["\\Seen"]);
        process.stderr.write(
          `[imap-smtp info] send_draft: appended copy to ${sent} for ${this.username} ` +
            `(check there if your Sent Mail looks empty in the web UI — Gmail's ` +
            `"Show in IMAP" toggle for the Sent Mail label can hide it)\n`,
        );
      } catch (err) {
        sentMirrorErr = (err as Error).message ?? String(err);
      }

      // Delete the draft. We try three approaches in order, because
      // Gmail's IMAP surface has been finicky in the field:
      //   1) messageMove to [Gmail]/Trash — the most reliable on
      //      Gmail because Trash is a real terminal label and the
      //      MOVE removes the message from Drafts atomically.
      //   2) messageDelete — \Deleted + UID EXPUNGE in one shot
      //      against the locked Drafts mailbox.
      //   3) raw STORE +FLAGS \Deleted + UID EXPUNGE <uid> as a
      //      last resort if both higher-level calls silently no-op.
      // Operator observed "drafts pile up after send" through (2)
      // alone, so the MOVE path is the new primary.
      let cleaned = false;
      const cleanupErrs: string[] = [];
      try {
        const trash = await this.firstExistingMailbox([
          "[Gmail]/Trash",
          "Trash",
          "Deleted Items",
          "Deleted Messages",
        ]);
        await imap.messageMove(String(uid), trash, { uid: true });
        cleaned = true;
      } catch (err) {
        cleanupErrs.push(`move-to-Trash: ${(err as Error).message ?? String(err)}`);
      }
      if (!cleaned) {
        try {
          await imap.messageDelete(String(uid), { uid: true });
          cleaned = true;
        } catch (err) {
          cleanupErrs.push(`messageDelete: ${(err as Error).message ?? String(err)}`);
        }
      }
      if (!cleaned) {
        try {
          await imap.messageFlagsAdd(String(uid), ["\\Deleted"], { uid: true });
          await imapExec(imap, "UID EXPUNGE", [{ type: "SEQUENCE", value: String(uid) }]);
          cleaned = true;
        } catch (err) {
          cleanupErrs.push(`STORE+EXPUNGE: ${(err as Error).message ?? String(err)}`);
        }
      }
      // Surface mirror/cleanup problems directly via stderr so they
      // land in service.log. Sent-mirror failure is non-fatal (message
      // left the box, just no local copy); cleanup failure means the
      // operator's Drafts folder will accumulate until the next manual
      // sweep. Operator visibility > best-effort silence.
      if (sentMirrorErr) {
        process.stderr.write(
          `[imap-smtp warn] send_draft: failed to mirror to Sent: ${sentMirrorErr}\n`,
        );
      }
      if (!cleaned) {
        process.stderr.write(
          `[imap-smtp warn] send_draft: draft uid=${uid} could not be removed from Drafts — ${cleanupErrs.join("; ")}\n`,
        );
      }
    } finally {
      lock.release();
    }

    return Object.freeze({
      messageId: messageId || `<sent-${Date.now()}@imap-smtp.local>`,
      sentAt: new Date().toISOString(),
      recipient: toAddresses[0] ?? "",
    });
  }

  private async modifyThreadLabels(
    args: Record<string, unknown>,
  ): Promise<ModifyThreadLabelsOutput> {
    const threadId = typeof args.threadId === "string" ? args.threadId : "";
    if (!threadId) {
      throw new Error("threadId is required");
    }
    const addLabels = normalizeLabelList(args.addLabels);
    const removeLabels = normalizeLabelList(args.removeLabels);
    if (addLabels.length === 0 && removeLabels.length === 0) {
      return Object.freeze({ threadId, applied: Object.freeze({ add: [], remove: [] }) });
    }

    const imap = await this.getImap();
    const allMail = await this.firstExistingMailbox([GMAIL_ALL_MAIL, "INBOX"]);
    // Pre-create any add-labels that don't exist yet. Gmail represents
    // labels as IMAP folders; creating the folder creates the label.
    if (addLabels.length > 0) {
      const listing = await imap.list();
      const names = new Set(listing.map((m) => m.path));
      for (const label of addLabels) {
        if (!names.has(label)) {
          try {
            await imap.mailboxCreate(label);
          } catch {
            // Concurrent create or server-side normalisation can race;
            // fall through and let the COPY surface the real error.
          }
        }
      }
    }

    const lock = await imap.getMailboxLock(allMail, { readOnly: false });
    const appliedAdd: string[] = [];
    const appliedRemove: string[] = [];
    try {
      const searchRes = await imap.search({ threadId }, { uid: true });
      const uids: number[] = searchRes === false ? [] : searchRes;
      if (uids.length === 0) {
        return Object.freeze({
          threadId,
          applied: Object.freeze({ add: [], remove: [] }),
        });
      }
      const uidSpec = uids.join(",");

      // Adds: COPY messages into the label folder. Gmail interprets
      // a COPY into a label-folder as "also tag with this label" and
      // does NOT duplicate the underlying message. Wrap each per-label
      // COPY in a try/catch so the error message carries (a) the
      // exact label that failed, (b) the source mailbox we were locked
      // on, and (c) the UID range — without that context the runtime
      // surfaces a generic "Command failed" with no actionable detail.
      for (const label of addLabels) {
        try {
          await imap.messageCopy(uidSpec, label, { uid: true });
          appliedAdd.push(label);
        } catch (err) {
          throw new Error(
            `messageCopy to "${label}" failed from "${allMail}" ` +
              `(uids=${uidSpec}): ${(err as Error).message}`,
            { cause: err },
          );
        }
      }

      // Removes: STORE -X-GM-LABELS via the lowlevel IMAP runner.
      // imapflow's high-level API doesn't expose Gmail-label removal
      // directly, so we issue the raw IMAP command. Same labelled
      // failure handling as the COPY path above.
      for (const label of removeLabels) {
        try {
          await imapExec(imap, "UID STORE", [
            { type: "SEQUENCE", value: uidSpec },
            { type: "ATOM", value: "-X-GM-LABELS" },
            { type: "LIST", value: [{ type: "STRING", value: label }] },
          ]);
          appliedRemove.push(label);
        } catch (err) {
          throw new Error(
            `UID STORE -X-GM-LABELS "${label}" failed from "${allMail}" ` +
              `(uids=${uidSpec}): ${(err as Error).message}`,
            { cause: err },
          );
        }
      }
    } finally {
      lock.release();
    }
    return Object.freeze({
      threadId,
      applied: Object.freeze({
        add: Object.freeze(appliedAdd),
        remove: Object.freeze(appliedRemove),
      }),
    });
  }

  // STORE +FLAGS \Seen on every message in a Gmail X-GM-THRID thread.
  // Lets the secretary "consume" a thread after handling it so the
  // next `is:unread` search doesn't return the same thread again
  // unless a NEW message has since landed (in which case Gmail will
  // re-mark the thread unread server-side and it'll come back through
  // the search exactly once per follow-up).
  //
  // Operates against All Mail so the \Seen flag persists at the
  // mailbox-spanning level — Gmail flags are per-(label, message)
  // and a STORE on All Mail propagates to INBOX, Sent, etc., for
  // the same underlying message.
  private async markThreadSeen(
    args: Record<string, unknown>,
  ): Promise<{ threadId: string; markedCount: number }> {
    const threadId = typeof args.threadId === "string" ? args.threadId : "";
    if (!threadId) {
      throw new Error("threadId is required");
    }
    const imap = await this.getImap();
    const allMail = await this.firstExistingMailbox([GMAIL_ALL_MAIL, "INBOX"]);
    const lock = await imap.getMailboxLock(allMail, { readOnly: false });
    try {
      const searchRes = await imap.search({ threadId }, { uid: true });
      const uids: number[] = searchRes === false ? [] : searchRes;
      if (uids.length === 0) {
        return Object.freeze({ threadId, markedCount: 0 });
      }
      await imap.messageFlagsAdd(uids.join(","), ["\\Seen"], { uid: true });
      return Object.freeze({ threadId, markedCount: uids.length });
    } finally {
      lock.release();
    }
  }

  /**
   * Fetch the bytes of a specific attachment in a thread message.
   * Inputs: threadId, messageIdx (0-based position of the message
   * inside the thread as returned by getThread), attachmentIdx
   * (0-based index into ThreadMessage.attachments). Returns base64-
   * encoded bytes plus content metadata. Caller decodes.
   */
  private async getAttachment(args: Record<string, unknown>): Promise<{
    filename: string;
    contentType: string;
    size: number;
    base64: string;
  }> {
    const threadId = typeof args.threadId === "string" ? args.threadId : "";
    const messageIdx = typeof args.messageIdx === "number" ? Math.floor(args.messageIdx) : -1;
    const attachmentIdx =
      typeof args.attachmentIdx === "number" ? Math.floor(args.attachmentIdx) : -1;
    if (!threadId) throw new Error("threadId is required");
    if (messageIdx < 0) throw new Error("messageIdx must be a non-negative integer");
    if (attachmentIdx < 0) throw new Error("attachmentIdx must be a non-negative integer");

    const imap = await this.getImap();
    const allMail = await this.firstExistingMailbox([GMAIL_ALL_MAIL, "INBOX"]);
    const lock = await imap.getMailboxLock(allMail, { readOnly: true });
    try {
      const searchRes = await imap.search({ threadId }, { uid: true });
      const uids: number[] = searchRes === false ? [] : searchRes;
      if (uids.length === 0) throw new Error(`no messages found for threadId=${threadId}`);
      const sorted = [...uids].toSorted((a, b) => a - b);
      const uid = sorted[messageIdx];
      if (typeof uid !== "number") {
        throw new Error(
          `messageIdx=${messageIdx} out of range (thread has ${sorted.length} message(s))`,
        );
      }
      // imapflow types fetchOne as `false | FetchMessageObject`; the
      // truthiness check narrows both arms.
      const msg = await imap.fetchOne(uid, { source: true }, { uid: true });
      if (!msg || !msg.source) {
        throw new Error(`failed to fetch source for uid=${uid}`);
      }
      const parsed = await simpleParser(msg.source);
      const eligible: ThreadAttachment[] = [];
      const bytesByIdx: Buffer[] = [];
      for (const att of parsed.attachments ?? []) {
        const filename =
          typeof att.filename === "string" && att.filename.length > 0 ? att.filename : "";
        const disposition =
          typeof att.contentDisposition === "string" ? att.contentDisposition : "";
        if (!filename && disposition !== "attachment") continue;
        eligible.push({
          filename: filename || "(unnamed)",
          contentType:
            typeof att.contentType === "string" ? att.contentType : "application/octet-stream",
          size: typeof att.size === "number" ? att.size : 0,
        });
        bytesByIdx.push(Buffer.isBuffer(att.content) ? att.content : Buffer.from(att.content));
      }
      const meta = eligible[attachmentIdx];
      const bytes = bytesByIdx[attachmentIdx];
      if (!meta || !bytes) {
        throw new Error(
          `attachmentIdx=${attachmentIdx} out of range (message has ${eligible.length} attachment(s))`,
        );
      }
      return Object.freeze({
        filename: meta.filename,
        contentType: meta.contentType,
        size: bytes.byteLength,
        base64: bytes.toString("base64"),
      });
    } finally {
      lock.release();
    }
  }

  private getSmtp(): Transporter {
    if (!this.smtp) {
      this.smtp = this.smtpFactory(this.smtpCfg);
    }
    return this.smtp;
  }

  private async firstExistingMailbox(candidates: ReadonlyArray<string>): Promise<string> {
    const imap = await this.getImap();
    const listing = await imap.list();
    const names = new Set(listing.map((m) => m.path));
    for (const c of candidates) {
      if (names.has(c)) {
        return c;
      }
    }
    return candidates[candidates.length - 1];
  }

  // Resolve the newest message of a Gmail thread to its RFC 822
  // Message-ID. Used by create_draft to populate In-Reply-To /
  // References headers when the caller passes a threadId instead of
  // explicit message-level threading hints. Returns null on any
  // failure path (no UIDs match, server doesn't support X-GM-THRID,
  // mailbox couldn't be opened) — create_draft falls through to
  // un-threaded send when this returns null.
  private async headMessageOfThread(threadId: string): Promise<{ messageId: string } | null> {
    const imap = await this.getImap();
    const folder = await this.firstExistingMailbox([GMAIL_ALL_MAIL, "INBOX"]);
    const lock = await imap.getMailboxLock(folder, { readOnly: true });
    try {
      const searchRes = await imap.search({ threadId }, { uid: true });
      const uids: number[] = searchRes === false ? [] : searchRes;
      if (uids.length === 0) {
        return null;
      }
      const latest = [...uids].toSorted((a, b) => b - a)[0];
      for await (const msg of imap.fetch(
        String(latest),
        { uid: true, envelope: true },
        { uid: true },
      )) {
        if (msg.envelope?.messageId) {
          return { messageId: msg.envelope.messageId };
        }
      }
      return null;
    } finally {
      lock.release();
    }
  }
}

// Read every byte off a nodemailer `info.message` regardless of which
// shape it takes in the installed version (Buffer in 7.x, Readable
// stream in 8.x). Defensive on string + Uint8Array too.
async function drainToBuffer(source: unknown): Promise<Buffer> {
  if (Buffer.isBuffer(source)) {
    return source;
  }
  if (typeof source === "string") {
    return Buffer.from(source, "utf8");
  }
  if (source instanceof Uint8Array) {
    return Buffer.from(source);
  }
  if (
    source &&
    typeof source === "object" &&
    typeof (source as { [Symbol.asyncIterator]?: unknown })[Symbol.asyncIterator] === "function"
  ) {
    const chunks: Buffer[] = [];
    for await (const chunk of source as AsyncIterable<Buffer | string | Uint8Array>) {
      chunks.push(
        Buffer.isBuffer(chunk)
          ? chunk
          : typeof chunk === "string"
            ? Buffer.from(chunk, "utf8")
            : Buffer.from(chunk),
      );
    }
    return Buffer.concat(chunks);
  }
  throw new Error("drainToBuffer: unsupported nodemailer info.message shape");
}

function parseCreateDraftInput(args: Record<string, unknown>): CreateDraftInput {
  const to = parseEmailArray(args.to, "to");
  if (to.length === 0) {
    throw new Error("create_draft: `to` must be a non-empty array of email addresses");
  }
  const subject = typeof args.subject === "string" ? args.subject : "";
  const bodyText = typeof args.bodyText === "string" ? args.bodyText : "";
  if (!subject) {
    throw new Error("create_draft: `subject` is required");
  }
  return Object.freeze({
    to,
    cc: args.cc === undefined ? undefined : parseEmailArray(args.cc, "cc"),
    bcc: args.bcc === undefined ? undefined : parseEmailArray(args.bcc, "bcc"),
    subject,
    bodyText,
    inReplyTo: typeof args.inReplyTo === "string" ? args.inReplyTo : undefined,
    references:
      args.references === undefined ? undefined : parseStringArray(args.references, "references"),
  });
}

function parseEmailArray(value: unknown, field: string): ReadonlyArray<string> {
  if (!Array.isArray(value)) {
    throw new Error(`${field} must be an array of email addresses`);
  }
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string" || !/^.+@.+\..+$/.test(entry)) {
      throw new Error(`${field}: ${JSON.stringify(entry)} is not a valid email address`);
    }
    out.push(entry);
  }
  return Object.freeze(out);
}

function parseStringArray(value: unknown, field: string): ReadonlyArray<string> {
  if (!Array.isArray(value)) {
    throw new Error(`${field} must be an array of strings`);
  }
  return Object.freeze(value.map((v) => String(v)));
}

function normalizeLabelList(value: unknown): ReadonlyArray<string> {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error("addLabels / removeLabels must be arrays of strings");
  }
  return Object.freeze(
    value.map((v) => (typeof v === "string" ? v.trim() : "")).filter((v) => v.length > 0),
  );
}

// Gmail folder constants. Other hosts (Fastmail, iCloud, self-hosted
// Dovecot) use the IETF-default names (INBOX, Drafts, Sent); the
// firstExistingMailbox() helper falls back through the candidate list
// in order, so these constants are correct as Gmail-first defaults.
export const FOLDERS = Object.freeze({
  ALL_MAIL: GMAIL_ALL_MAIL,
  DRAFTS: GMAIL_DRAFTS,
  SENT: GMAIL_SENT,
});
