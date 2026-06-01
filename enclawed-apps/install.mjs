#!/usr/bin/env node
// Main installer for any app under enclawed-apps/<id>/.
//
// Reads enclawed-apps/<id>/app.config.json, dispatches to the provider module
// for credential acquisition (enclawed-apps/providers/<type>.mjs), installs
// Ollama and the requested model, writes ~/.enclawed/enclawed-apps/<id>/.env,
// then registers the app as a user-level background service.
//
// Adding a new app: create enclawed-apps/<id>/app.config.json with
// `provider.type` set to a value supported by enclawed-apps/providers/.  Add a
// new provider module there if your app needs a service we have not
// integrated yet.
//
// Usage:
//   node install.mjs <app-id>              install + start
//   node install.mjs <app-id> --uninstall  stop service, remove env + audit

import { execFileSync, execSync, spawn, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");

const argv = process.argv.slice(2);
const appId = argv.find((a) => !a.startsWith("--"));
const uninstall = argv.includes("--uninstall");
const stopOnly = argv.includes("--stop");
const startOnly = argv.includes("--start");
const statusOnly = argv.includes("--status");
const probeOnly = argv.includes("--probe");
const updateOnly = argv.includes("--update");
if (
  !appId ||
  [uninstall, stopOnly, startOnly, statusOnly, probeOnly, updateOnly].filter(Boolean).length > 1
) {
  console.error(
    "usage: install.mjs <app-id> [--start | --stop | --status | --probe | --update | --uninstall]",
  );
  process.exit(64);
}
const appDir = join(here, appId);
const configPath = join(appDir, "app.config.json");
if (!existsSync(configPath)) {
  console.error(`install: no app at ${appDir} (missing app.config.json)`);
  process.exit(64);
}
const config = JSON.parse(readFileSync(configPath, "utf8"));

const envDir = join(homedir(), ".enclawed", "enclawed-apps", config.id);
const envPath = join(envDir, ".env");
const launcherPath = join(envDir, "launcher.mjs");
const logPath = join(envDir, "service.log");
const serviceId = config.service?.id ?? `com.enclawed.${config.id}`;
const taskName = `Enclawed ${config.name}`;
const PRINCIPAL_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WHICH = platform() === "win32" ? "where" : "which";

function locateExecutable(name) {
  try {
    const out = execFileSync(WHICH, [name], { encoding: "utf8" });
    const all = out
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    if (all.length === 0) {
      return null;
    }
    if (platform() === "win32") {
      // Prefer Node-spawnable extensions. The bash shim (no extension)
      // that npm-global ships next to .cmd / .ps1 wrappers cannot be
      // exec'd directly under Windows because there's no shebang
      // support, so execFileSync("pnpm") would ENOENT or fail to spawn.
      const preferred = [".cmd", ".exe", ".bat"];
      for (const ext of preferred) {
        const hit = all.find((p) => p.toLowerCase().endsWith(ext));
        if (hit) {
          return hit;
        }
      }
    }
    return all[0];
  } catch {
    return null;
  }
}

// Validate an IANA time-zone name via Intl.DateTimeFormat. Returns
// true when the name parses, false otherwise. Cheap enough to call
// on every prompt attempt without caching.
function isValidIanaTimezone(name) {
  if (typeof name !== "string" || name.length === 0) {
    return false;
  }
  try {
    const fmt = new Intl.DateTimeFormat("en-US", { timeZone: name });
    return Boolean(fmt);
  } catch {
    return false;
  }
}

// Resolve the secretary's mailbox identity from an env-file dict,
// accepting both the new ENCLAWED_SECRETARY_MAILBOX_EMAIL and the
// legacy ENCLAWED_SECRETARY_PRINCIPAL_EMAIL (which, before the
// principal/mailbox split, held the mailbox value). Returns the
// resolved address or null.
function resolveMailboxFromEnv(env) {
  if (!env) {
    return null;
  }
  return (
    env["ENCLAWED_SECRETARY_MAILBOX_EMAIL"] ?? env["ENCLAWED_SECRETARY_PRINCIPAL_EMAIL"] ?? null
  );
}

function readExistingEnv(p) {
  if (!existsSync(p)) {
    return null;
  }
  const out = {};
  for (const raw of readFileSync(p, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const eq = line.indexOf("=");
    if (eq < 0) {
      continue;
    }
    let key = line.slice(0, eq).trim();
    if (key.startsWith("export ")) {
      key = key.slice(7).trim();
    }
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1).replace(/\\"/g, '"');
    }
    out[key] = val;
  }
  return out;
}

function header(s) {
  console.log(`\n\x1b[1m\x1b[34m==> ${s}\x1b[0m`);
}
function ok(s) {
  console.log(`  \x1b[32m✓\x1b[0m ${s}`);
}
function warn(s) {
  console.log(`  \x1b[33m!\x1b[0m ${s}`);
}
function fail(s) {
  console.error(`  \x1b[31mx\x1b[0m ${s}`);
}

if (uninstall) {
  await runUninstall();
  process.exit(0);
}
if (stopOnly) {
  await runStop();
  process.exit(0);
}
if (startOnly) {
  await runStart();
  process.exit(0);
}
if (statusOnly) {
  await runStatus();
  process.exit(0);
}
if (probeOnly) {
  await runProbe();
  process.exit(0);
}
if (updateOnly) {
  await runUpdate();
  process.exit(0);
}

const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => rl.question(q);
// Cross-terminal-reliable input. The previous raw-mode masking approach
// hung on Windows PowerShell because readline owns stdin and PSReadLine
// can intercept keypresses before they reach the data event. Cooked-mode
// readline is the only thing that works the same on macOS, Linux, and
// every Windows terminal we have tested. The trade-off is that the
// secret is briefly visible while the user types it.
const askSecret = (q) =>
  rl.question(`${q} (visible while you type — clear your terminal scrollback afterwards): `);

// Build a thin wrapper around enclawed-apps/<id>/bin/keyring.mjs so
// the rest of install.mjs can call get/set/delete without rebuilding
// the spawn-with-stdin pattern at every site. The secret is piped on
// stdin and consumed in get() via stdout — argv carries only the
// service+account names, never the secret itself, so neither shows
// up in `ps aux` or shell history.
function buildKeyring({ helperPath, service }) {
  const nodeExe = process.execPath;
  if (!existsSync(helperPath)) {
    throw new Error(`keyring helper missing: ${helperPath} (provider declared usesKeyring=true)`);
  }
  // Arrow functions on properties so callers can pass these as
  // bare references (`keyring?.get`) without losing `this` — these
  // methods don't use `this` anyway, but the typed-eslint
  // unbound-method rule flags method-shorthand at the call site.
  return {
    get: ({ account }) => {
      const r = spawnSync(
        nodeExe,
        [helperPath, "get", "--service", service, "--account", account],
        { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
      );
      if (r.status === 0) {
        return r.stdout;
      }
      if (r.status === 65) {
        return null;
      }
      throw new Error(`keyring get failed (exit ${r.status})`);
    },
    set: ({ account, secret }) => {
      const r = spawnSync(
        nodeExe,
        [helperPath, "set", "--service", service, "--account", account],
        { input: secret, encoding: "utf8", stdio: ["pipe", "inherit", "inherit"] },
      );
      if (r.status !== 0) {
        throw new Error(`keyring set failed (exit ${r.status})`);
      }
    },
    delete: ({ account }) => {
      const r = spawnSync(
        nodeExe,
        [helperPath, "delete", "--service", service, "--account", account],
        { encoding: "utf8", stdio: ["ignore", "inherit", "inherit"] },
      );
      // delete is best-effort; uninstall must not crash if the
      // entry never existed.
      return r.status === 0;
    },
  };
}

header(`Installing ${config.name}`);
if (config.docsUrl) {
  ok(`Full walkthrough at ${config.docsUrl}`);
}

// Idempotent re-run. Every downstream step is already a no-op when
// already done (pnpm install reuses the lockfile; ollama install
// short-circuits when present; the principal/credentials prompts
// reuse the existing .env + keyring entry; Register-ScheduledTask
// -Force / launchctl load / systemctl daemon-reload all replace
// in place). A re-run intentionally keeps the audit log so the
// hash chain stays unbroken across upgrades.
//
// To start completely fresh, run with `--uninstall` first; that's
// the explicit one-step wipe path.
if (existsSync(envDir)) {
  ok(`Found existing install at ${envDir}; continuing in idempotent mode.`);
}

// On Windows, .bat / .cmd files cannot be spawned directly: Node
// 18.20.2 / 20.12.2 / 21.7.3 and later refuse with EINVAL as the
// mitigation for CVE-2024-27980. cmd.exe must dispatch them. The
// previous approach (execFileSync(exe, args, { shell: true })) works
// but triggers DEP0190 on Node >= 22: passing args as an array with
// shell:true is deprecated because Node concatenates without escaping.
// runExe composes a single quoted command string explicitly and uses
// execSync, which never trips DEP0190 — quoting is our responsibility
// (and the inputs here are program-controlled paths + literal flags,
// never untrusted user input).
function quoteWinArg(a) {
  // Wrap in double quotes and double internal quotes per cmd.exe
  // parsing rules. Backslashes don't need escaping unless followed by
  // a quote; the inputs we pass (paths, version strings, model names)
  // never contain trailing backslashes inside a quoted region.
  return `"${String(a).replace(/"/g, '""')}"`;
}
function runExe(exe, args, opts = {}) {
  if (platform() === "win32") {
    const cmdline = [quoteWinArg(exe), ...args.map(quoteWinArg)].join(" ");
    return execSync(cmdline, { ...opts, shell: true });
  }
  return execFileSync(exe, args, opts);
}

// 1) Ensure pnpm + workspace install so `enclawed` resolves.
// Resolve absolute paths for pnpm (and Ollama, if used) once up front.
// On Windows, `where` may return the bash shim, the .cmd wrapper, and
// the .ps1 wrapper in PATH order; we always want the Node-spawnable
// .cmd / .exe form. locateExecutable handles that platform difference.
header("Linking the workspace");
const pnpmPath = locateExecutable("pnpm");
if (!pnpmPath) {
  fail("pnpm not found. Install with: corepack enable && corepack prepare pnpm@latest --activate");
  process.exit(2);
}
ok(`Found pnpm at ${pnpmPath}`);
runExe(pnpmPath, ["--version"], { stdio: "ignore" });
// --ignore-scripts: skip every package's postinstall. The repo's root
// declares 67 runtime deps that include native modules used by other
// bundled extensions (Discord, Matrix, sharp, llama-cpp). The secretary
// app doesn't load any of them, but their postinstall scripts try to
// native-compile and fail without Visual Studio Build Tools on Windows.
// The app runtime is pure JS / TS + node:crypto + fetch — no native
// dep ever loads, so skipping the build scripts is safe here.
runExe(pnpmPath, ["install", "--prefer-offline", "--ignore-scripts"], {
  cwd: repoRoot,
  stdio: "inherit",
});
ok("Workspace linked.");

// 2) Ollama (LLM type === "ollama" only; future: anthropic | openai | ...).
let ollamaPath = null;
if (config.llm?.type === "ollama") {
  header("Installing Ollama and pulling the model");
  await installOllama();
  await ensureOllamaServing();
  ollamaPath = locateExecutable("ollama");
  if (!ollamaPath) {
    fail(
      "ollama is installed but cannot be resolved on PATH. Restart your shell and re-run the installer.",
    );
    process.exit(2);
  }
  runExe(ollamaPath, ["pull", config.llm.model], { stdio: "inherit" });
  ok(`Model ${config.llm.model} ready.`);
  // Ollama auto-detects CUDA / ROCm / Metal but silently falls back to
  // CPU if drivers are stale, VRAM is too small for the model, or the
  // WSL2 NVIDIA bridge is missing. Probe with a single-token inference
  // so the model loads, then read `ollama ps` and report the processor
  // split. Best-effort: any failure here just skips the report.
  probeOllamaGpu(ollamaPath, config.llm.model);
}

// 3) Two distinct identities — the secretary's mailbox (where it
//    signs in over IMAP/SMTP) and the principal (the human who
//    administrates this install). They were conflated as a single
//    "principal" field in earlier versions; this caused HITL replies
//    to be silently dropped when the operator's reply identity
//    differed from the mailbox the secretary signed in to.
//
//    Naming after the rename:
//      mailbox   = service account / IMAP-SMTP credentials
//                  (env var: ENCLAWED_SECRETARY_MAILBOX_EMAIL)
//      principal = human administrator
//                  (env var: ENCLAWED_SECRETARY_PRINCIPAL_EMAIL —
//                   stored in the OS keyring, never in .env)
//
//    Backwards compat for re-installs: when the .env from a prior
//    install only has ENCLAWED_SECRETARY_PRINCIPAL_EMAIL (the old
//    misnamed mailbox), surface its value as the candidate for the
//    new "mailbox" prompt — operator confirms or replaces it.
const existingEnv = readExistingEnv(envPath);
const mailboxConfig = config.mailbox ?? config.principal;
const mailboxVar = mailboxConfig.envVar;
const existingMailbox =
  existingEnv?.[mailboxVar] ?? existingEnv?.["ENCLAWED_SECRETARY_PRINCIPAL_EMAIL"];

let mailbox;
header("Secretary mailbox");
console.log(`The address the secretary itself signs in to over IMAP/SMTP — its mailbox.`);
console.log(`This is NOT your personal address. Use a dedicated account if you can`);
console.log(`(e.g. yourname-secretary@gmail.com) so the secretary's traffic is`);
console.log(`isolated from your own mail.`);
if (existingMailbox && PRINCIPAL_EMAIL_RE.test(existingMailbox)) {
  const reuse = (await ask(`Reuse secretary mailbox ${existingMailbox}? [Y/n] `))
    .trim()
    .toLowerCase();
  mailbox = reuse === "n" || reuse === "no" ? "" : existingMailbox;
}
while (!mailbox) {
  const raw = (await ask(`Secretary mailbox email: `)).trim();
  if (PRINCIPAL_EMAIL_RE.test(raw)) {
    mailbox = raw;
    break;
  }
  fail(`"${raw}" is not a valid email address. Try again.`);
}

// principal = the human authorized to administrate this secretary.
// Used by the HITL email broker for matching incoming approvals.
// Stored in the OS keyring (encrypted at rest), never in .env.
const principalConfig = config.principal;
const principalVar = principalConfig?.envVar ?? "ENCLAWED_SECRETARY_PRINCIPAL_EMAIL";
let principal;
header("Principal");
console.log(`YOUR personal email address — the human authorized to administrate`);
console.log(`this secretary. The HITL approval emails will be sent here and the`);
console.log(`broker will only accept replies whose From: matches this address.`);

// Check the keyring for a previously-stored principal email. The
// keyring helper exists at appDir/bin/keyring.mjs and works without
// the buildKeyring wrapper which isn't built yet at this point. If a
// previous install captured a non-default principal, surface it so
// the operator doesn't accidentally lose it by pressing Enter at the
// prompt (which previously defaulted to the mailbox = self-admin
// install). This was the silent regression behind "calendar events
// not landing" after re-install: the principal vanished, the daily
// loop's principal-self bypass stopped firing for the operator's
// real address, and the tool-use loop never ran on inbound mail.
let existingPrincipalFromKeyring = "";
try {
  const helperPath = join(appDir, "bin", "keyring.mjs");
  if (existsSync(helperPath)) {
    const r = spawnSync(
      process.execPath,
      [
        helperPath,
        "get",
        "--service",
        `enclawed-${config.id}`,
        "--account",
        `principal-email:${mailbox}`,
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    if (r.status === 0) {
      existingPrincipalFromKeyring = (r.stdout ?? "").trim();
    }
  }
} catch {
  // Keyring read is best-effort; fall through to the prompt.
}

let promptDefault = mailbox;
if (
  existingPrincipalFromKeyring &&
  existingPrincipalFromKeyring !== mailbox.toLowerCase() &&
  PRINCIPAL_EMAIL_RE.test(existingPrincipalFromKeyring)
) {
  const reuse = (await ask(`Reuse principal ${existingPrincipalFromKeyring}? [Y/n] `))
    .trim()
    .toLowerCase();
  if (reuse !== "n" && reuse !== "no") {
    principal = existingPrincipalFromKeyring;
  } else {
    // Operator declined reuse; default the prompt to mailbox.
    promptDefault = mailbox;
  }
}
if (!principal) {
  console.log(`Defaults to the secretary mailbox itself (self-admin install).`);
}
while (!principal) {
  const raw = (await ask(`Principal (administrator) email [${promptDefault}]: `)).trim();
  const addr = raw.length > 0 ? raw : promptDefault;
  if (PRINCIPAL_EMAIL_RE.test(addr)) {
    principal = addr.toLowerCase();
    break;
  }
  fail(`"${addr}" is not a valid email address. Try again.`);
}

// 3a) Persona — display name + custom system prompt baked at install
//     time. Set once, frozen at service boot. The runtime never
//     re-reads these from disk after the daily-loop starts, so a
//     prompt-injection attempt buried in an inbound email body
//     cannot rewrite the secretary's identity at runtime — the only
//     way to change either field is to re-run the installer
//     (which requires write access to ~/.enclawed and the OS keyring,
//     i.e. the same surface that holds the credentials themselves).
header("Persona");
const personaConfig = config.persona ?? {};
const displayNameVar = personaConfig.displayNameEnvVar ?? "ENCLAWED_SECRETARY_DISPLAY_NAME";
const systemPromptVar = personaConfig.systemPromptEnvVar ?? "ENCLAWED_SECRETARY_SYSTEM_PROMPT";
const defaultDisplayName = personaConfig.defaultDisplayName ?? "Secretary";
const defaultSystemPrompt = personaConfig.defaultSystemPrompt ?? "";

const existingDisplay = existingEnv?.[displayNameVar];
const existingSystemPrompt = existingEnv?.[systemPromptVar];

let displayName = existingDisplay ?? "";
if (existingDisplay) {
  const reuse = (await ask(`Reuse display name "${existingDisplay}"? [Y/n] `)).trim().toLowerCase();
  if (reuse === "n" || reuse === "no") {
    displayName = "";
  }
}
while (!displayName) {
  const raw = (
    await ask(`What name should the secretary use in outgoing replies? [${defaultDisplayName}]: `)
  ).trim();
  displayName = raw.length > 0 ? raw : defaultDisplayName;
  if (displayName.length > 80) {
    fail(`Display name too long (max 80 chars). Try again.`);
    displayName = "";
  }
}

let systemPrompt = existingSystemPrompt ?? "";
if (existingSystemPrompt !== undefined && existingSystemPrompt.length > 0) {
  const reuse = (await ask(`Reuse existing custom system prompt? [Y/n] `)).trim().toLowerCase();
  if (reuse === "n" || reuse === "no") {
    systemPrompt = "";
  }
}
if (existingSystemPrompt === undefined) {
  console.log(`In ONE sentence, how should the secretary behave?`);
  console.log(
    `(Optional — press Enter for none. Example: "Cheerful, decisive, never apologetic.")`,
  );
  const raw = (await ask(`> `)).trim();
  systemPrompt = raw.length > 0 ? raw : defaultSystemPrompt;
}
if (systemPrompt.length > 1000) {
  fail(`System prompt is too long (max 1000 chars). Truncating.`);
  systemPrompt = systemPrompt.slice(0, 1000);
}
ok(`Persona locked at install time. To change either field later, re-run the installer.`);

// 3a-ii) Time zone — the IANA name (e.g. "America/New_York",
//        "Europe/Rome", "Asia/Tokyo") the secretary uses to interpret
//        relative dates in inbound mail ("Tuesday at 3pm" → 3pm in
//        which time zone). Persisted as the standard `TZ` env var so
//        Node's Date + chrono-node both pick it up automatically at
//        process start — no per-call timezone plumbing needed.
//        Default = the operating system's TZ as exposed via Intl
//        (e.g. Linux /etc/timezone, macOS systemsetup, Windows
//        registry → Node maps to IANA).
header("Time zone");
const tzVar = "TZ";
const existingTz = existingEnv?.[tzVar];
let systemTz = "UTC";
try {
  systemTz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
} catch {
  // Intl resolution shouldn't fail on Node 22+, but fall back to UTC if it does.
}
let timezone = "";
if (existingTz && isValidIanaTimezone(existingTz)) {
  const reuse = (await ask(`Reuse time zone "${existingTz}"? [Y/n] `)).trim().toLowerCase();
  if (reuse !== "n" && reuse !== "no") {
    timezone = existingTz;
  }
}
while (!timezone) {
  console.log(`The secretary uses this time zone to interpret relative dates in inbound mail.`);
  console.log(`Examples: America/New_York, Europe/Rome, Asia/Tokyo. Press Enter to accept`);
  console.log(`the operating system's setting.`);
  const raw = (await ask(`Time zone (IANA name) [${systemTz}]: `)).trim();
  const v = raw.length > 0 ? raw : systemTz;
  if (isValidIanaTimezone(v)) {
    timezone = v;
    break;
  }
  fail(
    `"${v}" is not a valid IANA time zone. Use a name like "America/New_York" or "Europe/Rome".`,
  );
}
ok(`Time zone set to "${timezone}".`);

// 3a-iii) Inbox poll interval — how often the daily loop hits Gmail
//         via IMAP looking for new mail. 5 s is near-real-time and
//         well below any documented Gmail rate limit. Minimum 1 s
//         (enforced by main.ts). Higher values reduce IMAP load if
//         the operator is bandwidth-constrained.
header("Inbox poll interval");
const inboxPollVar = "ENCLAWED_SECRETARY_INBOX_POLL_MS";
const existingInboxPoll = existingEnv?.[inboxPollVar];
let inboxPollMs = "";
if (
  existingInboxPoll &&
  /^\d+$/.test(existingInboxPoll) &&
  Number.parseInt(existingInboxPoll, 10) >= 1000
) {
  const reuse = (await ask(`Reuse inbox poll interval ${existingInboxPoll}ms? [Y/n] `))
    .trim()
    .toLowerCase();
  if (reuse !== "n" && reuse !== "no") {
    inboxPollMs = existingInboxPoll;
  }
}
while (!inboxPollMs) {
  console.log(`How often should the secretary check Gmail for new mail? Faster = more`);
  console.log(`responsive but more IMAP traffic. Minimum 1000 ms. Default 5000 ms (5 s).`);
  const raw = (await ask(`Inbox poll interval in ms [5000]: `)).trim();
  const v = raw.length > 0 ? raw : "5000";
  if (!/^\d+$/.test(v) || Number.parseInt(v, 10) < 1000) {
    fail(`"${v}" must be an integer >= 1000 (milliseconds).`);
    continue;
  }
  inboxPollMs = v;
}
ok(`Inbox poll interval set to ${inboxPollMs}ms.`);

// 3b) Approval channel — picks how the bicriterion broker prompts the
//     principal when keypress is required (sensitive draft, calendar
//     write, anything that fails the auto-approve criterion). Choices:
//       auto   — stdin if a TTY is attached at start, else dialog
//       dialog — platform-native modal (Windows MessageBox / osascript
//                / zenity)
//       email  — secretary self-emails the principal and waits for a
//                YES/NO reply (away-from-keyboard / mobile use case)
//       stdin  — in-terminal keypress (only sane when the user runs
//                the app interactively)
//     The choice is baked into the .env so the launcher reads it
//     without any CLI args.
header("Approval channel (HITL)");
const hitlChannelVar = "ENCLAWED_SECRETARY_HITL_CHANNEL";
const hitlEmailTimeoutVar = "ENCLAWED_SECRETARY_HITL_EMAIL_TIMEOUT_MIN";
const existingHitlChannel = existingEnv?.[hitlChannelVar];
const existingHitlTimeout = existingEnv?.[hitlEmailTimeoutVar];
let hitlChannel = existingHitlChannel ?? "";
if (existingHitlChannel) {
  const reuse = (await ask(`Reuse approval channel "${existingHitlChannel}"? [Y/n] `))
    .trim()
    .toLowerCase();
  if (reuse === "n" || reuse === "no") {
    hitlChannel = "";
  }
}
while (!hitlChannel) {
  console.log(`When the secretary asks for your approval (sensitive drafts, calendar writes),`);
  console.log(`how should it reach you?`);
  console.log(`  [1] dialog popup on this machine    (default; works for desktops/laptops)`);
  console.log(`  [2] email reply                     (works when you're away from this machine)`);
  console.log(`  [3] auto-detect at start            (stdin if interactive, else dialog)`);
  console.log(`  [4] stdin keypress in a terminal    (interactive runs only)`);
  const raw = (await ask(`Choice [1]: `)).trim();
  const m = { "": "dialog", 1: "dialog", 2: "email", 3: "auto", 4: "stdin" };
  hitlChannel = m[raw] ?? "";
  if (!hitlChannel) {
    fail(`Invalid choice "${raw}". Pick 1, 2, 3, or 4.`);
  }
}
let hitlEmailTimeout = existingHitlTimeout ?? "30";
if (hitlChannel === "email" || hitlChannel === "auto") {
  if (existingHitlTimeout) {
    const reuse = (await ask(`Reuse approval-email timeout (${existingHitlTimeout} min)? [Y/n] `))
      .trim()
      .toLowerCase();
    if (reuse === "n" || reuse === "no") {
      hitlEmailTimeout = "";
    }
  }
  while (!hitlEmailTimeout) {
    const raw = (await ask(`Approval-email reply timeout in minutes [30]: `)).trim();
    const v = raw.length > 0 ? raw : "30";
    if (!/^\d+$/.test(v) || Number.parseInt(v, 10) < 1) {
      fail(`Timeout must be a positive integer.`);
      continue;
    }
    hitlEmailTimeout = v;
  }
}
ok(
  `Approval channel set to "${hitlChannel}"${hitlChannel === "email" || (hitlChannel === "auto" && hitlEmailTimeout) ? ` (email timeout ${hitlEmailTimeout}min)` : ""}.`,
);
if (principal !== mailbox.toLowerCase()) {
  ok(
    `HITL approvals will go to (and be matched against) the principal address — stored in the OS keyring (encrypted at rest, not in .env).`,
  );
}

// 4) Dispatch to the provider module for credential acquisition. If the
//    provider exports `reuseCredentials` and a prior .env satisfies it,
//    skip the OAuth round-trip entirely; otherwise run acquireCredentials.
header(`Authorizing with ${config.provider.type}`);
const providerModule = await import(`./providers/${config.provider.type}.mjs`);
let credentials = null;
// Keyring helper resolution. Providers that store their secret in the
// platform keyring (provider.usesKeyring === true) need a path to a
// script that can talk to @napi-rs/keyring; for the secretary this
// lives at enclawed-apps/<id>/bin/keyring.mjs. Wrap it in get/set/
// delete closures the provider and the post-install path can call.
const keyringHelper = join(appDir, "bin", "keyring.mjs");
const keyringService = providerModule.keyringService?.(config.id) ?? `enclawed-${config.id}`;
const keyring = providerModule.usesKeyring
  ? buildKeyring({ helperPath: keyringHelper, service: keyringService })
  : null;

if (existingEnv && providerModule.reuseCredentials) {
  const reused = providerModule.reuseCredentials(existingEnv, {
    service: keyringService,
    lookupSecret: keyring?.get,
  });
  if (reused) {
    const reuse = (await ask(`Reuse existing ${config.provider.type} credentials? [Y/n] `))
      .trim()
      .toLowerCase();
    if (reuse !== "n" && reuse !== "no") {
      credentials = reused;
    }
  }
}
if (!credentials) {
  credentials = await providerModule.acquireCredentials({
    config: config.provider,
    // The provider needs the IMAP/SMTP login identity, NOT the
    // principal. Provider modules use `principal` as a legacy param
    // name but the value is the mailbox in our model.
    principal: mailbox,
    ask,
    askSecret,
    ok,
    warn,
    fail,
    docsUrl: config.docsUrl,
  });
  // Keyring-backed providers persist their secret out-of-band as soon
  // as it's acquired, so the password never lands in .env even
  // transiently. The keyring helper reads the secret from stdin —
  // never from argv — to keep it out of process listings.
  if (keyring && credentials?.appPassword) {
    try {
      keyring.set({ account: credentials.principal, secret: credentials.appPassword });
      ok(`App password stored in the OS keyring (service=${keyringService}).`);
    } catch (err) {
      fail(
        `Keyring write failed: ${(err && err.message) || err}.\n` +
          `  On Linux this usually means libsecret is not installed or the session keyring is locked.\n` +
          `  Aborting before the secret can leak to disk.`,
      );
      process.exit(2);
    }
  }
}

// Principal email goes into the OS keyring under a distinct account
// namespace (`principal-email:<mailbox>`) inside the same service.
// Encrypted at rest, never visible in .env. If a previous install
// stored a separate hitl-reply-from entry, clear it — the principal
// concept supersedes that field.
const PRINCIPAL_EMAIL_ACCOUNT = `principal-email:${mailbox}`;
const HITL_REPLY_FROM_ACCOUNT_LEGACY = `hitl-reply-from:${mailbox}`;
const principalDiffersFromMailbox = principal !== mailbox.toLowerCase();
if (keyring) {
  if (principalDiffersFromMailbox) {
    try {
      keyring.set({ account: PRINCIPAL_EMAIL_ACCOUNT, secret: principal });
      ok(`Principal email stored in the OS keyring (encrypted at rest).`);
    } catch (err) {
      fail(
        `Could not write the principal email to the keyring (${(err && err.message) || err}).\n` +
          `  HITL replies will be matched against the mailbox (${mailbox}) instead.`,
      );
    }
  } else {
    // Self-admin install — clear any prior principal entry from a
    // previous install where the operator had set a different value.
    try {
      keyring.delete({ account: PRINCIPAL_EMAIL_ACCOUNT });
    } catch {
      // best effort
    }
  }
  // Always clear the legacy hitl-reply-from entry (superseded by
  // the principal-email entry).
  try {
    keyring.delete({ account: HITL_REPLY_FROM_ACCOUNT_LEGACY });
  } catch {
    // best effort
  }
}

// 5) Run any provider-specific post-auth setup (e.g. create Gmail labels).
if (providerModule.postAuthSetup) {
  await providerModule.postAuthSetup({ config, credentials, principal: mailbox, ok, warn });
}

// 6) Write the env file under ~/.enclawed/enclawed-apps/<id>/.env (chmod 600).
header("Writing env file");
mkdirSync(envDir, { recursive: true });
const providerEnv = providerModule.envVars(credentials);
const envEntries = {
  [mailboxVar]: mailbox,
  [displayNameVar]: displayName,
  [systemPromptVar]: systemPrompt,
  [hitlChannelVar]: hitlChannel,
  ...(hitlChannel === "email" || (hitlChannel === "auto" && hitlEmailTimeout)
    ? { [hitlEmailTimeoutVar]: hitlEmailTimeout }
    : {}),
  // TZ is the standard Node-respected timezone env var. Node reads
  // it at process start for every Date interpretation, and chrono-
  // node honours it transparently — no per-call timezone plumbing
  // anywhere in the runtime.
  TZ: timezone,
  [inboxPollVar]: inboxPollMs,
  ...providerEnv,
  ...(config.service?.extraEnv ? config.service.extraEnv : {}),
  ...(config.llm?.type === "ollama" ? { OLLAMA_MODEL: config.llm.model } : {}),
};
const envLines = [
  `# Generated by enclawed-apps/install.mjs on ${new Date().toISOString()}.`,
  ...Object.entries(envEntries).map(([k, v]) => `export ${k}="${String(v).replace(/"/g, '\\"')}"`),
];
writeFileSync(envPath, envLines.join("\n") + "\n", "utf8");
if (platform() === "win32") {
  // Windows ignores chmod. The user-profile ACL inherited by .env is
  // already locked to the current user on a fresh install, but if the
  // user (or a misbehaving installer the user previously ran) widened
  // it, the credentials file would inherit. icacls /inheritance:r
  // strips inherited ACEs and /grant:r grants the current user
  // full control as the only ACE.
  try {
    runExe("icacls", [envPath, "/inheritance:r", "/grant:r", `${process.env.USERNAME ?? "."}:F`], {
      stdio: "ignore",
    });
  } catch (err) {
    warn(
      `Could not lock down ${envPath} via icacls (${(err && err.message) || err}). ` +
        `Inspect the file's ACL manually if your account shares the profile directory.`,
    );
  }
} else {
  try {
    chmodSync(envPath, 0o600);
  } catch (err) {
    warn(`chmod 600 ${envPath} failed: ${(err && err.message) || err}`);
  }
}
ok(
  `Wrote ${envPath} (env file holds the principal email + non-secret config; the app password lives in the OS keyring).`,
);

// 7) Write the launcher script that the service unit will exec. The
//    absolute pnpm path baked in here was resolved at startup so
//    launchd / schtasks / systemd-user (which inherit minimal PATH)
//    can find it.
writeFileSync(
  launcherPath,
  buildLauncher({
    envPath,
    pnpmPath,
    packageName: config.package,
    workspaceRoot: repoRoot,
    keyringHelperPath: keyring ? keyringHelper : "",
    keyringService: keyring ? keyringService : "",
    keyringSecretEnvVar: keyring ? "ENCLAWED_IMAP_APP_PASSWORD" : "",
    // The keyring entry for the app password is keyed under the
    // MAILBOX email — that's the SMTP/IMAP login. The launcher reads
    // this env value at start time and uses it as the keyring lookup
    // account.
    keyringAccountEnvVar: keyring ? mailboxVar : "",
    // Second keyring fetch: the human principal's email. Conditional
    // on the operator having picked a non-default principal at
    // install time. Empty strings on both fields skip the fetch
    // entirely — the runtime then treats principal == mailbox
    // (the self-admin install case).
    principalAccount: principalDiffersFromMailbox ? PRINCIPAL_EMAIL_ACCOUNT : "",
    principalEnvVar: principalDiffersFromMailbox ? principalVar : "",
  }),
  "utf8",
);
ok(`Wrote ${launcherPath}`);

// 9) Register the background service — if the runtime side is wired up.
//    `serviceReady: false` in app.config.json marks an in-progress
//    migration where the env file is captured but the agent runtime
//    is not ready yet (e.g. the IMAP/CalDAV/CardDAV MCP servers have
//    not landed). We stop here rather than register a service that
//    would fail at first wake-up.
if (config.serviceReady === false) {
  header("Background service NOT registered");
  warn(`${config.name} is mid-migration: ${config.serviceReadyReason ?? "runtime not yet wired"}.`);
  warn("Your credentials were captured at:");
  warn(`  ${envPath}`);
  warn("The service will register itself on a subsequent install run once the runtime ships.");
  rl.close();
  process.exit(0);
}

// Stop any existing service instance BEFORE registering the new one.
// Without this on Windows, the old wscript chain keeps running with
// the previous-install's env (old OLLAMA_MODEL, old principal, stale
// keyring credentials) — operator observed re-installs that wrote a
// new launcher and pulled a new model but the running secretary
// stayed on the old config because the previous process was never
// killed. Register-ScheduledTask -Force replaces the task definition
// but does NOT terminate any execution already in progress; only an
// explicit Stop + tree-kill does.
// Same logic applies on macOS / Linux: a running launchd agent or
// systemd-user service from a prior install would otherwise keep
// holding stale env / state.
header("Stopping any prior instance");
try {
  await runStop();
} catch (err) {
  warn(`runStop reported: ${(err && err.message) || err} (continuing)`);
}

header("Registering background service");
if (platform() === "darwin") {
  registerLaunchd({ launcherPath, logPath });
} else if (platform() === "linux") {
  registerSystemdUser({ launcherPath, logPath });
} else if (platform() === "win32") {
  registerSchtasks({ launcherPath, logPath });
} else {
  warn(`Service registration not implemented for ${platform()}.`);
  warn(`Run manually:  node ${launcherPath}`);
}

rl.close();
console.log("");
header(`${config.name} is running.`);
const auditPath = join(envDir, "audit.jsonl");
const win = platform() === "win32";
console.log(`Tail the audit log:`);
console.log(win ? `  Get-Content -Path "${auditPath}" -Wait` : `  tail -F ${auditPath}`);
console.log(`Service log:`);
console.log(win ? `  Get-Content -Path "${logPath}" -Wait` : `  tail -F ${logPath}`);
const installScript = fileURLToPath(import.meta.url);
if (win) {
  // PowerShell-native forms. The functions are defined by install.ps1;
  // if the user has closed the PowerShell window since install they
  // need to `irm | iex` once to bring them back into scope.
  console.log(`Check status:`);
  console.log(`  Get-EnclawedAppStatus ${config.id}`);
  console.log(`Stop the service (keeps credentials + audit log):`);
  console.log(`  Stop-EnclawedApp ${config.id}`);
  console.log(`Start it again:`);
  console.log(`  Start-EnclawedApp ${config.id}`);
  console.log(`Update to the latest code and restart:`);
  console.log(`  Update-EnclawedApp ${config.id}`);
  console.log(`Uninstall (wipes service, env, audit log, keyring entry):`);
  console.log(`  Uninstall-EnclawedApp ${config.id}`);
  console.log(``);
  console.log(`(If you closed PowerShell since install, re-source the functions first:`);
  console.log(`   irm https://www.enclawed.com/enclawed-apps/install.ps1 | iex)`);
} else {
  console.log(`Check status:`);
  console.log(`  node ${installScript} ${config.id} --status`);
  console.log(`Stop the service (keeps credentials + audit log):`);
  console.log(`  node ${installScript} ${config.id} --stop`);
  console.log(`Start it again:`);
  console.log(`  node ${installScript} ${config.id} --start`);
  console.log(`Update to the latest code and restart:`);
  console.log(`  node ${installScript} ${config.id} --update`);
  console.log(`Uninstall (wipes service, env, audit log, keyring entry):`);
  console.log(`  node ${installScript} ${config.id} --uninstall`);
}

// ────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────

// Diagnostic snapshot of the service: is it loaded? is the env file
// present? is the keyring entry present? how big is the audit log?
// what are the last few lines of the service log? Together that
// answers "the secretary is not running" without forcing the user
// to remember 4 different platform commands.
async function runStatus() {
  header(`Status of ${config.name}`);

  let serviceState = "unknown";
  if (platform() === "darwin") {
    try {
      const out = execFileSync("launchctl", ["list"], { encoding: "utf8" });
      const line = out.split(/\r?\n/).find((l) => l.includes(serviceId));
      if (!line) {
        serviceState = "not loaded (run --start)";
      } else {
        const first = line.trim().split(/\s+/)[0];
        serviceState = first === "-" ? "loaded but not running" : `running (pid ${first})`;
      }
    } catch (err) {
      serviceState = `launchctl list failed: ${(err && err.message) || err}`;
    }
  } else if (platform() === "linux") {
    const unit = `enclawed-${config.id}.service`;
    try {
      const out = execFileSync("systemctl", ["--user", "is-active", unit], {
        encoding: "utf8",
      });
      serviceState = out.trim();
    } catch (err) {
      const tail = err && err.stdout ? err.stdout.toString().trim() : "";
      serviceState = tail || "inactive (run --start)";
    }
  } else if (platform() === "win32") {
    try {
      const out = execFileSync(
        "powershell",
        [
          "-NoProfile",
          "-NonInteractive",
          "-ExecutionPolicy",
          "Bypass",
          "-Command",
          `(Get-ScheduledTask -TaskName ${JSON.stringify(taskName)}).State`,
        ],
        { encoding: "utf8" },
      );
      serviceState = out.trim();
    } catch {
      serviceState = "no scheduled task registered (run install with no flag first)";
    }
  }
  console.log(`  Service state:  ${serviceState}`);

  const envOk = existsSync(envPath);
  console.log(`  Env file:       ${envOk ? envPath : "MISSING"}`);

  try {
    const providerModule = await import(`./providers/${config.provider.type}.mjs`);
    if (providerModule.usesKeyring) {
      const env = readExistingEnv(envPath);
      const account = resolveMailboxFromEnv(env);
      const service = providerModule.keyringService?.(config.id) ?? `enclawed-${config.id}`;
      const helper = join(appDir, "bin", "keyring.mjs");
      if (account && existsSync(helper)) {
        try {
          const k = buildKeyring({ helperPath: helper, service });
          const got = k.get({ account });
          console.log(
            `  Keyring entry:  ${got ? "present" : "MISSING"} (service=${service}, account=${account})`,
          );
        } catch (err) {
          console.log(`  Keyring entry:  error (${(err && err.message) || err})`);
        }
      } else {
        console.log(`  Keyring entry:  cannot check (no env or helper missing)`);
      }
    }
  } catch (err) {
    console.log(`  Keyring entry:  provider load failed (${(err && err.message) || err})`);
  }

  const auditPath = join(envDir, "audit.jsonl");
  if (existsSync(auditPath)) {
    const lines = readFileSync(auditPath, "utf8")
      .split(/\r?\n/)
      .filter((l) => l.trim()).length;
    console.log(`  Audit log:      ${auditPath} (${lines} record${lines === 1 ? "" : "s"})`);
  } else {
    console.log(`  Audit log:      not yet created (no inbound mail processed)`);
  }

  if (existsSync(logPath)) {
    const content = readFileSync(logPath, "utf8");
    console.log(`  Service log:    ${logPath} (${content.length} bytes)`);
    // Pull the model line out of the banner. The banner runs once at
    // each start; without this, the rotating tail almost never
    // includes it and the operator has no way to tell which model is
    // actually loaded. Search backwards — service.log accumulates
    // across multiple startups, so the FIRST "ollama model:" line is
    // from the original install, and we want the LATEST (most recent
    // restart's) value. Same for the startup warn lines.
    const lines = content.split(/\r?\n/).filter((l) => l.length > 0);
    const modelLine = lines.findLast((l) => /\bollama model:/.test(l));
    if (modelLine) {
      console.log(`  ${modelLine.trim()}`);
    }
    // Pull any [secretary warn] lines that were emitted near the most
    // recent startup. We find the last "secretary: started" boundary
    // and only consider lines AFTER it, so warns from a prior boot
    // don't bleed into the current status.
    const lastStartIdx = lines.findLastIndex((l) => /\bsecretary: started\b/.test(l));
    const sinceLastStart = lastStartIdx >= 0 ? lines.slice(lastStartIdx) : lines;
    const startupWarns = sinceLastStart.filter((l) => /\[secretary warn\]/.test(l)).slice(0, 3);
    for (const w of startupWarns) {
      console.log(`  ${w.trim()}`);
    }
    const tail = lines.slice(-6);
    if (tail.length > 0) {
      console.log(`  Last service-log lines:`);
      for (const l of tail) {
        console.log(`    ${l}`);
      }
    }
  } else {
    console.log(`  Service log:    not yet created (service has not produced output)`);
  }
}

// Live end-to-end probe of the three protocol bridges with the
// user's actual credentials. Diagnoses "did the install succeed but
// CardDAV silently returns empty?" — runs one tool call per bridge
// and prints what came back. Errors surface explicitly instead of
// being swallowed and turning into "no contact, send refusal".
async function runProbe() {
  header(`Probing ${config.name} bridges live`);

  const env = readExistingEnv(envPath);
  if (!env) {
    fail(`No env file at ${envPath} — run the installer first.`);
    return;
  }
  const mailbox = resolveMailboxFromEnv(env);
  if (!mailbox) {
    fail(
      `No mailbox address in ${envPath} — expected ENCLAWED_SECRETARY_MAILBOX_EMAIL (or legacy ENCLAWED_SECRETARY_PRINCIPAL_EMAIL).`,
    );
    return;
  }

  let password = "";
  try {
    const providerModule = await import(`./providers/${config.provider.type}.mjs`);
    if (providerModule.usesKeyring) {
      const service = providerModule.keyringService?.(config.id) ?? `enclawed-${config.id}`;
      const helper = join(appDir, "bin", "keyring.mjs");
      const k = buildKeyring({ helperPath: helper, service });
      password = k.get({ account: mailbox }) ?? "";
    }
  } catch (err) {
    fail(`Provider load failed: ${(err && err.message) || err}`);
    return;
  }
  if (!password) {
    fail(`No keyring entry under mailbox ${mailbox}.`);
    return;
  }

  // Spawn a child Node process that drives the three bridges. The
  // probe script imports `enclawed/framework` which resolves to
  // dist/framework.js — pure JS, no tsx loader needed.
  const probeScript = join(appDir, "bin", "probe.mjs");
  if (!existsSync(probeScript)) {
    fail(`Probe script missing: ${probeScript}`);
    return;
  }
  const probeEnv = {
    ...process.env,
    ENCLAWED_SECRETARY_MAILBOX_EMAIL: mailbox,
    // Keep the legacy var populated so older code paths still resolve.
    ENCLAWED_SECRETARY_PRINCIPAL_EMAIL: mailbox,
    ENCLAWED_IMAP_APP_PASSWORD: password,
    ENCLAWED_PROBE_CONFIG: configPath,
  };
  try {
    execFileSync(process.execPath, [probeScript], {
      stdio: "inherit",
      env: probeEnv,
      cwd: repoRoot,
    });
  } catch (err) {
    fail(`Probe exited non-zero: ${(err && err.message) || err}`);
    process.exit(2);
  }
}

// Stop the background service on whichever platform we are on,
// without deleting credentials, env file, audit log, or service
// registration. Symmetric counterpart to runStart() below. Both are
// invoked from the same install.mjs CLI so the user has one obvious
// place to look — no need to remember launchctl vs systemctl vs
// Stop-ScheduledTask.
async function runStop() {
  header(`Stopping ${config.name}`);
  if (platform() === "darwin") {
    const plistPath = join(homedir(), "Library", "LaunchAgents", `${serviceId}.plist`);
    try {
      execFileSync("launchctl", ["unload", plistPath], { stdio: "ignore" });
      ok(`Stopped launchd agent ${serviceId}.`);
    } catch (err) {
      warn(`launchctl unload reported: ${(err && err.message) || err}`);
    }
  } else if (platform() === "linux") {
    const unit = `enclawed-${config.id}.service`;
    try {
      execFileSync("systemctl", ["--user", "stop", unit], { stdio: "ignore" });
      ok(`Stopped systemd-user unit ${unit}.`);
    } catch (err) {
      warn(`systemctl --user stop reported: ${(err && err.message) || err}`);
    }
  } else if (platform() === "win32") {
    // Two-stage stop. (1) Stop-ScheduledTask signals wscript.exe to
    // exit. On Windows this does NOT cascade to the wscript-spawned
    // child tree (cmd → launcher.mjs → cmd → pnpm.cmd → node → tsx →
    // main.ts) because Windows process termination is not propagated
    // through a Job Object unless we explicitly install one. So we
    // (2) enumerate Win32_Process entries whose CommandLine includes
    // this install's specific launcherPath, and taskkill each with
    // /T (tree) /F (force). That kills the launcher + every
    // descendant in one shot. Symmetric for both `Stop-EnclawedApp`
    // and `Uninstall-EnclawedApp`.
    // DISABLE the task first, then stop it. Stop-ScheduledTask alone
    // is insufficient: the task's RestartCount=3 / RestartInterval=1m
    // settings (which we keep so the service recovers from transient
    // crashes during normal operation) cause Task Scheduler to
    // restart the action within a minute of any "failure", and
    // Stop-ScheduledTask is interpreted as a failure. Operator
    // observed: status shows "Running" again within a minute of Stop.
    // Disable-ScheduledTask flips the task to disabled state — it
    // will not run again until Enable-ScheduledTask. runStart then
    // re-enables before Start-ScheduledTask.
    try {
      execFileSync(
        "powershell",
        [
          "-NoProfile",
          "-NonInteractive",
          "-ExecutionPolicy",
          "Bypass",
          "-Command",
          `Disable-ScheduledTask -TaskName ${JSON.stringify(taskName)} -ErrorAction SilentlyContinue | Out-Null; Stop-ScheduledTask -TaskName ${JSON.stringify(taskName)} -ErrorAction SilentlyContinue; exit 0`,
        ],
        { stdio: "inherit" },
      );
      ok(`Disabled and stopped scheduled task "${taskName}".`);
    } catch (err) {
      warn(`Stop-ScheduledTask reported: ${(err && err.message) || err}`);
    }
    // Find PIDs whose command line references the launcher path
    // unique to this install (~/.enclawed/enclawed-apps/<id>/
    // launcher.mjs), then taskkill the tree rooted at each.
    //
    // The path is emitted into a PowerShell SINGLE-quoted literal.
    // PowerShell does NOT unescape backslashes in string literals,
    // so passing the path through JSON.stringify (which produces
    // double-escaped backslashes) leaves $needle holding literal
    // "C:\\Users\\..." and the -like pattern never matches the
    // actual CommandLine. Single-quote literals preserve the path
    // verbatim; we double any embedded single quote per PS
    // escaping rules (paths almost never contain one).
    //
    // The whole block is wrapped in try/catch INSIDE PowerShell:
    // ErrorActionPreference=SilentlyContinue silences NON-terminating
    // errors only — Get-CimInstance and Where-Object can both raise
    // terminating errors (CIM service quirks, antivirus interference)
    // that bypass that preference and crash the script before
    // `exit 0` runs. The catch+exit-0 pattern is the bulletproof
    // version, and we use spawnSync (which does not throw on
    // non-zero exit) instead of execFileSync (which does) so even
    // a PowerShell-level crash never surfaces as "Tree kill
    // reported: Command failed" to the operator.
    // Write the PS script to a temp .ps1 file and invoke it via
    // powershell -File. Two reasons:
    //   - powershell -Command "<multi-line script>" has well-known
    //     quirks (the parser sometimes treats newlines as statement
    //     separators and sometimes doesn't), and the operator
    //     reported the script silently exiting 1 with no Write-Host
    //     output reaching the terminal — meaning PowerShell never
    //     ran the script body, only failed to parse it.
    //   - -File runs the script the way PowerShell runs any other
    //     .ps1 — full multi-line semantics, no -Command escaping
    //     ambiguity.
    // The file lives in the install's envDir alongside the other
    // generated artifacts so an unintended invocation can be traced
    // back to this install.
    const psPath = launcherPath.replace(/'/g, "''");
    const psScript =
      `$ErrorActionPreference = 'SilentlyContinue'\r\n` +
      `try {\r\n` +
      `  $needle = '${psPath}'\r\n` +
      `  $procs = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like ('*' + $needle + '*') }\r\n` +
      `  $count = 0\r\n` +
      `  foreach ($p in $procs) {\r\n` +
      `    & taskkill /T /F /PID $p.ProcessId 2>$null | Out-Null\r\n` +
      `    $count = $count + 1\r\n` +
      `  }\r\n` +
      `  Write-Host "killed $count process tree(s) under $needle"\r\n` +
      `} catch {\r\n` +
      `  Write-Host "tree-kill exception: $_"\r\n` +
      `}\r\n` +
      `exit 0\r\n`;
    const stopPs1 = join(envDir, "tree-kill.ps1");
    writeFileSync(stopPs1, psScript, "utf8");
    const r = spawnSync(
      "powershell",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", stopPs1],
      { stdio: "inherit" },
    );
    if (r.status === 0) {
      ok(`Killed orphaned process trees (if any) rooted at ${launcherPath}.`);
    } else {
      warn(`Tree-kill PowerShell exit=${r.status ?? "(signal)"}; orphan processes may remain.`);
    }
  } else {
    warn(`Stop is not implemented for platform ${platform()}.`);
  }
}

// Start the background service after a --stop. Idempotent (will
// no-op gracefully if the service is already running).
async function runStart() {
  header(`Starting ${config.name}`);
  if (platform() === "darwin") {
    const plistPath = join(homedir(), "Library", "LaunchAgents", `${serviceId}.plist`);
    try {
      execFileSync("launchctl", ["load", plistPath], { stdio: "ignore" });
      ok(`Started launchd agent ${serviceId}.`);
    } catch (err) {
      warn(`launchctl load reported: ${(err && err.message) || err}`);
    }
  } else if (platform() === "linux") {
    const unit = `enclawed-${config.id}.service`;
    try {
      execFileSync("systemctl", ["--user", "start", unit], { stdio: "ignore" });
      ok(`Started systemd-user unit ${unit}.`);
    } catch (err) {
      warn(`systemctl --user start reported: ${(err && err.message) || err}`);
    }
  } else if (platform() === "win32") {
    // Enable first (runStop disables the task to prevent auto-
    // restart from RestartCount=3 / RestartInterval=1m), then start.
    try {
      execFileSync(
        "powershell",
        [
          "-NoProfile",
          "-NonInteractive",
          "-ExecutionPolicy",
          "Bypass",
          "-Command",
          `Enable-ScheduledTask -TaskName ${JSON.stringify(taskName)} -ErrorAction SilentlyContinue | Out-Null; Start-ScheduledTask -TaskName ${JSON.stringify(taskName)} -ErrorAction SilentlyContinue; exit 0`,
        ],
        { stdio: "inherit" },
      );
      ok(`Enabled and started scheduled task "${taskName}".`);
    } catch (err) {
      warn(`Start-ScheduledTask reported: ${(err && err.message) || err}`);
    }
  } else {
    warn(`Start is not implemented for platform ${platform()}.`);
  }
}

// `--update`: run after a fresh `git fetch && git reset --hard` has
// landed new code on disk. Order matters: stop FIRST (kill the old
// process so file handles on enclawed-apps/secretary/ release before
// pnpm tries to relink), then `pnpm install` so the workspace symlinks
// point at the new code, then start. The PowerShell verb wrapper
// (Invoke-EnclawedAppAction) does the git refresh on every action,
// so by the time this runs the clone is already at origin/main.
async function runUpdate() {
  header(`Updating ${config.name}`);
  await runStop();
  const pnpm = locateExecutable("pnpm");
  if (!pnpm) {
    fail(
      "pnpm not found; cannot relink workspace. Open a fresh shell or re-run Install-EnclawedApp.",
    );
    process.exit(2);
  }
  runExe(pnpm, ["install", "--prefer-offline", "--ignore-scripts"], {
    cwd: repoRoot,
    stdio: "inherit",
  });
  ok("Workspace relinked against the refreshed checkout.");
  await runStart();
  ok(`${config.name} updated and restarted.`);
}

async function runUninstall() {
  header(`Uninstalling ${config.name}`);
  if (platform() === "darwin") {
    const plistPath = join(homedir(), "Library", "LaunchAgents", `${serviceId}.plist`);
    try {
      execFileSync("launchctl", ["unload", plistPath], { stdio: "ignore" });
      ok("Stopped launchd agent.");
    } catch {
      warn("launchd agent was not running.");
    }
    if (existsSync(plistPath)) {
      rmSync(plistPath);
      ok(`Removed ${plistPath}`);
    }
  } else if (platform() === "linux") {
    const unit = `enclawed-${config.id}.service`;
    try {
      execFileSync("systemctl", ["--user", "disable", "--now", unit], { stdio: "ignore" });
      ok(`Stopped systemd-user service ${unit}.`);
    } catch {
      warn(`systemd-user service ${unit} was not active.`);
    }
    const unitPath = join(homedir(), ".config", "systemd", "user", unit);
    if (existsSync(unitPath)) {
      rmSync(unitPath);
      ok(`Removed ${unitPath}`);
    }
  } else if (platform() === "win32") {
    // Same PowerShell-API approach as registerSchtasks: Stop/Unregister
    // on the task placed under the current user's principal works
    // without admin. Then taskkill /T /F the launcher's process tree
    // — wscript doesn't propagate termination to its spawned children
    // on Windows, so the tree survives Stop-ScheduledTask unless we
    // walk it explicitly. Wrapped in try/catch so a missing task does
    // not fail the uninstall.
    // File-based invocation. Same rationale as runStop — multi-line
    // -Command was silently parse-failing.
    const psPath = launcherPath.replace(/'/g, "''");
    const psBody =
      `$ErrorActionPreference = 'SilentlyContinue'\r\n` +
      `try {\r\n` +
      `  $taskName = ${JSON.stringify(taskName)}\r\n` +
      `  $needle = '${psPath}'\r\n` +
      `  Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue\r\n` +
      `  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue\r\n` +
      `  $procs = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like ('*' + $needle + '*') }\r\n` +
      `  foreach ($p in $procs) { & taskkill /T /F /PID $p.ProcessId 2>$null | Out-Null }\r\n` +
      `} catch {\r\n` +
      `  Write-Host "uninstall PS exception: $_"\r\n` +
      `}\r\n` +
      `exit 0\r\n`;
    const uninstallPs1 = join(envDir, "uninstall.ps1");
    writeFileSync(uninstallPs1, psBody, "utf8");
    const r = spawnSync(
      "powershell",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", uninstallPs1],
      { stdio: ["ignore", "ignore", "pipe"], encoding: "utf8" },
    );
    if (r.status === 0) {
      ok(
        `Removed Task Scheduler entry "${taskName}" and killed any process tree under ${launcherPath}.`,
      );
    } else {
      const detail = (r.stderr || "").trim();
      warn(
        `Uninstall PowerShell exit=${r.status ?? "(signal)"}` +
          (detail ? `:\n    ${detail.split(/\r?\n/).join("\n    ")}` : "."),
      );
    }
  }
  // Delete the OS keyring entries, if any. We read the mailbox out of
  // the env file before unlinking it (it's the keyring lookup key);
  // doing this before the rmSync below is the only ordering that
  // works. There are up to three entries to remove:
  //   - the app password (account=<mailbox>)
  //   - the principal email (account=principal-email:<mailbox>)
  //   - the legacy hitl-reply-from entry (account=hitl-reply-from:<mailbox>)
  try {
    const env = readExistingEnv(envPath);
    const account = resolveMailboxFromEnv(env);
    const providerModule = await import(`./providers/${config.provider.type}.mjs`);
    if (account && providerModule.usesKeyring) {
      const service = providerModule.keyringService?.(config.id) ?? `enclawed-${config.id}`;
      const helper = join(appDir, "bin", "keyring.mjs");
      if (existsSync(helper)) {
        const k = buildKeyring({ helperPath: helper, service });
        k.delete({ account });
        k.delete({ account: `principal-email:${account}` });
        k.delete({ account: `hitl-reply-from:${account}` });
        ok(
          `Removed keyring entries (service=${service}, account=${account}, plus principal-email and legacy hitl-reply-from).`,
        );
      }
    }
  } catch (err) {
    warn(`Could not clean up keyring entry: ${(err && err.message) || err}`);
  }

  if (existsSync(envDir)) {
    rmSync(envDir, { recursive: true, force: true });
    ok(`Removed ${envDir}`);
  }
  console.log("");
  console.log(
    "To revoke the app password entirely, visit https://myaccount.google.com/apppasswords",
  );
  console.log("and delete the Enclawed Secretary entry.");
}

async function installOllama() {
  if (locateExecutable("ollama")) {
    ok("Ollama already installed.");
    return;
  }
  if (platform() === "win32") {
    if (!locateExecutable("winget")) {
      fail("winget is not on PATH; cannot auto-install Ollama on Windows.");
      fail("Install Ollama manually from https://ollama.com/download and re-run.");
      process.exit(2);
    }
    // winget exits non-zero on "already installed, no upgrade available"
    // (status 0x8A150068 = 2316632107). That's not a failure for us —
    // it means Ollama is on the box already. Catch the throw and fall
    // through to the PATH refresh + canonical-location probe.
    try {
      runExe(
        "winget",
        [
          "install",
          "-e",
          "--id",
          "Ollama.Ollama",
          "--silent",
          "--accept-package-agreements",
          "--accept-source-agreements",
        ],
        { stdio: "inherit" },
      );
    } catch (err) {
      warn(
        `winget exited with status ${err.status ?? "unknown"}; treating as "already installed" and probing canonical install paths.`,
      );
    }
    refreshWindowsPath();
    if (locateExecutable("ollama")) {
      ok("Ollama is ready.");
      return;
    }
    // Some Ollama installs land outside the user PATH (admin install
    // to Program Files, or an installer step that skipped the PATH
    // update). Probe the canonical locations directly; if ollama.exe
    // is there, prepend its directory to this process's PATH so the
    // rest of the install run finds it.
    const candidates = [
      process.env.LOCALAPPDATA &&
        join(process.env.LOCALAPPDATA, "Programs", "Ollama", "ollama.exe"),
      process.env.ProgramFiles && join(process.env.ProgramFiles, "Ollama", "ollama.exe"),
      process.env["ProgramFiles(x86)"] &&
        join(process.env["ProgramFiles(x86)"], "Ollama", "ollama.exe"),
    ].filter(Boolean);
    for (const c of candidates) {
      if (existsSync(c)) {
        const dir = dirname(c);
        process.env.Path = `${dir};${process.env.Path ?? ""}`;
        process.env.PATH = process.env.Path;
        ok(`Found Ollama at ${c}; added its directory to PATH for this run.`);
        return;
      }
    }
    fail(
      "Ollama is installed but ollama.exe is not on PATH and not at the canonical install locations.",
    );
    fail("Open a new PowerShell window and re-run the installer.");
    process.exit(2);
  }
  execFileSync("bash", ["-c", "curl -fsSL https://ollama.com/install.sh | sh"], {
    stdio: "inherit",
  });
}

// Re-read PATH from the Windows registry into the current process so
// binaries that were just installed (via winget, npm-global, etc.)
// become reachable in this same install run without forcing the user
// to open a new shell.
function refreshWindowsPath() {
  if (platform() !== "win32") {
    return;
  }
  try {
    const machine = execFileSync(
      "powershell",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "[Environment]::GetEnvironmentVariable('Path','Machine')",
      ],
      { encoding: "utf8" },
    ).trim();
    const user = execFileSync(
      "powershell",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "[Environment]::GetEnvironmentVariable('Path','User')",
      ],
      { encoding: "utf8" },
    ).trim();
    const merged = [machine, user, process.env.Path].filter((p) => p && p.length > 0).join(";");
    process.env.Path = merged;
    process.env.PATH = merged;
  } catch {
    // Best effort; if powershell can't run, we'll just continue and
    // locateExecutable will report the failure.
  }
}

async function ensureOllamaServing() {
  if (await ollamaReachable()) {
    return;
  }
  const ollamaBin = locateExecutable("ollama");
  if (!ollamaBin) {
    warn("ollama binary not found on PATH; cannot start the daemon automatically.");
    return;
  }
  spawn(ollamaBin, ["serve"], { detached: true, stdio: "ignore" }).unref();
  for (let i = 0; i < 15; i += 1) {
    if (await ollamaReachable()) {
      return;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  warn("Ollama daemon did not become reachable within 15s; the model pull may still work.");
}

async function ollamaReachable() {
  try {
    const r = await fetch("http://127.0.0.1:11434/api/version", {
      signal: AbortSignal.timeout(2000),
    });
    return r.ok;
  } catch {
    return false;
  }
}

// Force a single-token inference so Ollama loads the model, then read
// `ollama ps` to see which processor it landed on. Reports a clear
// success message when 100% GPU, a loud warning + remediation hints
// when 100% CPU, and a neutral note when split. Any error path is
// swallowed silently — install must not fail because of a probe.
function probeOllamaGpu(ollamaPath, model) {
  try {
    header("Verifying GPU acceleration");
    // `--keepalive 30s` keeps the model loaded long enough for the ps
    // call below. The prompt is one token so the inference itself
    // is sub-second on any backend that loads the model at all.
    runExe(ollamaPath, ["run", model, "--keepalive", "30s", "hi"], {
      stdio: "ignore",
      timeout: 120_000,
    });
    const psOut = runExe(ollamaPath, ["ps"], { encoding: "utf8" });
    const line = psOut.split(/\r?\n/).find((l) => l.includes(model.split(":")[0]));
    if (!line) {
      warn("Could not parse `ollama ps` output; skipping GPU verification.");
      return;
    }
    const matches = [...line.matchAll(/(\d+)% (GPU|CPU)/g)].map((m) => `${m[1]}% ${m[2]}`);
    if (matches.length === 0) {
      warn("Could not find a processor column in `ollama ps`; skipping GPU verification.");
      return;
    }
    const hasFullGpu = matches.some((s) => s === "100% GPU");
    const hasFullCpu = matches.some((s) => s === "100% CPU");
    if (hasFullGpu) {
      ok(`Ollama is using the GPU for inference (${matches.join(", ")}).`);
    } else if (hasFullCpu) {
      warn(`Ollama is using CPU only (${matches.join(", ")}) — inference will be 10–50× slower.`);
      warn("  Possible causes:");
      if (platform() === "win32") {
        warn(
          "    - NVIDIA: update your GPU driver from https://www.nvidia.com/Download/index.aspx",
        );
        warn("    - AMD: install the latest Adrenalin driver and Ollama for Windows AMD build");
      } else if (platform() === "linux") {
        warn("    - NVIDIA: install the proprietary driver (`nvidia-smi` should show your GPU)");
        warn("    - AMD ROCm: install rocm-libs (Ollama uses ROCm on Linux)");
        warn(
          "    - WSL2: install the NVIDIA WSL2 driver bridge from " +
            "https://docs.nvidia.com/cuda/wsl-user-guide/index.html",
        );
      } else if (platform() === "darwin") {
        warn(
          "    - Apple Silicon: Metal should auto-detect; restart Ollama and re-run the install",
        );
        warn("    - Intel Mac: GPU inference is not supported by Ollama on Intel Macs");
      }
      warn(
        "  The secretary will still run on CPU; expect ~1–2 minutes per reply instead of seconds.",
      );
    } else {
      ok(`Ollama processor split: ${matches.join(", ")} (acceptable; model is partially on GPU).`);
    }
  } catch (err) {
    warn(
      `GPU verification skipped: ${(err && err.message) || err}. ` +
        "Check manually with: ollama run " +
        model +
        " 'hi' && ollama ps",
    );
  }
}

function buildLauncher({
  envPath,
  pnpmPath,
  packageName,
  workspaceRoot,
  keyringHelperPath,
  keyringService,
  keyringSecretEnvVar,
  keyringAccountEnvVar,
  principalAccount,
  principalEnvVar,
}) {
  const nodeDir = dirname(process.execPath);
  const pnpmDir = dirname(pnpmPath);
  return `#!/usr/bin/env node
// Auto-generated by enclawed-apps/install.mjs. Loads the .env file
// written alongside it, queries the OS keyring for the at-rest
// secret, then execs the absolute pnpm path with that env.
// Cross-platform: launchd, systemd-user, and schtasks all run this.

import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { delimiter } from "node:path";

const envPath = ${JSON.stringify(envPath)};
const pnpmPath = ${JSON.stringify(pnpmPath)};
const workspaceRoot = ${JSON.stringify(workspaceRoot)};
const keyringHelper = ${JSON.stringify(keyringHelperPath)};
const keyringService = ${JSON.stringify(keyringService)};
const keyringSecretEnvVar = ${JSON.stringify(keyringSecretEnvVar)};
const keyringAccountEnvVar = ${JSON.stringify(keyringAccountEnvVar)};
// Principal email — encrypted-at-rest in the same OS keyring,
// fetched here and exported as ENCLAWED_SECRETARY_PRINCIPAL_EMAIL so
// the runtime can match incoming HITL replies against it. Empty
// string on either field means the operator left principal == mailbox
// (the self-admin install), and we skip the second keyring fetch.
const principalAccount = ${JSON.stringify(principalAccount)};
const principalEnvVar = ${JSON.stringify(principalEnvVar)};
const env = { ...process.env };

for (const raw of readFileSync(envPath, "utf8").split(/\\r?\\n/)) {
  const line = raw.trim();
  if (!line || line.startsWith("#")) continue;
  const eq = line.indexOf("=");
  if (eq < 0) continue;
  let key = line.slice(0, eq).trim();
  if (key.startsWith("export ")) key = key.slice(7).trim();
  let val = line.slice(eq + 1).trim();
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1).replace(/\\\\"/g, '"');
  }
  env[key] = val;
}

// Pull the app-specific password out of the OS keyring under the
// account whose name is already in the env (the principal email).
// The secret is written to env in memory only — never to disk, never
// to argv, never to a log line.
if (keyringHelper && keyringSecretEnvVar) {
  const account = env[keyringAccountEnvVar];
  if (!account) {
    process.stderr.write(\`launcher: \${keyringAccountEnvVar} is not set in \${envPath}; cannot locate keyring entry\\n\`);
    process.exit(2);
  }
  const r = spawnSync(
    process.execPath,
    [keyringHelper, "get", "--service", keyringService, "--account", account],
    { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
  );
  if (r.status === 65) {
    process.stderr.write(\`launcher: no keyring entry under service="\${keyringService}" account="\${account}". Re-run the installer.\\n\`);
    process.exit(2);
  }
  if (r.status !== 0) {
    process.stderr.write(\`launcher: keyring get failed (exit \${r.status}); the OS keyring may be locked.\\n\`);
    process.exit(2);
  }
  env[keyringSecretEnvVar] = r.stdout;
}

// Second keyring fetch: the human principal's email. Same service, a
// distinct account namespace. Failure here is non-fatal — the runtime
// falls back to matching HITL replies against the mailbox identity
// (the self-admin install). Missing entry (status 65) means the
// operator accepted the default at install; not an error.
if (keyringHelper && principalAccount && principalEnvVar) {
  const r = spawnSync(
    process.execPath,
    [keyringHelper, "get", "--service", keyringService, "--account", principalAccount],
    { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
  );
  if (r.status === 0) {
    env[principalEnvVar] = r.stdout.trim();
  } else if (r.status !== 65) {
    process.stderr.write(\`launcher: principal-email keyring get failed (exit \${r.status}); HITL email channel will fall back to mailbox-self match\\n\`);
  }
}

// Prepend the install-time directories of Node and pnpm to PATH so any
// child processes (pnpm itself, tsx, ollama) find their dependencies
// when running under launchd / systemd-user / schtasks (which start
// with a minimal PATH).
env.PATH = [${JSON.stringify(nodeDir)}, ${JSON.stringify(pnpmDir)}, env.PATH ?? ""]
  .filter((p) => p.length > 0)
  .join(delimiter);

// On Windows, pnpm is shipped as pnpm.cmd; Node refuses to spawn .cmd
// files directly (CVE-2024-27980 mitigation). The shell:true shortcut
// is the documented workaround but triggers DEP0190 in Node >= 22.
// Instead we invoke cmd.exe explicitly with windowsVerbatimArguments,
// which is precisely what shell:true does internally on Windows but
// without the deprecation flag.
//
// Flags + quoting:
//   /d  skip the AutoRun command
//   /s  use the "strip first and last quote" parsing rule for /C
//   /c  terminate after running the rest of the command line
//
// /S's strip-outer-quotes rule means cmd looks at the command after
// /c and, if it both starts AND ends with ", removes just those two
// outer quotes and parses everything between them verbatim. If the
// command starts with " but doesn't end with " (because the last
// arg is unquoted like "start"), /S strips the first " AND the last
// inner " — corrupting any quoted argument in between. Operator
// previously saw:
//   'C:\\...\\pnpm.cmd" -F "enclawed-secretary-app' is not recognized
// — exactly the strip-collateral we want to avoid.
// We therefore wrap the whole command in an EXTRA outer "..." pair
// so /S has a clean target to strip and the interior keeps its own
// quoting intact for paths-with-spaces support.
//
// cmd.exe is resolved via %ComSpec% (the canonical absolute path on
// every Windows install — e.g. C:\\Windows\\System32\\cmd.exe). Using
// the bare name "cmd.exe" fails with ENOENT under Task Scheduler when
// the scheduler hands us a stripped PATH that excludes System32.
// ComSpec is set by the kernel at session start and survives PATH
// stripping.
//
// CWD must be the workspace root so pnpm finds pnpm-workspace.yaml.
// Without this, the schtasks scheduler hands us cwd=C:\\Windows\\System32
// (and launchd / systemd give us "/" or the user's home), pnpm walks
// up looking for a workspace, finds none, and exits with
// "No projects found in <cwd>" before the secretary even starts.
const pkgArg = ${JSON.stringify(packageName)};
const cmdExe = env.ComSpec || "C:\\\\Windows\\\\System32\\\\cmd.exe";
const wrappedCmd = \`""\${pnpmPath}" -F "\${pkgArg}" start"\`;
const child = process.platform === "win32"
  ? spawn(
      cmdExe,
      ["/d", "/s", "/c", wrappedCmd],
      {
        cwd: workspaceRoot,
        env,
        stdio: "inherit",
        windowsVerbatimArguments: true,
      },
    )
  : spawn(pnpmPath, ["-F", pkgArg, "start"], {
      cwd: workspaceRoot,
      env,
      stdio: "inherit",
    });
child.on("exit", (code) => process.exit(code ?? 1));
child.on("error", (err) => {
  process.stderr.write(\`launcher: failed to spawn pnpm: \${err.message}\\n\`);
  process.exit(1);
});
`;
}

function registerLaunchd({ launcherPath, logPath }) {
  const plistDir = join(homedir(), "Library", "LaunchAgents");
  mkdirSync(plistDir, { recursive: true });
  const plistPath = join(plistDir, `${serviceId}.plist`);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${serviceId}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${process.execPath}</string>
    <string>${launcherPath}</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>${logPath}</string>
  <key>StandardErrorPath</key><string>${logPath}</string>
</dict>
</plist>
`;
  writeFileSync(plistPath, xml, "utf8");
  try {
    execFileSync("launchctl", ["unload", plistPath], { stdio: "ignore" });
  } catch {}
  execFileSync("launchctl", ["load", plistPath]);
  ok(`launchd: ${plistPath}`);
}

function registerSystemdUser({ launcherPath, logPath }) {
  const unitDir = join(homedir(), ".config", "systemd", "user");
  mkdirSync(unitDir, { recursive: true });
  const unit = `enclawed-${config.id}.service`;
  const unitPath = join(unitDir, unit);
  writeFileSync(
    unitPath,
    `[Unit]
Description=${config.service?.description ?? config.name}
After=network.target

[Service]
Type=simple
ExecStart=${process.execPath} ${launcherPath}
Restart=on-failure
StandardOutput=append:${logPath}
StandardError=append:${logPath}

[Install]
WantedBy=default.target
`,
    "utf8",
  );
  execFileSync("systemctl", ["--user", "daemon-reload"]);
  execFileSync("systemctl", ["--user", "enable", "--now", unit]);
  ok(`systemd-user: ${unitPath}`);
}

function registerSchtasks({ launcherPath, logPath }) {
  // schtasks does not redirect stdout, so wrap in a tiny .cmd that pipes
  // output to the log file and runs the launcher via cmd's >> redirect.
  const cmdPath = join(envDir, "run.cmd");
  writeFileSync(
    cmdPath,
    `@echo off\r\n"${process.execPath}" "${launcherPath}" >> "${logPath}" 2>&1\r\n`,
    "utf8",
  );

  // The cmd.exe console window pops visibly on logon when the scheduled
  // task runs run.cmd directly — even with /RL LIMITED, even with no
  // output, even with @echo off, Windows always shows the console
  // host for a cmd.exe process spawned from Task Scheduler unless we
  // wrap it in a non-console host. The WScript shell's Run() method
  // with window style 0 starts the wrapped command with no console
  // window at all. Same trick every "run silently on logon" tutorial
  // recommends.
  const vbsPath = join(envDir, "run.vbs");
  writeFileSync(
    vbsPath,
    [
      // 0 = SW_HIDE — no console window appears at any point.
      // bWaitOnReturn = True — wscript stays alive as the launcher's
      // parent process for as long as the launcher runs. This is
      // what makes `Get-EnclawedAppStatus` report "Running" instead
      // of "Ready" — Task Scheduler tracks the action process's
      // lifetime, and an asynchronous wscript would exit immediately
      // after spawning the launcher, making the task look stopped
      // while the launcher kept running detached. The hide-window
      // behaviour is unaffected by the wait flag.
      `CreateObject("Wscript.Shell").Run """${cmdPath.replace(/"/g, '""')}""", 0, True`,
      "",
    ].join("\r\n"),
    "utf8",
  );

  // The bare `schtasks /Create` CLI tries to write into the root task
  // folder (`\`), which requires Administrator on Windows even with
  // `/RL LIMITED` — non-admin users hit "Access is denied" before any
  // task is created. PowerShell's Register-ScheduledTask API places
  // the task under the current user's principal in the user's task
  // folder and works without elevation. We emit a tiny PowerShell
  // script that does the same Register / Start / -Force replace as
  // the schtasks invocations above and run it via `powershell -File`.
  const psPath = join(envDir, "register-task.ps1");
  const psScript = [
    `$ErrorActionPreference = "Stop"`,
    `$taskName = ${JSON.stringify(taskName)}`,
    `$vbsPath = ${JSON.stringify(vbsPath)}`,
    // wscript.exe runs the .vbs which in turn invokes run.cmd with
    // window style 0 — no console window appears at any point. The
    // double-quote wrapping around $vbsPath protects against spaces
    // in the path (e.g. "C:\Users\Some User\.enclawed\...").
    `$wscriptArg = '"' + $vbsPath + '"'`,
    `$action = New-ScheduledTaskAction -Execute "wscript.exe" -Argument $wscriptArg`,
    `$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME`,
    `$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited`,
    // -ExecutionTimeLimit 0 means "no limit"; the secretary is meant
    // to run continuously until logoff.
    // -RestartCount/Interval handle transient network failures.
    `$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Seconds 0) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)`,
    // -Force replaces an existing task with the same name; same
    // semantics as the prior `schtasks /Delete + /Create /F`.
    `Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null`,
    `Start-ScheduledTask -TaskName $taskName`,
  ].join("\r\n");
  writeFileSync(psPath, psScript, "utf8");
  execFileSync(
    "powershell",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", psPath],
    { stdio: "inherit" },
  );
  ok(`Task Scheduler: "${taskName}" (logs at ${logPath})`);
}
