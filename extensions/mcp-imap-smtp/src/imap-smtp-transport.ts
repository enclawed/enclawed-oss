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

export class ImapSmtpTransport implements McpTransport {
  private readonly imapCfg: ConstructorParameters<typeof ImapFlow>[0];
  private readonly smtpCfg: SmtpConfig;
  private readonly username: string;
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
    this.imapCfg = {
      host: opts.imap.host,
      port: opts.imap.port,
      secure: opts.imap.secure,
      auth: { user: opts.username, pass: opts.password },
      // imapflow's default logger pretty-prints to stderr. The
      // secretary runs as a background service and the audit log is
      // the canonical observability surface; silence imapflow.
      logger: false,
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
        default:
          return {
            ok: false,
            reason: `IMAP+SMTP bridge: unknown tool: ${name}`,
          };
      }
    } catch (err) {
      // Drop the connection on any error so the next call reconnects
      // fresh. imapflow's per-error recovery is fine for transient
      // network issues but cannot recover from auth-state desync.
      await this.dropConnection().catch(() => {});
      return { ok: false, reason: `imap+smtp ${name}: ${(err as Error).message}` };
    }
  }

  /** Close the cached IMAP connection. Idempotent. */
  async close(): Promise<void> {
    await this.dropConnection();
  }

  private async getImap(): Promise<ImapFlow> {
    if (this.imap?.usable) {
      return this.imap;
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
    const lock = await imap.getMailboxLock("INBOX", { readonly: true });
    try {
      // gmailRaw passes the query verbatim into Gmail's X-GM-RAW
      // server-side parser. Falls back to a no-op SEARCH ALL on hosts
      // that don't implement the extension; we surface that mismatch
      // up to the caller via an empty result rather than guessing.
      const uids = (await imap.search({ gmailRaw: query }, { uid: true })) ?? [];
      if (uids.length === 0) {
        return { threads: [] };
      }
      // Group by X-GM-THRID, keeping the most recent UID per thread.
      // Fetch newest-first: imapflow's UID order is ascending, so we
      // reverse and consume up to maxResults * 4 (over-fetch to leave
      // room for threads with many in-bucket messages).
      const sorted = [...uids].toSorted((a, b) => b - a);
      const ceiling = Math.min(sorted.length, Math.max(maxResults * 4, 50));
      const target = sorted.slice(0, ceiling);
      const byThread = new Map<string, number>();
      const threadOrder: string[] = [];
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
        if (byThread.has(tid)) {
          continue;
        }
        byThread.set(tid, msg.uid);
        threadOrder.push(tid);
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
          lastDate: (msg.internalDate ?? env.date ?? new Date(0)).toISOString(),
          unread: !flagsArr.includes("\\Seen"),
          labels: Object.freeze([...labelSet]),
        });
        if (threadOrder.length >= maxResults) {
          break;
        }
      }
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
    const lock = await imap.getMailboxLock(allMail, { readonly: true });
    try {
      const uids = (await imap.search({ threadId }, { uid: true })) ?? [];
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
        messages.push({
          messageId: env.messageId ?? `<uid-${msg.uid}@imap.local>`,
          date: (env.date ?? msg.internalDate ?? new Date(0)).toISOString(),
          from: normalizeAddress(env.from?.[0]),
          to: normalizeAddressList(env.to),
          cc: normalizeAddressList(env.cc),
          subject: env.subject ?? "(no subject)",
          bodyText,
          labels: Object.freeze([...labelSet]),
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
      from: this.username,
      to: [...input.to],
      cc: input.cc ? [...input.cc] : undefined,
      bcc: input.bcc ? [...input.bcc] : undefined,
      subject: input.subject,
      text: input.bodyText,
      inReplyTo: derivedInReplyTo,
      references: derivedReferences,
    });
    const rfc822 = info.message instanceof Buffer ? info.message : Buffer.from(info.message);
    const messageId = info.messageId ?? `<draft-${Date.now()}@imap-smtp.local>`;

    const imap = await this.getImap();
    const drafts = await this.firstExistingMailbox([GMAIL_DRAFTS, "Drafts", "INBOX"]);
    // imapflow's append() returns { uid, uidValidity, seq } when the
    // server advertises UIDPLUS — Gmail does. The UID is the durable
    // handle send_draft will use to look the message back up.
    const appendRes = await imap.append(drafts, rfc822, ["\\Draft"]);
    const draftUid = typeof appendRes?.uid === "number" ? appendRes.uid : null;
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
    const lock = await imap.getMailboxLock(drafts, { readonly: false });
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
      const smtp = this.getSmtp();
      await smtp.sendMail({
        from: this.username,
        to: toAddresses,
        raw: rfc822,
      });

      // Best-effort cleanup: mark the draft \Deleted + EXPUNGE. Gmail
      // creates the Sent copy server-side as a side effect of SMTP
      // delivery, so we don't COPY-then-delete by hand.
      await imap.messageFlagsAdd(String(uid), ["\\Deleted"], { uid: true });
      try {
        await imap.expunge();
      } catch {
        // Some servers gate EXPUNGE behind capability flags we may
        // not advertise; the \Deleted mark is enough on its own.
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

    const lock = await imap.getMailboxLock(allMail, { readonly: false });
    const appliedAdd: string[] = [];
    const appliedRemove: string[] = [];
    try {
      const uids = (await imap.search({ threadId }, { uid: true })) ?? [];
      if (uids.length === 0) {
        return Object.freeze({
          threadId,
          applied: Object.freeze({ add: [], remove: [] }),
        });
      }
      const uidSpec = uids.join(",");

      // Adds: COPY messages into the label folder. Gmail interprets
      // a COPY into a label-folder as "also tag with this label" and
      // does NOT duplicate the underlying message.
      for (const label of addLabels) {
        await imap.messageCopy(uidSpec, label, { uid: true });
        appliedAdd.push(label);
      }

      // Removes: STORE -X-GM-LABELS via the lowlevel IMAP runner.
      // imapflow's high-level API doesn't expose Gmail-label removal
      // directly, so we issue the raw IMAP command.
      for (const label of removeLabels) {
        await imap.exec("UID STORE", [
          { type: "SEQUENCE", value: uidSpec },
          { type: "ATOM", value: "-X-GM-LABELS" },
          { type: "LIST", value: [{ type: "STRING", value: label }] },
        ]);
        appliedRemove.push(label);
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
    const lock = await imap.getMailboxLock(folder, { readonly: true });
    try {
      const uids = (await imap.search({ threadId }, { uid: true })) ?? [];
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
