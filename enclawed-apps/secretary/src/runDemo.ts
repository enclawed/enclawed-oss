// Orchestrator for `enclawed demo run secretary`.
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
} from "enclawed/framework";
import {
  buildSecretaryBroker,
  buildStdinKeypressPrompt,
  type HitlMode,
} from "./policy/bicriterion-broker.js";
import { SecretaryRuntimeState } from "./runtime-state.js";
import { runDailyLoop } from "./scheduler/daily-loop.js";
import { runEodScheduler } from "./scheduler/eod-trigger.js";
import { GoogleTools } from "./tools/google-tools.js";
import { OllamaClient } from "./tools/ollama-client.js";

export type DemoRunOptions = Readonly<{
  flavor?: "enclaved" | "open";
  hitl?: HitlMode;
  eodSummaryAt?: string;
  eodTrashAt?: string;
  inboxPollMs?: number;
  maxRuntimeSec?: number;
  auditPath?: string;
}>;

// Hard-coded narrow tool list. These are the only tool names the
// demo will ever invoke; anything else (delete_message, delete_event,
// etc.) is denied at the bridge admission gate before any network
// call. Each bridge declares the same list via its own narrowing
// allowedToolsOverride below, defence-in-depth.
const SECRETARY_MAIL_TOOLS = Object.freeze([
  "search_threads",
  "get_thread",
  "create_draft",
  "send_draft",
  "modify_thread_labels",
]);
const SECRETARY_CALENDAR_TOOLS = Object.freeze(["list_events", "get_event"]);
const SECRETARY_CONTACTS_TOOLS = Object.freeze(["search_contacts", "list_contacts"]);

const SECRETARY_SKILL_ID = "enclawed-app-secretary";

export async function runDemo(opts: DemoRunOptions = {}): Promise<number> {
  const env = process.env;
  const flavor: "enclaved" | "open" = opts.flavor ?? "enclaved";
  const hitl: HitlMode = opts.hitl ?? "bicriterion";
  const inboxPollMs = opts.inboxPollMs ?? 60_000;
  const maxRuntimeSec = opts.maxRuntimeSec ?? 0;
  const eodSummaryAt = opts.eodSummaryAt ?? "23:55";
  const eodTrashAt = opts.eodTrashAt ?? "23:59";

  const principalEmail = readRequiredEnv(env, "ENCLAWED_SECRETARY_PRINCIPAL_EMAIL");
  const appPassword = readRequiredEnv(env, "ENCLAWED_IMAP_APP_PASSWORD");
  const ollamaModel =
    env.ENCLAWED_SECRETARY_OLLAMA_MODEL ?? env.OLLAMA_MODEL ?? "qwen2.5:7b-instruct";
  const imapHost = env.ENCLAWED_IMAP_HOST ?? "imap.gmail.com";
  const imapPort = Number.parseInt(env.ENCLAWED_IMAP_PORT ?? "993", 10);
  const smtpHost = env.ENCLAWED_SMTP_HOST ?? "smtp.gmail.com";
  const smtpPort = Number.parseInt(env.ENCLAWED_SMTP_PORT ?? "465", 10);
  const caldavUrl = env.ENCLAWED_CALDAV_URL ?? "https://apidata.googleusercontent.com/caldav/v2/";
  const carddavUrl = env.ENCLAWED_CARDDAV_URL ?? "https://www.googleapis.com/";

  // The demo's egress allowlist is intentionally narrow. After PR6's
  // migration off Google OAuth this is the set of IETF-protocol
  // endpoints the three bundled bridges talk to, plus loopback for
  // Ollama. Everything else is denied. The bootstrap is responsible
  // for freezing this in enclaved mode.
  const allowedHosts = new Set<string>([
    imapHost,
    smtpHost,
    extractHost(caldavUrl) ?? "apidata.googleusercontent.com",
    extractHost(carddavUrl) ?? "www.googleapis.com",
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
  // does internally: --audit-path > ENCLAWED_AUDIT_PATH > demo default.
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
    process.stderr.write(`secretary: bootstrap failed: ${(err as Error).message}\n`);
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
      username: principalEmail,
      password: appPassword,
      requiredClearance: "internal",
      allowedToolsOverride: SECRETARY_MAIL_TOOLS,
    });
    calendarBridge = loadCalDavBridge({
      serverUrl: caldavUrl,
      username: principalEmail,
      password: appPassword,
      requiredClearance: "internal",
      allowedToolsOverride: SECRETARY_CALENDAR_TOOLS,
    });
    contactsBridge = loadCardDavBridge({
      serverUrl: carddavUrl,
      username: principalEmail,
      password: appPassword,
      requiredClearance: "internal",
      allowedToolsOverride: SECRETARY_CONTACTS_TOOLS,
    });
  } catch (err) {
    process.stderr.write(
      `secretary: ${(err as Error).message}\n` +
        `secretary: ensure ENCLAWED_IMAP_APP_PASSWORD is reachable from the launcher\n` +
        `secretary: (the OS keyring entry is provisioned by enclawed-apps/install.mjs).\n`,
    );
    return 3;
  }
  const protocolEndpoints = Object.freeze({
    mail: mailBridge.registered.endpoint,
    calendar: calendarBridge.registered.endpoint,
    contacts: contactsBridge.registered.endpoint,
  });

  // Bicriterion broker. The stdin prompt is the ONLY path that can hand
  // back "approve" when a keypress is required.
  const prompt = buildStdinKeypressPrompt({});
  const broker = buildSecretaryBroker({
    hitl,
    prompt,
    principalSelfAddresses: new Set([principalEmail.toLowerCase()]),
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
      `secretary: WARNING Ollama not reachable at ${ollama.apiBase()} (${ping.reason}). ` +
        `The loop will still start; install/start Ollama before contacts are processed.\n`,
    );
  } else {
    process.stdout.write(
      `secretary: Ollama ${ping.version ?? "?"} reachable at ${ollama.apiBase()}\n`,
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
    process.stderr.write(`secretary: shutting down (${reason})\n`);
    ctrl.abort();
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  if (maxRuntimeSec > 0) {
    setTimeout(() => shutdown(`--max-runtime-sec=${maxRuntimeSec}`), maxRuntimeSec * 1000).unref();
  }

  process.stdout.write(
    `secretary: started\n` +
      `  flavor:        ${flavor}\n` +
      `  HITL mode:     ${hitl}\n` +
      `  principal:     ${principalEmail}\n` +
      `  ollama model:  ${ollamaModel}\n` +
      `  inbox poll:    ${inboxPollMs}ms\n` +
      `  EOD summary:   ${eodSummaryAt}\n` +
      `  EOD trash:     ${eodTrashAt}\n` +
      `  host:          ${hostname()}\n`,
  );

  try {
    await Promise.all([
      runDailyLoop({
        tools,
        ollama,
        state,
        ollamaModel,
        principalEmail,
        allowedHosts,
        pollMs: inboxPollMs,
        signal: ctrl.signal,
      }),
      runEodScheduler({
        tools,
        state,
        principalEmail,
        auditPath,
        summaryAt: eodSummaryAt,
        trashAt: eodTrashAt,
        signal: ctrl.signal,
      }),
    ]);
  } catch (err) {
    process.stderr.write(`secretary: loop crashed: ${(err as Error).message}\n`);
    exitCode = 1;
  }

  // Final audit-chain verification — RT-11/F2 closure receipt.
  try {
    const verify = await verifyChain(auditPath);
    if (verify.ok) {
      process.stdout.write(`secretary: audit chain OK (${verify.count} record(s))\n`);
    } else {
      process.stderr.write(
        `secretary: AUDIT CHAIN BROKEN at record ${verify.brokenAt}: ${verify.reason}\n`,
      );
      exitCode = exitCode === 0 ? 4 : exitCode;
    }
  } catch (err) {
    process.stderr.write(`secretary: chain verify error: ${(err as Error).message}\n`);
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
    signer: "enclawed-demo-self",
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
