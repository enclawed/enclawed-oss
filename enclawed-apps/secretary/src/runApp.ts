// Orchestrator for `enclawed-apps secretary`.
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
//      secretary skill manifest.
//   7. Build GoogleTools + OllamaClient; sanity-ping Ollama.
//   8. Start daily-loop and eod-scheduler concurrently; wait on the
//      AbortSignal that fires on SIGINT / SIGTERM / --max-runtime-sec.
//   9. On shutdown: stop loops, verify the audit chain, print a final
//      receipt, return exit code.

import { hostname, homedir } from "node:os";
import { resolve as resolvePath } from "node:path";
import {
  QClearedMcpClient,
  loadImapSmtpBridge,
  loadCalDavBridge,
  loadCardDavBridge,
  verifyChain,
  bootstrapEnclawed,
  makeLabel,
  createPolicy,
  CAPABILITY,
  type CapabilityToken,
  SkillGate,
  VERIFICATION,
  type SkillManifest,
  type BrokerRequest,
  type BrokerDecision,
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
import { runDailyLoop } from "./scheduler/daily-loop.js";
import { runEodScheduler } from "./scheduler/eod-trigger.js";
import { GoogleTools } from "./tools/google-tools.js";
import { OllamaClient } from "./tools/ollama-client.js";

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
   * the mailbox identity (where the secretary signs in). Populated by
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
]);
const SECRETARY_CALENDAR_TOOLS = Object.freeze([
  "list_events",
  "get_event",
  "create_event",
  "update_event",
  "delete_event",
]);
const SECRETARY_CONTACTS_TOOLS = Object.freeze(["search_contacts", "list_contacts"]);

const SECRETARY_SKILL_ID = "enclawed-app-secretary";

export async function runApp(opts: AppRunOptions = {}): Promise<number> {
  const env = process.env;
  const flavor: "enclaved" | "open" = opts.flavor ?? "enclaved";
  const hitl: HitlMode = opts.hitl ?? "bicriterion";
  const hitlChannel: HitlChannel = opts.hitlChannel ?? "auto";
  const hitlEmailTimeoutMs = opts.hitlEmailTimeoutMs ?? 30 * 60_000;
  const inboxPollMs = opts.inboxPollMs ?? 5_000;
  const maxRuntimeSec = opts.maxRuntimeSec ?? 0;
  const eodSummaryAt = opts.eodSummaryAt ?? "23:55";
  const eodTrashAt = opts.eodTrashAt ?? "23:59";

  // Two identities. The MAILBOX is the IMAP/SMTP login; the PRINCIPAL
  // is the human who administrates. Backwards compat for pre-rename
  // installs whose .env only has the (misnamed) PRINCIPAL_EMAIL var:
  // treat that as the mailbox and let principal default to it.
  const mailboxEmail = (
    env.ENCLAWED_SECRETARY_MAILBOX_EMAIL ??
    env.ENCLAWED_SECRETARY_PRINCIPAL_EMAIL ??
    ""
  )
    .toLowerCase()
    .trim();
  if (!mailboxEmail) {
    throw new Error(
      "secretary: ENCLAWED_SECRETARY_MAILBOX_EMAIL is not set (legacy " +
        "ENCLAWED_SECRETARY_PRINCIPAL_EMAIL also missing). See enclawed-apps/secretary/README.md.",
    );
  }
  // Prefer the explicit option passed via opts (launcher → main → runApp).
  // Falls back to the mailbox identity when neither is provided (the
  // self-admin install case where principal == mailbox).
  const principalEmail = (opts.principalEmailFromEnv ?? mailboxEmail).toLowerCase().trim();
  const appPassword = readRequiredEnv(env, "ENCLAWED_IMAP_APP_PASSWORD");
  const ollamaModel =
    env.ENCLAWED_SECRETARY_OLLAMA_MODEL ?? env.OLLAMA_MODEL ?? "qwen2.5:32b-instruct";
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
  const personaDisplayName = env.ENCLAWED_SECRETARY_DISPLAY_NAME ?? "Secretary";
  const personaSystemPrompt = env.ENCLAWED_SECRETARY_SYSTEM_PROMPT ?? "";

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
    resolvePath(homedir(), ".enclawed", "enclawed-apps", "secretary", "audit.jsonl");

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
      `${logTimestamp()} secretary: bootstrap failed: ${(err as Error).message}\n`,
    );
    return 2;
  }

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
      `${logTimestamp()} secretary: ${(err as Error).message}\n` +
        `${logTimestamp()} secretary: ensure ENCLAWED_IMAP_APP_PASSWORD is reachable from the launcher\n` +
        `${logTimestamp()} secretary: (the OS keyring entry is provisioned by enclawed-apps/install.mjs).\n`,
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
      password: appPassword,
      fromDisplayName: personaDisplayName,
      timeoutMs: hitlEmailTimeoutMs,
    });
  }
  const broker = buildSecretaryBroker({
    hitl,
    prompt,
    // principalSelfAddresses distinguishes two identities:
    //   - mailboxEmail = the SERVICE ACCOUNT (IMAP/SMTP credentials,
    //     where the secretary signs in). Always in this set so the
    //     existing self-loop prevention (EOD self-send, etc.) still
    //     works.
    //   - principalEmail = the REAL HUMAN PRINCIPAL (the address the
    //     operator reads / replies HITL from). When distinct from
    //     mailbox, also in this set so writes addressed to the
    //     operator's personal identity get the same self-send
    //     auto-approve treatment as writes to the service account.
    principalSelfAddresses: new Set([mailboxEmail, principalEmail].filter((a) => a.length > 0)),
  });

  // SkillGate wired against the framework audit logger and the broker.
  const gate = new SkillGate({ audit: auditLogger, broker });

  // Synthesize the secretary manifest in-process. caps=[FS_READ,
  // FS_WRITE_REV] are the "declared safe" set; publish is intentionally
  // OUTSIDE M.caps so every send_draft walks the broker (and so the
  // bicriterion routing fires precisely on the F5-risky calls).
  const manifest = buildSecretarySkillManifest();
  gate.loadSkill(manifest);

  const client = new QClearedMcpClient({
    requiredClearance: "internal",
    // The bridge registration already gates each endpoint; the per-URL
    // clearance preflight is therefore skipped for these endpoints.
    skipClearancePreflight: true,
  });
  const tools = new GoogleTools({ gate, client, endpoints: protocolEndpoints });
  const ollama = new OllamaClient();
  const state = new SecretaryRuntimeState();

  // Sanity-ping Ollama. We don't fail the run on ping failure (Ollama
  // could be coming up); the daily loop will surface chat errors when
  // they happen.
  const ping = await ollama.ping(3_000);
  if (!ping.ok) {
    process.stderr.write(
      `${logTimestamp()} secretary: WARNING Ollama not reachable at ${ollama.apiBase()} (${ping.reason}). ` +
        `The loop will still start; install/start Ollama before contacts are processed.\n`,
    );
  } else {
    process.stdout.write(
      `${logTimestamp()} secretary: Ollama ${ping.version ?? "?"} reachable at ${ollama.apiBase()}\n`,
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
    process.stderr.write(`${logTimestamp()} secretary: shutting down (${reason})\n`);
    ctrl.abort();
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  if (maxRuntimeSec > 0) {
    setTimeout(() => shutdown(`--max-runtime-sec=${maxRuntimeSec}`), maxRuntimeSec * 1000).unref();
  }

  process.stdout.write(
    `${logTimestamp()} secretary: started\n` +
      `  flavor:        ${flavor}\n` +
      `  HITL mode:     ${hitl}\n` +
      `  HITL channel:  ${effectiveChannel}${effectiveChannel === "email" ? ` (timeout ${Math.floor(hitlEmailTimeoutMs / 60_000)}min, to=${principalEmail})` : ""}\n` +
      `  mailbox:       ${mailboxEmail}\n` +
      `  principal:     ${principalEmail}${principalEmail === mailboxEmail ? " (self-admin)" : ""}\n` +
      `  time zone:     ${env.TZ ?? "(system default)"}\n` +
      `  ollama model:  ${ollamaModel}\n` +
      `  inbox poll:    ${inboxPollMs}ms\n` +
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
      `${logTimestamp()} [secretary warn] HITL channel is "email" but principal == mailbox ` +
        `(self-admin install). HITL emails will land in the mailbox ${mailboxEmail}, ` +
        `NOT in any personal inbox. Re-run the installer and type your personal ` +
        `address at the "Principal (administrator) email" prompt to fix.\n`,
    );
  }

  try {
    await Promise.all([
      runDailyLoop({
        tools,
        ollama,
        state,
        ollamaModel,
        // The daily-loop's self-loop prevention compares thread sender
        // to the mailbox identity (the address the secretary signs in
        // to). Pass the mailbox here, not the principal.
        principalEmail: mailboxEmail,
        // Same set the broker uses for the principal-authored auto-
        // approve carve-out. When the operator emails the secretary
        // from their own principal address, the daily-loop bypasses
        // the CardDAV contact check and routes straight to the tool-
        // use loop — otherwise the secretary refuses every "schedule
        // X for me" email the operator sends to their own bot.
        principalSelfAddresses: new Set([mailboxEmail, principalEmail].filter((a) => a.length > 0)),
        personaDisplayName,
        personaSystemPrompt,
        allowedHosts,
        pollMs: inboxPollMs,
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
    process.stderr.write(`${logTimestamp()} secretary: loop crashed: ${(err as Error).message}\n`);
    exitCode = 1;
  }

  // Final audit-chain verification — RT-11/F2 closure receipt.
  try {
    const verify = await verifyChain(auditPath);
    if (verify.ok) {
      process.stdout.write(
        `${logTimestamp()} secretary: audit chain OK (${verify.count} record(s))\n`,
      );
    } else {
      process.stderr.write(
        `${logTimestamp()} secretary: AUDIT CHAIN BROKEN at record ${verify.brokenAt}: ${verify.reason}\n`,
      );
      exitCode = exitCode === 0 ? 4 : exitCode;
    }
  } catch (err) {
    process.stderr.write(
      `${logTimestamp()} secretary: chain verify error: ${(err as Error).message}\n`,
    );
    exitCode = exitCode === 0 ? 4 : exitCode;
  }

  return exitCode;
}

function buildSecretarySkillManifest(): SkillManifest {
  // Hand-built; not signed (loadSkill doesn't enforce sig — the loader
  // does, but we're not going through the disk-loader path here). The
  // signature path is exercised explicitly in the redteam (RT-9).
  const caps: CapabilityToken[] = [CAPABILITY.FS_READ, CAPABILITY.FS_WRITE_REV];
  return Object.freeze({
    v: 1 as const,
    id: SECRETARY_SKILL_ID,
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
      `secretary: ${name} is not set. ` +
        `See enclawed-apps/secretary/README.md for the required env variables.`,
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
