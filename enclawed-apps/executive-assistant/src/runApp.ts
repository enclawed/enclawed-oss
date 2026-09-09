// Orchestrator for `enclawed-apps executive assistant`.
//
// Order of operations (the order matters — egress must be frozen before
// any module touches the network, the trust root must be locked before
// any plugin runs, the audit log must be open before the boot record
// appends):
//
//   1. Resolve runtime config from env + CLI opts.
//   2. Pre-set ENCLAWED_FLAVOR + ENCLAWED_AUDIT_PATH if not yet set.
//   3. Build the strict Policy (enforceAllowlists=true, narrow host list).
//   4. bootstrapEnclawed({ flavor, policy }) — this:
//        - asserts FIPS in enclaved mode,
//        - installs the egress guard (FROZEN in enclaved),
//        - opens the hash-chained audit log,
//        - locks the trust root.
//   5. Load the Google Workspace MCP bridge with the NARROWED allowedTools.
//   6. Build SkillGate with the bicriterion broker, load the synthesized
//      executive assistant skill manifest.
//   7. Build GoogleTools + OllamaClient; sanity-ping Ollama.
//   8. Start daily-loop and eod-scheduler concurrently; wait on the
//      AbortSignal that fires on SIGINT / SIGTERM / --max-runtime-sec.
//   9. On shutdown: stop loops, verify the audit chain, print a final
//      receipt, return exit code.

import { createHash } from "node:crypto";
import { hostname, homedir } from "node:os";
import { resolve as resolvePath } from "node:path";
import {
  QClearedMcpClient,
  loadImapSmtpBridge,
  loadCalDavBridge,
  loadCardDavBridge,
  verifyChain,
  bootstrapEnclawed,
  installRawSocketGuard,
  makeLabel,
  createPolicy,
  CAPABILITY,
  type CapabilityToken,
  SkillGate,
  VERIFICATION,
  type SkillManifest,
  type BrokerRequest,
  type BrokerDecision,
  dlpRedact,
  closeHardwareRootSession,
} from "enclawed/framework";
import { logTimestamp } from "./log-timestamp.js";
import {
  buildSecretaryBroker,
  buildStdinKeypressPrompt,
  buildDialogPrompt,
  type HitlMode,
} from "./policy/bicriterion-broker.js";
import { buildEmailHitlPrompt } from "./policy/email-hitl-prompt.js";
import { SecretaryRuntimeState } from "./runtime-state.js";
import { parseQuietHours, runDailyLoop } from "./scheduler/daily-loop.js";
import { runEodScheduler } from "./scheduler/eod-trigger.js";
import { FollowupStore } from "./scheduler/followup-store.js";
import { GoogleTools } from "./tools/google-tools.js";
import { OllamaClient } from "./tools/ollama-client.js";
import { ReadUrlTool, READ_URL_EGRESS_HOST } from "./tools/read-url.js";
import { WeatherTool, WEATHER_EGRESS_HOST } from "./tools/weather.js";
import { WebSearchTool, WEB_SEARCH_EGRESS_HOSTS } from "./tools/web-search.js";

export type HitlChannel = "auto" | "stdin" | "dialog" | "email";

export type AppRunOptions = Readonly<{
  flavor?: "enclaved" | "open";
  hitl?: HitlMode;
  /** Where the HITL keypress goes when the broker asks for one. */
  hitlChannel?: HitlChannel;
  /**
   * For hitlChannel="email" (or "auto" that resolves to email): max time
   * the broker waits for the principal's reply before treating the
   * request as denied. Default 30 min.
   */
  hitlEmailTimeoutMs?: number;
  /**
   * Principal email — the HUMAN administrator's address. Distinct from
   * the mailbox identity (where the executive assistant signs in). Populated by
   * the launcher from the OS keyring; never from .env. When the
   * installer leaves principal == mailbox (self-admin install), this
   * is empty / unset and the runtime treats principal === mailbox.
   *
   * Both identities are added to the broker's principalSelfAddresses
   * set so writes addressed to either get the same self-send
   * auto-approve treatment. The principal address is what the HITL
   * email broker matches incoming approvals against.
   */
  principalEmailFromEnv?: string;
  eodSummaryAt?: string;
  eodTrashAt?: string;
  inboxPollMs?: number;
  maxRuntimeSec?: number;
  auditPath?: string;
}>;

// Hard-coded narrow tool list. These are the only tool names the
// app will ever invoke; anything else (delete_message, etc.) is
// denied at the bridge admission gate before any network call. Each
// bridge declares the same list via its own narrowing
// allowedToolsOverride below, defence-in-depth.
const SECRETARY_MAIL_TOOLS = Object.freeze([
  "search_threads",
  "get_thread",
  "create_draft",
  "send_draft",
  "modify_thread_labels",
  "mark_thread_seen",
  "get_attachment",
]);
const SECRETARY_CALENDAR_TOOLS = Object.freeze([
  "list_events",
  "get_event",
  "create_event",
  "update_event",
  "delete_event",
]);
const SECRETARY_CONTACTS_TOOLS = Object.freeze(["search_contacts", "list_contacts", "add_contact"]);

const EXECUTIVE_ASSISTANT_SKILL_ID = "enclawed-app-executive-assistant";

export async function runApp(opts: AppRunOptions = {}): Promise<number> {
  const env = process.env;
  // ENCLAWED_FLAVOR is a HARDENING level, not an edition: "enclaved"
  // (aliases secure/classified/high-side) selects the strict posture,
  // "open" (permissive/default) the relaxed one. Both ship in the open
  // build -- the value has nothing to do with proprietary code. See
  // docs/reference/editions-and-hardening.md.
  //
  // This app passes its own explicit policy, audit path and FIPS setting
  // to bootstrapEnclawed, so the flavor's own defaults are largely
  // overridden; the value is kept as the app's declared posture.
  // How mail from someone who is not a contact is handled.
  //   refuse        (default) send the frozen non-contact refusal
  //   triage-silent process it for the principal and send the sender
  //                 NOTHING -- for a mailbox anyone can write to, where
  //                 replying to strangers would make the address an
  //                 always-responding oracle.
  // Multimodal model for image attachments. Empty means images are not
  // read at all; they are still accepted and reported as unread, never
  // guessed at.
  const visionModel = (env.ENCLAWED_EXECUTIVE_ASSISTANT_VISION_MODEL ?? "").trim();

  const rawNonContactPolicy = (env.ENCLAWED_EXECUTIVE_ASSISTANT_NON_CONTACT_POLICY ?? "").trim();
  const nonContactPolicy: "refuse" | "triage-silent" | "process" =
    rawNonContactPolicy === "triage-silent" || rawNonContactPolicy === "process"
      ? rawNonContactPolicy
      : "refuse";

  const flavor: "enclaved" | "open" = opts.flavor ?? "enclaved";
  const hitl: HitlMode = opts.hitl ?? "bicriterion";
  const hitlChannel: HitlChannel = opts.hitlChannel ?? "auto";
  const hitlEmailTimeoutMs = opts.hitlEmailTimeoutMs ?? 30 * 60_000;
  const inboxPollMs = opts.inboxPollMs ?? 5_000;
  // How long to wait when there is nothing to do. Defaults to the poll
  // interval: an idle loop has no reason to run faster than the cadence the
  // operator configured, and when it did, it made 105,000 mailbox reads a day.
  const idlePollMs = (() => {
    const raw = env.ENCLAWED_EXECUTIVE_ASSISTANT_IDLE_POLL_MS;
    if (raw === undefined) {
      return undefined;
    }
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  })();
  // Self-update check cadence. Set the env to 0 (or any non-positive
  // integer) to disable the check entirely. Default 12 hours, which
  // is low enough to surface a security-relevant update within half a
  // day and high enough to avoid wasting bandwidth on idle homes.
  const updateCheckIntervalMs = (() => {
    const raw = env.ENCLAWED_EXECUTIVE_ASSISTANT_UPDATE_CHECK_INTERVAL_MS;
    if (raw === undefined) {
      return 12 * 60 * 60 * 1000;
    }
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return 12 * 60 * 60 * 1000;
    }
    return parsed;
  })();
  // Quiet hours: when set, the daily-loop pauses processOnePoll inside
  // this window so the executive assistant doesn't reply to inbound mail at
  // 3 AM. Format: "HH:MM-HH:MM" in the configured local TZ. Wraps
  // midnight when end < start.
  const quietHours = parseQuietHours(env.ENCLAWED_EXECUTIVE_ASSISTANT_QUIET_HOURS);
  // Draft-for-review mode. When "review", every outbound contact
  // reply is presented to the principal as a YES/NO email before
  // send_draft fires. Default "auto" preserves the pre-review
  // behavior (auto-send). Only meaningful when --hitl-channel=email;
  // for stdin/dialog channels the daily-loop logs a warn and falls
  // back to auto.
  const draftModeRaw = (env.ENCLAWED_EXECUTIVE_ASSISTANT_DRAFT_MODE ?? "auto").toLowerCase().trim();
  const draftMode: "auto" | "review" = draftModeRaw === "review" ? "review" : "auto";
  // Persistent followup store. Survives restarts so a followup
  // scheduled today fires next week even if the service bounces in
  // between. Always on (no env-var gate) — the LLM only sees the
  // tool in the schema when the store is present, and the store has
  // zero footprint until something actually gets scheduled.
  const followups = new FollowupStore(FollowupStore.defaultPath());
  const maxRuntimeSec = opts.maxRuntimeSec ?? 0;
  const eodSummaryAt = opts.eodSummaryAt ?? "23:55";
  const eodTrashAt = opts.eodTrashAt ?? "23:59";

  // Two identities. The MAILBOX is the IMAP/SMTP login; the PRINCIPAL
  // is the human who administrates. Backwards compat for pre-rename
  // installs whose .env only has the (misnamed) PRINCIPAL_EMAIL var:
  // treat that as the mailbox and let principal default to it.
  const mailboxEmail = (
    env.ENCLAWED_EXECUTIVE_ASSISTANT_MAILBOX_EMAIL ??
    env.ENCLAWED_EXECUTIVE_ASSISTANT_PRINCIPAL_EMAIL ??
    ""
  )
    .toLowerCase()
    .trim();
  if (!mailboxEmail) {
    throw new Error(
      "executive-assistant: ENCLAWED_EXECUTIVE_ASSISTANT_MAILBOX_EMAIL is not set (legacy " +
        "ENCLAWED_EXECUTIVE_ASSISTANT_PRINCIPAL_EMAIL also missing). See enclawed-apps/executive-assistant/README.md.",
    );
  }
  // Prefer the explicit option passed via opts (launcher → main → runApp).
  // Falls back to the mailbox identity when neither is provided (the
  // self-admin install case where principal == mailbox).
  const principalEmail = (opts.principalEmailFromEnv ?? mailboxEmail).toLowerCase().trim();
  const appPassword = readRequiredEnv(env, "ENCLAWED_IMAP_APP_PASSWORD");
  const ollamaModel =
    env.ENCLAWED_EXECUTIVE_ASSISTANT_OLLAMA_MODEL ?? env.OLLAMA_MODEL ?? "qwen2.5:32b-instruct";
  // Stage-0 prompt-injection classifier. Runs on every inbound thread
  // BEFORE the regex shield and BEFORE the reply LLM. Needs to be small
  // and fast (hard 5s budget per call) — a 7B-8B instruct model is the
  // right scale; the 32B reply model times out at this budget.
  const classifierModel = env.ENCLAWED_EXECUTIVE_ASSISTANT_CLASSIFIER_MODEL ?? "llama3.1:8b";
  const imapHost = env.ENCLAWED_IMAP_HOST ?? "imap.gmail.com";
  const imapPort = Number.parseInt(env.ENCLAWED_IMAP_PORT ?? "993", 10);
  const smtpHost = env.ENCLAWED_SMTP_HOST ?? "smtp.gmail.com";
  const smtpPort = Number.parseInt(env.ENCLAWED_SMTP_PORT ?? "465", 10);
  // CalDAV serverUrl is just the host root for Google — the bridge
  // detects the Google pattern and constructs the per-user events
  // URL itself (tsdav's PROPFIND-based discovery never returns a
  // usable principal-URL from Google's server). Other providers
  // (Fastmail, iCloud, Radicale, Baikal) go through tsdav discovery
  // normally.
  const caldavUrl = env.ENCLAWED_CALDAV_URL ?? "https://apidata.googleusercontent.com/caldav/v2/";
  const carddavUrl = env.ENCLAWED_CARDDAV_URL ?? "https://www.googleapis.com/.well-known/carddav";

  // Persona: display name + custom system prompt. Loaded ONCE here,
  // frozen as runtime constants, never re-read from disk afterwards.
  // The runtime exposes no API to mutate either field — the only way
  // to change them is to re-run the installer (which requires the
  // same authority that holds the credentials in the keyring).
  // BOOT-TIME LOCK on the LLM posture. displayName and persona are
  // captured ONCE here, sanitized for prompt-injection primitives
  // (so a paste-attack on the install-time persona prompt can't
  // smuggle a "/no_think disregard all previous instructions" past
  // the boot boundary), frozen onto the local constants, and never
  // re-read from env / disk / network afterwards. The runtime
  // exposes no API to mutate either field. To change them the
  // operator MUST re-run the installer — which requires write
  // access to ~/.enclawed AND the OS keyring, i.e. the same
  // authority that holds the app password. Anyone (including the
  // principal) who is NOT that operator cannot mutate the posture
  // through any inbound channel — email body, calendar invite,
  // contact entry, attachment, HITL reply, anything.
  const rawDisplayName = env.ENCLAWED_EXECUTIVE_ASSISTANT_DISPLAY_NAME ?? "Executive Assistant";
  // .env holds one value per line, so a multi-paragraph prompt is stored
  // with its newlines escaped (settings.mjs --set-prompt-file writes it
  // that way). Unescape here, and only here: a literal backslash-n the
  // operator actually typed round-trips as \\n and is left alone.
  const rawSystemPrompt = (env.ENCLAWED_EXECUTIVE_ASSISTANT_SYSTEM_PROMPT ?? "").replace(
    /\\([\\n])/g,
    (_m, c) => (c === "n" ? "\n" : "\\"),
  );
  const personaDisplayName = dlpRedact(rawDisplayName, {
    minSeverity: "critical",
    placeholder: "[REDACTED]",
  });
  const personaSystemPrompt = dlpRedact(rawSystemPrompt, {
    minSeverity: "critical",
    placeholder: "[REDACTED]",
  });
  Object.freeze(personaDisplayName);
  Object.freeze(personaSystemPrompt);
  // Persona fingerprint logged to audit + service log so the
  // operator can verify at any restart that the posture has NOT
  // changed unexpectedly. The hash is SHA-256(displayName || "|" ||
  // systemPrompt) — collision-resistant and easy to eyeball-compare
  // against the previous boot's value.
  const personaFingerprint = createHash("sha256")
    .update(personaDisplayName)
    .update("|")
    .update(personaSystemPrompt)
    .digest("hex")
    .slice(0, 16);

  // The app's egress allowlist is intentionally narrow. After PR6's
  // migration off Google OAuth this is the set of IETF-protocol
  // endpoints the three bundled bridges talk to, plus loopback for
  // Ollama. Everything else is denied. The bootstrap is responsible
  // for freezing this in enclaved mode.
  const allowedHosts = new Set<string>([
    imapHost,
    smtpHost,
    extractHost(caldavUrl) ?? "apidata.googleusercontent.com",
    extractHost(carddavUrl) ?? "www.googleapis.com",
    // mcp-caldav bridges Google through the legacy
    // www.google.com/calendar/dav/ endpoint (the modern
    // googleusercontent.com URL requires OAuth and refuses
    // app-password auth). Allow both hosts unconditionally so the
    // egress guard does not block whichever path the bridge picks.
    "www.google.com",
    "127.0.0.1",
    "::1",
    "localhost",
  ]);
  // If Ollama lives elsewhere, allow its host too.
  const ollamaHost = env.OLLAMA_HOST ?? env.ENCLAWED_OLLAMA_API_BASE ?? "";
  if (ollamaHost) {
    const h = extractHost(ollamaHost);
    if (h) {
      allowedHosts.add(h);
    }
  }
  // Web search endpoints. Both Brave and DuckDuckGo are allowed; the
  // backend WebSearchTool picks Brave when BRAVE_SEARCH_API_KEY is set
  // and falls back to DuckDuckGo (no key, no signup) otherwise. The
  // tool itself is always wired so the executive assistant can answer "look this
  // up" requests on a fresh install without a developer-grade
  // configuration step.
  const braveSearchApiKey = env.BRAVE_SEARCH_API_KEY ?? "";
  for (const h of WEB_SEARCH_EGRESS_HOSTS) {
    allowedHosts.add(h);
  }
  // r.jina.ai is the URL-reader the read_url tool routes through.
  // Single reverse-proxy host means the LLM can deep-read arbitrary
  // web pages without the egress profile ever needing to widen to
  // "the whole internet".
  allowedHosts.add(READ_URL_EGRESS_HOST);
  // wttr.in — direct weather backend the get_weather tool routes
  // through. Free, no key, returns the actual temperature numbers
  // so the LLM does not have to extract them from SPA-rendered
  // weather.com / accuweather.com pages and then hedge.
  allowedHosts.add(WEATHER_EGRESS_HOST);

  const policy = createPolicy({
    enforceAllowlists: true,
    allowedChannels: new Set(["loopback"]),
    allowedProviders: new Set(["ollama-local"]),
    // Tool surface enforced at the MCP registry, not here. We keep this
    // empty so the framework's policy.checkTool() doesn't double-gate
    // (the closed list lives in the bridge registration below).
    allowedTools: new Set<string>(),
    allowedHosts,
    maxOutputClearance: makeLabel({ level: 1 }), // INTERNAL
    defaultDataLabel: makeLabel({ level: 1 }), // INTERNAL
  });

  // Set ENCLAWED_FLAVOR before bootstrap so anything reading from env
  // sees the chosen value (the CLI already does this, but be defensive).
  process.env.ENCLAWED_FLAVOR = flavor;

  // Resolve the audit-log path NOW so the EOD scheduler can re-read it
  // for the RT-11 cross-projection (the AuditLogger doesn't expose its
  // filePath publicly). The path resolution mirrors what bootstrap
  // does internally: --audit-path > ENCLAWED_AUDIT_PATH > app default.
  const auditPath =
    opts.auditPath ??
    env.ENCLAWED_AUDIT_PATH ??
    resolvePath(homedir(), ".enclawed", "enclawed-apps", "executive-assistant", "audit.jsonl");

  let auditLogger;
  try {
    const runtime = await bootstrapEnclawed({
      flavor,
      policy,
      auditPath,
      // Demos register their plugins programmatically; the module
      // preloader is only useful for on-disk extensions/.
      preloadModules: false,
    });
    auditLogger = runtime.audit;
  } catch (err) {
    process.stderr.write(
      `${logTimestamp()} executive-assistant: bootstrap failed: ${(err as Error).message}\n`,
    );
    return 2;
  }

  // bootstrapEnclawed installs the fetch egress guard, which only sees
  // WHATWG fetch(). The mail / calendar / contacts bridges and the email
  // HITL channel reach the network over RAW TLS sockets (imapflow,
  // nodemailer, tsdav) — invisible to the fetch guard. Patch
  // Socket.prototype.connect too so those connections are pinned to the
  // same narrow allowlist instead of being able to reach any host. Frozen
  // in the enclaved flavor (matches the fetch guard) so module code cannot
  // reassign connect to slip the boundary. Denials are appended to the
  // hash-chained audit log under the same egress.deny type the fetch guard
  // uses. Loopback (Ollama) and every bridge host are already in
  // allowedHosts, so no legitimate connection is affected.
  installRawSocketGuard({
    allowedHosts,
    freeze: flavor === "enclaved",
    onDeny: ({ host, port, kind }) => {
      auditLogger
        .append({
          type: "egress.deny",
          actor: "process",
          level: null,
          payload: { host, port, kind, transport: "raw-socket" },
        })
        .catch(() => {});
    },
  });

  // Load the three protocol-level bridges that replaced the Google
  // OAuth surface. Each bridge declares its own narrow allowedTools
  // (defence-in-depth against escalation via a typo in the override
  // list). Endpoints are synthetic mcp+<scheme>:// URIs used purely
  // as registry keys; the bridges hold the real network targets
  // internally.
  let mailBridge;
  let calendarBridge;
  let contactsBridge;
  try {
    mailBridge = loadImapSmtpBridge({
      imap: { host: imapHost, port: imapPort, secure: true },
      smtp: { host: smtpHost, port: smtpPort, secure: true },
      username: mailboxEmail,
      password: appPassword,
      // Embed the persona display name in the From: header on every
      // outgoing draft. Frozen at construction; the bridge does not
      // expose a setter for this field.
      fromDisplayName: personaDisplayName,
      requiredClearance: "internal",
      allowedToolsOverride: SECRETARY_MAIL_TOOLS,
    });
    calendarBridge = loadCalDavBridge({
      serverUrl: caldavUrl,
      username: mailboxEmail,
      password: appPassword,
      requiredClearance: "internal",
      allowedToolsOverride: SECRETARY_CALENDAR_TOOLS,
    });
    contactsBridge = loadCardDavBridge({
      serverUrl: carddavUrl,
      username: mailboxEmail,
      password: appPassword,
      requiredClearance: "internal",
      allowedToolsOverride: SECRETARY_CONTACTS_TOOLS,
    });
  } catch (err) {
    process.stderr.write(
      `${logTimestamp()} executive-assistant: ${(err as Error).message}\n` +
        `${logTimestamp()} executive-assistant: ensure ENCLAWED_IMAP_APP_PASSWORD is reachable from the launcher\n` +
        `${logTimestamp()} executive-assistant: (the OS keyring entry is provisioned by enclawed-apps/install.mjs).\n`,
    );
    return 3;
  }
  const protocolEndpoints = Object.freeze({
    mail: mailBridge.registered.endpoint,
    calendar: calendarBridge.registered.endpoint,
    contacts: contactsBridge.registered.endpoint,
  });

  // Bicriterion broker. Pick the keypress channel based on --hitl-channel
  // (or the auto-detect heuristic when "auto"):
  //   - stdin : in-terminal keypress (operator runs the app interactively)
  //   - dialog: platform-native modal (Task Scheduler / launchd / systemd
  //             without an attached TTY — but with a logged-in GUI session)
  //   - email : send a HITL request email to the principal and wait for
  //             a YES/NO reply (away-from-keyboard / mobile use case)
  //
  // The auto heuristic prefers stdin when a TTY is attached, otherwise
  // dialog. To use email, pass --hitl-channel=email explicitly — that's
  // the deliberate "I want to drive this from my phone over IMAP" path.
  // Optional alias list: addresses the operator also considers
  // principal-equivalent (e.g. they send the executive assistant instructions
  // from a personal company address even though the registered
  // principal is the corporate one). Comma-separated env var,
  // normalized to lowercase; each entry joins the principal-self set
  // so the daily-loop's principal-bypass, the broker's principal-
  // authored carve-out, AND the email-HITL reply matcher all fire for
  // any of them. Parsed BEFORE buildEmailHitlPrompt so the HITL prompt
  // can be told which From: addresses to accept on the reply.
  const principalAliases = (env.ENCLAWED_EXECUTIVE_ASSISTANT_PRINCIPAL_ALIASES ?? "")
    .split(",")
    .map((s) => s.toLowerCase().trim())
    .filter((s) => s.length > 0);
  const principalSelfAddresses = new Set(
    [mailboxEmail, principalEmail, ...principalAliases].filter((a) => a.length > 0),
  );

  let prompt: (req: BrokerRequest) => Promise<BrokerDecision>;
  const effectiveChannel: Exclude<HitlChannel, "auto"> =
    hitlChannel === "auto" ? (process.stdin.isTTY ? "stdin" : "dialog") : hitlChannel;
  if (effectiveChannel === "stdin") {
    prompt = buildStdinKeypressPrompt({});
  } else if (effectiveChannel === "dialog") {
    prompt = buildDialogPrompt();
  } else {
    prompt = buildEmailHitlPrompt({
      imap: { host: imapHost, port: imapPort, secure: true },
      smtp: { host: smtpHost, port: smtpPort, secure: true },
      // The bridge logs in as the mailbox identity and sends FROM that
      // address; the HITL email is addressed TO the principal and the
      // broker matches incoming replies against the principal.
      principalEmail: mailboxEmail,
      replyFromAddress: principalEmail,
      // Same alias set that feeds the broker carve-out, so a reply
      // sent from a registered alias instead of the principal address
      // is still accepted instead of silently rejected and re-fetched
      // every poll.
      acceptedReplyFromAddresses: new Set(
        [principalEmail, ...principalAliases].map((s) => s.toLowerCase().trim()),
      ),
      password: appPassword,
      fromDisplayName: personaDisplayName,
      timeoutMs: hitlEmailTimeoutMs,
      // Record the HITL channel's lifecycle in the hash-chained audit log.
      // The channel can't be broker-gated (it IS the broker's question),
      // but its sends and mailbox mutations still belong in the trail.
      audit: auditLogger,
    });
  }

  const broker = buildSecretaryBroker({
    hitl,
    prompt,
    // principalSelfAddresses distinguishes the identities the executive assistant
    // treats as "the operator themselves":
    //   - mailboxEmail = the SERVICE ACCOUNT (IMAP/SMTP credentials,
    //     where the executive assistant signs in). Always in this set so the
    //     existing self-loop prevention (EOD self-send, etc.) still
    //     works.
    //   - principalEmail = the REAL HUMAN PRINCIPAL the installer
    //     captured.
    //   - principalAliases = ENCLAWED_EXECUTIVE_ASSISTANT_PRINCIPAL_ALIASES,
    //     additional addresses the operator declared at install or
    //     in .env. Use case: the operator sometimes emails from a
    //     personal company address (alfredo@metereconsulting.com)
    //     even though their registered principal is the corporate
    //     one (alfredo@enclawed.com). Without aliases the
    //     principal-authored carve-out misses those emails and the
    //     update / delete falls into HITL-keypress.
    principalSelfAddresses,
    // Keypress timeout MUST match the email-HITL timeout when the
    // email channel is the active prompt. Otherwise the outer broker
    // timeout (default 5 min) fires before the email-HITL polling
    // loop's 30 min deadline, and the executive assistant denies the action
    // while the email-HITL loop keeps running in the background —
    // operator sees a "5min reminder" land AFTER the keypress timed
    // out, which is a clear sign of two timeouts that disagree.
    keypressTimeoutMs: effectiveChannel === "email" ? hitlEmailTimeoutMs : undefined,
  });

  // SkillGate wired against the framework audit logger and the broker.
  const gate = new SkillGate({ audit: auditLogger, broker });

  // Synthesize the executive assistant manifest in-process. caps=[FS_READ,
  // FS_WRITE_REV, SPAWN_PROC] are the "declared safe" set; publish is
  // intentionally OUTSIDE M.caps so every send_draft walks the broker (and
  // so the bicriterion routing fires precisely on the F5-risky calls).
  // SPAWN_PROC covers the periodic self-update check's read-only git
  // plumbing (fetch / rev-parse / rev-list); declaring it keeps that
  // unattended 12h tick AUDITED without forcing an HITL keypress on every
  // run, while a non-declared spawn would still walk the broker.
  const manifest = buildSecretarySkillManifest();
  gate.loadSkill(manifest);

  const client = new QClearedMcpClient({
    requiredClearance: "internal",
    // The bridge registration already gates each endpoint; the per-URL
    // clearance preflight is therefore skipped for these endpoints.
    skipClearancePreflight: true,
  });
  const tools = new GoogleTools({ gate, client, endpoints: protocolEndpoints });
  // web_search is always available. WebSearchTool routes to Brave when
  // the operator configured BRAVE_SEARCH_API_KEY (better snippets,
  // structured JSON), otherwise to DuckDuckGo (no key needed).
  const webSearch = new WebSearchTool({ gate, apiKey: braveSearchApiKey });
  const readUrl = new ReadUrlTool({ gate });
  const weather = new WeatherTool({ gate });
  const ollama = new OllamaClient();
  const state = new SecretaryRuntimeState();

  // Sanity-ping Ollama. We don't fail the run on ping failure (Ollama
  // could be coming up); the daily loop will surface chat errors when
  // they happen.
  const ping = await ollama.ping(3_000);
  if (!ping.ok) {
    process.stderr.write(
      `${logTimestamp()} executive-assistant: WARNING Ollama not reachable at ${ollama.apiBase()} (${ping.reason}). ` +
        `The loop will still start; install/start Ollama before contacts are processed.\n`,
    );
  } else {
    process.stdout.write(
      `${logTimestamp()} executive-assistant: Ollama ${ping.version ?? "?"} reachable at ${ollama.apiBase()}\n`,
    );
  }

  // Concurrent loops controlled by a single AbortController.
  const ctrl = new AbortController();
  let exitCode = 0;
  let shuttingDown = false;
  const shutdown = (reason: string) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    process.stderr.write(`${logTimestamp()} executive-assistant: shutting down (${reason})\n`);
    // Close the hardware-accredited session deliberately. Without this
    // the session stays flagged open and the NEXT boot without the
    // enclaweder refuses to start, treating an ordinary stop as an
    // interrupted accredited session.
    try {
      closeHardwareRootSession();
    } catch {
      /* best-effort: never block shutdown on bookkeeping */
    }
    ctrl.abort();
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  if (maxRuntimeSec > 0) {
    setTimeout(() => shutdown(`--max-runtime-sec=${maxRuntimeSec}`), maxRuntimeSec * 1000).unref();
  }

  process.stdout.write(
    `${logTimestamp()} executive-assistant: started\n` +
      `  flavor:        ${flavor}\n` +
      `  HITL mode:     ${hitl}\n` +
      `  HITL channel:  ${effectiveChannel}${effectiveChannel === "email" ? ` (timeout ${Math.floor(hitlEmailTimeoutMs / 60_000)}min, to=${principalEmail})` : ""}\n` +
      `  mailbox:       ${mailboxEmail}\n` +
      `  principal:     ${principalEmail}${principalEmail === mailboxEmail ? " (self-admin)" : ""}\n` +
      `  time zone:     ${env.TZ ?? "(system default)"}\n` +
      `  ollama model:  ${ollamaModel}\n` +
      `  classifier:    ${classifierModel}\n` +
      `  inbox poll:    ${inboxPollMs}ms\n` +
      `  quiet hours:   ${quietHours ? `${quietHours.startHHMM}–${quietHours.endHHMM} (local)` : "off"}\n` +
      `  draft mode:    ${draftMode}${draftMode === "review" && effectiveChannel !== "email" ? " (warning: not effective without --hitl-channel=email)" : ""}\n` +
      `  persona:       "${personaDisplayName}" (fingerprint ${personaFingerprint}) [LOCKED]\n` +
      `  EOD summary:   ${eodSummaryAt}\n` +
      `  EOD trash:     ${eodTrashAt}\n` +
      `  host:          ${hostname()}\n`,
  );

  // Hard warning when the operator chose email HITL but didn't set a
  // non-default principal. The HITL request will be addressed to the
  // mailbox itself — a self-send loop the operator will never see in
  // their personal inbox. Most operators in this configuration intend
  // to set their personal address; the install just lost the keyring
  // entry on an earlier re-install (the principal-reuse prompt added
  // in 0a3df212 fixes that going forward; warning here covers the
  // already-broken installs).
  if (effectiveChannel === "email" && principalEmail === mailboxEmail) {
    process.stderr.write(
      `${logTimestamp()} [executive-assistant warn] HITL channel is "email" but principal == mailbox ` +
        `(self-admin install). HITL emails will land in the mailbox ${mailboxEmail}, ` +
        `NOT in any personal inbox. Re-run the installer and type your personal ` +
        `address at the "Principal (administrator) email" prompt to fix.\n`,
    );
  }

  try {
    await Promise.all([
      runDailyLoop({
        tools,
        gate,
        ollama,
        state,
        ollamaModel,
        classifierModel,
        // The runtime's own logger, not a new one: the audit log is
        // hash-chained and a second writer would fork the chain.
        // auditLogger is the hoisted alias for runtime.audit -- `runtime`
        // itself is const-scoped to the bootstrap try block and is not
        // in scope here, which is why referencing it crashed the loop.
        audit: auditLogger,
        nonContactPolicy,
        ...(visionModel ? { visionModel } : {}),
        // The daily-loop's self-loop prevention compares thread sender
        // to the mailbox identity (the address the executive assistant signs in
        // to). Pass the mailbox here, not the principal.
        principalEmail: mailboxEmail,
        // Same set the broker uses for the principal-authored auto-
        // approve carve-out. When the operator emails the executive assistant
        // from their own principal address, the daily-loop bypasses
        // the CardDAV contact check and routes straight to the tool-
        // use loop — otherwise the executive assistant refuses every "schedule
        // X for me" email the operator sends to their own bot.
        principalSelfAddresses: new Set([mailboxEmail, principalEmail].filter((a) => a.length > 0)),
        personaDisplayName,
        personaSystemPrompt,
        allowedHosts,
        webSearch,
        readUrl,
        weather,
        followups,
        draftMode,
        // Daily-loop calls reviewPrompt directly when draftMode=review.
        // The same prompt function the broker uses for keypress also
        // works here — it just gets a synthesized BrokerRequest with
        // target=`mail:draft-review/...`. For non-email channels the
        // daily-loop logs a warn and treats every draft as auto.
        reviewPrompt: effectiveChannel === "email" ? prompt : null,
        pollMs: inboxPollMs,
        ...(idlePollMs !== undefined ? { idlePollMs } : {}),
        updateCheckIntervalMs,
        // Pass the configured TZ (TZ env var) through so the
        // mcp-caldav bridge can emit DTSTART;TZID=... on recurring
        // events. If unset, the bridge falls back to UTC encoding,
        // which is correct for one-off events but causes recurring
        // events to land on a shifted weekday after the first
        // occurrence when the local time straddles the UTC day
        // boundary. Undefined here is fine — the dispatcher only
        // attaches the timezone when the event is recurring.
        userTimezone: env.TZ,
        quietHours,
        signal: ctrl.signal,
      }),
      runEodScheduler({
        tools,
        state,
        principalEmail: mailboxEmail,
        auditPath,
        summaryAt: eodSummaryAt,
        trashAt: eodTrashAt,
        signal: ctrl.signal,
      }),
    ]);
  } catch (err) {
    process.stderr.write(
      `${logTimestamp()} executive-assistant: loop crashed: ${(err as Error).message}\n`,
    );
    exitCode = 1;
  }

  // Final audit-chain verification — RT-11/F2 closure receipt.
  try {
    const verify = await verifyChain(auditPath);
    if (verify.ok) {
      process.stdout.write(
        `${logTimestamp()} executive-assistant: audit chain OK (${verify.count} record(s))\n`,
      );
    } else {
      process.stderr.write(
        `${logTimestamp()} executive-assistant: AUDIT CHAIN BROKEN at record ${verify.brokenAt}: ${verify.reason}\n`,
      );
      exitCode = exitCode === 0 ? 4 : exitCode;
    }
  } catch (err) {
    process.stderr.write(
      `${logTimestamp()} executive-assistant: chain verify error: ${(err as Error).message}\n`,
    );
    exitCode = exitCode === 0 ? 4 : exitCode;
  }

  return exitCode;
}

function buildSecretarySkillManifest(): SkillManifest {
  // Hand-built; not signed (loadSkill doesn't enforce sig — the loader
  // does, but we're not going through the disk-loader path here). The
  // signature path is exercised explicitly in the redteam (RT-9).
  const caps: CapabilityToken[] = [
    CAPABILITY.FS_READ,
    CAPABILITY.FS_WRITE_REV,
    CAPABILITY.SPAWN_PROC,
  ];
  return Object.freeze({
    v: 1 as const,
    id: EXECUTIVE_ASSISTANT_SKILL_ID,
    label: makeLabel({ level: 1 }), // INTERNAL
    caps: Object.freeze(caps),
    signer: "enclawed-app-self",
    version: 1,
    verification: VERIFICATION.TESTED,
  });
}

function readRequiredEnv(env: NodeJS.ProcessEnv, name: string): string {
  const v = env[name];
  if (!v || v.length === 0) {
    throw new Error(
      `executive-assistant: ${name} is not set. ` +
        `See enclawed-apps/executive-assistant/README.md for the required env variables.`,
    );
  }
  return v;
}

function extractHost(input: string): string | null {
  if (input.startsWith("http://") || input.startsWith("https://")) {
    try {
      return new URL(input).hostname;
    } catch {
      return null;
    }
  }
  const m = input.match(/^([^:/]+)(?::\d+)?$/);
  return m?.[1] ?? null;
}
