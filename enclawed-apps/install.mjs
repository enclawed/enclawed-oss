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
import {
  chmodSync,
  createWriteStream,
  existsSync,
  closeSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { homedir, hostname, platform } from "node:os";
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
const adversarialGateOnly = argv.includes("--adversarial-gate");
if (
  !appId ||
  [uninstall, stopOnly, startOnly, statusOnly, probeOnly, updateOnly, adversarialGateOnly].filter(
    Boolean,
  ).length > 1
) {
  printUsage();
  process.exit(64);
}
// The app was renamed secretary -> executive-assistant. Everyone's
// muscle memory, every already-published doc, and the shell history on
// every existing install still say "secretary", and bare
// "no app at ..." tells them nothing. Worse, refusing the old name
// means the migration below never runs, so the operator is stranded
// with a data directory the new id cannot see. Accept the old id,
// resolve it forward, and say so once.
const APP_ID_ALIASES = { secretary: "executive-assistant" };
const resolvedAppId = APP_ID_ALIASES[appId] ?? appId;
if (resolvedAppId !== appId) {
  console.log(
    `note: "${appId}" was renamed to "${resolvedAppId}"; continuing as "${resolvedAppId}".\n` +
      `      Existing data, credentials and the scheduled task are migrated automatically.`,
  );
}
function printUsage() {
  const apps = (() => {
    try {
      return readdirSync(here).filter((d) => existsSync(join(here, d, "app.config.json")));
    } catch {
      return [];
    }
  })();
  const w = platform() === "win32";
  console.log("");
  console.log("enclawed apps — install and run a reference app");
  console.log("");
  console.log("  install.mjs <app> [action]");
  console.log("");
  console.log("  actions:");
  console.log("    (none)              install, or repair an existing install");
  console.log("    --status            is it running, and is it actually working");
  console.log("    --start | --stop    control the service");
  console.log("    --update            pull latest code, rebuild, restart");
  console.log("    --probe             check connectivity and configuration");
  console.log("    --adversarial-gate  run the prompt-injection self-test only");
  console.log("    --uninstall         remove service, env, audit log, keyring entry");
  console.log("    --help              this message");
  console.log("");
  console.log("  settings (no reinstall, keeps credentials):");
  console.log(
    w
      ? "    Set-EnclawedAppSettings <app> [-List] [-Set KEY=VALUE]"
      : `    node ${join(here, "settings.mjs")} <app> [--list] [--set=KEY=VALUE]`,
  );
  if (w) {
    console.log("");
    console.log("  every command:  Get-EnclawedHelp");
  }
  if (apps.length > 0) {
    console.log("");
    console.log(`  apps: ${apps.join(", ")}`);
  }
  console.log("");
}

if (argv.includes("--help") || argv.includes("-h")) {
  printUsage();
  process.exit(0);
}

const appDir = join(here, resolvedAppId);
const configPath = join(appDir, "app.config.json");
if (!existsSync(configPath)) {
  console.error(
    `install: no app at ${appDir} (missing app.config.json).\n` +
      `  Known apps: ${readdirSync(here)
        .filter((d) => existsSync(join(here, d, "app.config.json")))
        .join(", ")}`,
  );
  process.exit(64);
}
const config = JSON.parse(readFileSync(configPath, "utf8"));

const envDir = join(homedir(), ".enclawed", "enclawed-apps", config.id);

// ---- one-time migration: the app was renamed secretary -> executive-assistant.
//
// Everything an existing install owns is keyed on the old id: the data
// directory under ~/.enclawed/enclawed-apps, the ENCLAWED_SECRETARY_*
// variable names inside its .env, the OS keyring service, and the
// Windows scheduled task (named from config.name). Without this an
// update would silently start a SECOND, empty install beside the old
// one: fresh credential prompts, an orphaned audit trail, and two
// services polling the same mailbox.
//
// Best-effort by design. A failure here must not block the install; it
// just leaves the operator where they already were.
const LEGACY_APP_ID = "secretary";
const LEGACY_ENV_PREFIX = "ENCLAWED_SECRETARY_";
const ENV_PREFIX = "ENCLAWED_EXECUTIVE_ASSISTANT_";
const legacyEnvDir = join(homedir(), ".enclawed", "enclawed-apps", LEGACY_APP_ID);

function migrateLegacyInstall() {
  if (config.id === LEGACY_APP_ID || existsSync(envDir) || !existsSync(legacyEnvDir)) {
    return;
  }
  try {
    renameSync(legacyEnvDir, envDir);
    console.log(`  Migrated ${legacyEnvDir} -> ${envDir}`);
  } catch (err) {
    console.log(`  Could not migrate ${legacyEnvDir}: ${(err && err.message) || err}`);
    return;
  }
  // Rewrite the variable names in place. The launcher is regenerated
  // later in the install, so only .env needs rewriting here.
  const migratedEnvPath = join(envDir, ".env");
  try {
    if (existsSync(migratedEnvPath)) {
      const before = readFileSync(migratedEnvPath, "utf8");
      const after = before.split(LEGACY_ENV_PREFIX).join(ENV_PREFIX);
      if (after !== before) {
        writeFileSync(migratedEnvPath, after);
        console.log(`  Renamed ${LEGACY_ENV_PREFIX}* variables in ${migratedEnvPath}`);
      }
    }
  } catch (err) {
    console.log(`  Could not rewrite env variable names: ${(err && err.message) || err}`);
  }
}
migrateLegacyInstall();

// Third piece of the rename: the Windows scheduled task is named from
// config.name, so the old install left "Enclawed AI Secretary" behind.
// It points at a launcher path that no longer exists after the data
// directory move, but a disabled-and-removed task is still tidier than
// a broken one firing on a schedule -- and if the move failed, leaving
// it enabled means two services polling one mailbox.
function removeLegacyScheduledTask() {
  if (platform() !== "win32" || config.id === LEGACY_APP_ID) {
    return;
  }
  const legacyTaskName = "Enclawed AI Secretary";
  try {
    execFileSync(
      "powershell",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        `if (Get-ScheduledTask -TaskName ${JSON.stringify(legacyTaskName)} -ErrorAction SilentlyContinue) { ` +
          `Disable-ScheduledTask -TaskName ${JSON.stringify(legacyTaskName)} -ErrorAction SilentlyContinue | Out-Null; ` +
          `Stop-ScheduledTask -TaskName ${JSON.stringify(legacyTaskName)} -ErrorAction SilentlyContinue; ` +
          `Unregister-ScheduledTask -TaskName ${JSON.stringify(legacyTaskName)} -Confirm:$false -ErrorAction SilentlyContinue; ` +
          `Write-Output "removed" }`,
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], windowsHide: true },
    );
  } catch {
    // Task absent, or PowerShell unavailable. Either way there is
    // nothing to clean up and nothing worth failing the install over.
  }
}
removeLegacyScheduledTask();

// Coverage matrix the adversarial gate prints to the log. Operators can
// grep this to confirm every numbered technique from the internal
// 20-shape prompt-injection catalog the shield is sized against is
// exercised by at least one suite. "regex" = src/enclawed/dlp-scanner.ts
// patterns (Stage-1 shield). "classifier" = test/enclawed/few-shot-
// classifier.live.test.ts (Stage-0 LLM-as-judge). Declared near the
// top of the module so the --adversarial-gate early-exit branch can
// read it without hitting a TDZ.
const TWENTY_TECHNIQUES_COVERAGE = [
  ["#1", "Ignore Previous Instructions", "regex"],
  ["#2", "Role Reversal", "regex"],
  ["#3", "Chain-of-Thought Extraction", "regex + classifier"],
  ["#4", "Base64 Encoding", "regex"],
  ["#5", "Unicode / Whitespace Abuse", "regex"],
  ["#6", "Nested Escapes (HTML/Jinja comments)", "regex"],
  ["#7", "Do-Anything-Now (DAN) Style", "regex"],
  ["#8", "Evil Twin Roleplay", "regex + classifier"],
  ["#9", "Multi-Agent Gaslighting", "regex"],
  ["#10", "Poisoned Data Source (SYSTEM OVERRIDE)", "regex"],
  // NOT steganography coverage. See the note printed under the table.
  ["#11", "Image trigger text surfaced into body", "regex"],
  ["#12", "URL Poisoning", "regex"],
  ["#13", "Few-Shot Hijack", "classifier"],
  ["#14", "Instruction Piggybacking", "regex + classifier"],
  ["#15", "Context Length Attack (terminal payload)", "regex"],
  ["#16", "Covert Channels (emoji/morse/binary)", "regex"],
  ["#17", "Out-of-Band Exfil (HTTP)", "regex"],
  ["#18", "Template / Env-Var Injection", "regex"],
  ["#19", "Safety Filter Framing (fictional)", "regex + classifier"],
  ["#20", "Recursive Delegation", "regex"],
];
const envPath = join(envDir, ".env");
const launcherPath = join(envDir, "launcher.mjs");
const logPath = join(envDir, "service.log");
const serviceId = config.service?.id ?? `com.enclawed.${config.id}`;
const taskName = `Enclawed ${config.name}`;
const PRINCIPAL_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WHICH = platform() === "win32" ? "where" : "which";

// Hardware trust anchor (the enclaweder) presence, mirroring the
// detection in src/enclawed/hardware-root/enclaweder-hid.ts: a USB HID
// node under /sys/class/hidraw whose uevent carries the vendor/product
// pair. That subsystem is Linux-only, so on Windows and macOS the core
// silently falls back to a software-only root — which is worth saying
// out loud in status rather than leaving the operator to assume their
// device is anchoring anything.
// Whether the app is RUNNING and whether it is WORKING are different
// questions, and status used to answer only the first. An install with
// rejected credentials showed "Service state: Running", a healthy
// device line and an audit log that only ever grew from failures --
// every indicator green while the assistant had never once read the
// inbox. This reads the service log and the audit trail and states a
// verdict outright.
const FATAL_MARKERS = ["Unhandled 'error' event", "ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL", "FATAL"];

/* Read by runStatus(), which the top-level dispatch calls. These MUST stay
 * above that dispatch: `const` is not hoisted, so declaring them further down
 * beside their helpers put them in the temporal dead zone and every
 * `enclawed status` run died on a ReferenceError. */

/** Bytes of a log we are willing to hold in memory at once. */
const LOG_TAIL_BYTES = 2 * 1024 * 1024;

/** Size past which an audit log is worth flagging: it will not rotate itself. */
const AUDIT_SIZE_WARN_BYTES = 128 * 1024 * 1024;

function tailOf(path, maxBytes = 262144) {
  const size = statSync(path).size;
  const start = size > maxBytes ? size - maxBytes : 0;
  const fd = openSync(path, "r");
  try {
    const buf = Buffer.alloc(size - start);
    readSync(fd, buf, 0, buf.length, start);
    return buf.toString("utf8");
  } finally {
    closeSync(fd);
  }
}

/** Audit rows carry epoch millis; render them as something readable. */
function formatAuditTs(value) {
  if (value === null || value === undefined) {
    return "none recorded";
  }
  const n = Number(value);
  if (Number.isFinite(n) && n > 1e12) {
    return new Date(n).toLocaleString();
  }
  return String(value);
}

function healthSummary({ logPath, auditPath, serviceState }) {
  const detail = [];
  let lastGoodPoll = null;
  let lastError = null;
  let errorCount = 0;
  let crashed = false;
  let silentDrops = 0;
  let lastDrop = null;

  if (existsSync(logPath)) {
    let text = "";
    try {
      text = tailOf(logPath);
    } catch {
      /* unreadable log -- fall through with what we have */
    }
    for (const line of text.split(/\r?\n/)) {
      // A numeric hit count means a search actually completed; "n/a"
      // means the assistant has never got that far.
      const good = /^(\S+ \S+ \S+) .*hit count=(\d+)/.exec(line);
      if (good) {
        lastGoodPoll = good[1];
        continue;
      }
      const err = /^(\S+ \S+ \S+) .*poll iteration failed: (.*)$/.exec(line);
      if (err) {
        // Keep the part an operator can act on: the provider status
        // code and its message, not the whole tool-call prefix.
        const raw = err[2];
        const code = /status=([A-Z_]+)/.exec(raw);
        const resp = /response="([^"]*)"/.exec(raw);
        lastError = {
          at: err[1],
          msg: code ? `${code[1]}${resp ? ` (${resp[1]})` : ""}` : raw.slice(0, 90),
        };
        errorCount += 1;
        continue;
      }
      // A silently-dropped message produces no reply and no error, so
      // without this the operator sees a healthy assistant and concludes
      // it is ignoring them. Observed live: legitimate mail from the
      // principal classified as a false-fact injection and dropped.
      const dropped = /^(\S+ \S+ \S+) .*dry refusal: silently dropping .*from=(\S+)/.exec(line);
      if (dropped) {
        silentDrops += 1;
        lastDrop = { at: dropped[1], from: dropped[2] };
        continue;
      }
      if (FATAL_MARKERS.some((m) => line.includes(m))) {
        crashed = true;
      }
    }
  }

  let lastActivity = null;
  if (existsSync(auditPath)) {
    try {
      const rows = tailOf(auditPath, 65536).trim().split(/\r?\n/).filter(Boolean);
      for (let i = rows.length - 1; i >= 0; i -= 1) {
        try {
          const r = JSON.parse(rows[i]);
          if (r?.ts || r?.timestamp) {
            lastActivity = String(r.ts ?? r.timestamp);
            break;
          }
        } catch {
          /* partial line -- keep scanning backwards */
        }
      }
    } catch {
      /* unreadable audit -- leave null */
    }
  }

  // Word boundaries matter: "inactive" contains "active", and without
  // \b a stopped service reads as running and the verdict inverts.
  const running = /\b(running|active)\b/i.test(serviceState);
  let verdict;
  if (!running && crashed) {
    verdict = "NOT WORKING — the service exited after a crash";
  } else if (!running) {
    verdict = "NOT RUNNING";
  } else if (errorCount > 0 && !lastGoodPoll) {
    verdict = "NOT WORKING — running, but the inbox has never been read successfully";
  } else if (errorCount > 0) {
    verdict = "DEGRADED — running, with recent poll failures";
  } else if (lastGoodPoll) {
    verdict = "OK — polling the inbox";
  } else {
    verdict = "STARTING — no poll recorded yet";
  }

  detail.push(`last good poll:  ${lastGoodPoll ?? "never"}`);
  if (lastError) {
    detail.push(`last error:      ${lastError.msg} (${errorCount}x, latest ${lastError.at})`);
  }
  // The audit trail records refusals and failures too, so this is the
  // last time the app wrote anything -- not proof it did useful work.
  detail.push(`last audit entry: ${formatAuditTs(lastActivity)}`);
  if (silentDrops > 0) {
    detail.push(
      `dropped silently: ${silentDrops} message(s) judged prompt-injection — no reply was sent` +
        (lastDrop ? ` (last: ${lastDrop.from} at ${lastDrop.at})` : ""),
    );
  }
  if (crashed) {
    detail.push("the service log ends in a crash, not a clean shutdown");
  }
  return { verdict, detail };
}

/** Newest mtime under a tree, for verifying a build actually produced output. */
function newestMtimeMs(dir, depth = 0) {
  let newest = 0;
  if (depth > 8) {
    return newest;
  }
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return newest;
  }
  for (const e of entries) {
    if (e.name === "node_modules" || e.name.startsWith(".")) {
      continue;
    }
    const p = join(dir, e.name);
    try {
      if (e.isDirectory()) {
        newest = Math.max(newest, newestMtimeMs(p, depth + 1));
      } else if (/\.(ts|mts|js|mjs)$/.test(e.name)) {
        newest = Math.max(newest, statSync(p).mtimeMs);
      }
    } catch {
      /* unreadable entry -- skip */
    }
  }
  return newest;
}

/**
 * The same device reports two different serial strings: the USB
 * descriptor carries a SKU-flavoured prefix (ECPRO-…) while the guard
 * binds the on-chip identity (ENCLW-…). The digits after the prefix are
 * the device. Comparing raw strings reported a bound, CLEAN accreditor
 * as "NOT bound".
 */
function normalizeSerial(serial) {
  return String(serial ?? "")
    .trim()
    .toUpperCase()
    .replace(/^[A-Z]+-/, "");
}

function enclawederStatus() {
  const required = ["required", "1", "true"].includes(process.env.ENCLAWEDER_ROOT ?? "");
  const devices = [];
  let backend = "none";
  let note = null;

  if (platform() === "linux") {
    backend = "hidraw";
    try {
      for (const hd of readdirSync("/sys/class/hidraw")) {
        try {
          const raw = readFileSync(`/sys/class/hidraw/${hd}/device/uevent`, "utf8");
          if (!/00001209/i.test(raw) || !/0000E100/i.test(raw)) {
            continue;
          }
          const field = (k) => (new RegExp(`^${k}=(.*)$`, "m").exec(raw) ?? [])[1] ?? null;
          devices.push({ path: `/dev/${hd}`, model: field("HID_NAME"), serial: field("HID_UNIQ") });
        } catch {
          /* unreadable node -- skip */
        }
      }
    } catch {
      note = "no hidraw subsystem";
    }
    devices.sort((a, b) => Number(a.path.replace(/\D+/g, "")) - Number(b.path.replace(/\D+/g, "")));
  } else {
    // macOS/Windows reach HID through hidapi. Enumeration alone yields
    // the model and serial the device advertises, so status never has to
    // open the device or speak its protocol to report them.
    let hid = null;
    try {
      hid = createRequire(import.meta.url)("node-hid");
      backend = "node-hid";
    } catch (err) {
      return (
        `node-hid unavailable (${(err && err.code) || "load failed"}) — cannot see the ` +
        `device on ${platform()}; enclawed runs software-only. Re-run the installer to build it.`
      );
    }
    try {
      for (const d of hid.devices()) {
        if (d.vendorId === 0x1209 && d.productId === 0xe100) {
          devices.push({
            path: d.path ?? "(unknown)",
            model: [d.manufacturer, d.product].filter(Boolean).join(" ") || null,
            serial: d.serialNumber || null,
          });
        }
      }
    } catch (err) {
      return `node-hid enumeration failed (${(err && err.message) || err}); running software-only`;
    }
  }

  // Whether enclawed actually BOUND a device is a different question from
  // whether one is plugged in: the guard persists its state, so read that
  // rather than inferring from presence. Fleet deployments write one file
  // per member, hence the glob rather than a single path.
  const bound = new Map();
  try {
    const home = homedir();
    for (const f of readdirSync(home)) {
      if (!/^\.enclawed-hw-root(\.\d+)?\.state$/.test(f)) {
        continue;
      }
      try {
        const st = JSON.parse(readFileSync(join(home, f), "utf8"));
        if (st?.bound?.serial) {
          bound.set(normalizeSerial(st.bound.serial), st.status ?? "UNKNOWN");
        }
      } catch {
        /* unreadable or malformed state -- ignore */
      }
    }
  } catch {
    /* no home listing -- treat as unbound */
  }

  if (devices.length === 0) {
    const why = note ? `${note}; ` : "";
    return required
      ? `${why}NONE PRESENT but ENCLAWEDER_ROOT is required — enclawed will refuse to boot`
      : `${why}none present — enclawed runs software-only ` +
          `(set ENCLAWEDER_ROOT=required to enforce)`;
  }

  const lines = [
    // "not enforced" was wrong and alarming: a detected device is
    // MANDATORY from bind onward -- every gated call is checked against
    // it and unplugging latches a DIRTY halt. ENCLAWEDER_ROOT governs
    // only what happens when NO device is present at boot, which is a
    // separate question from whether the attached one is enforcing.
    `${devices.length} device(s) via ${backend}`,
  ];
  // State the absence policy separately, since that is what the env var
  // actually controls.
  lines.push(
    required
      ? "        if absent at boot: refuse to start (ENCLAWEDER_ROOT=required)"
      : bound.size > 0
        ? "        if absent at boot: refuse to start (a device is bound to this host)"
        : "        if absent at boot: run software-only (nothing bound yet)",
  );
  for (const [i, d] of devices.entries()) {
    const serial = d.serial ?? "(serial not advertised)";
    const status = d.serial ? bound.get(normalizeSerial(d.serial)) : undefined;
    const use = status
      ? `provisioned, bound and ENFORCING (${status}) — accreditation requires this device`
      : bound.size > 0
        ? "present, NOT bound by enclawed"
        : "present, not bound (no hardware root in use)";
    lines.push(`    [${i}] ${d.model ?? "Enclaweder"}`);
    lines.push(`        serial ${serial}`);
    lines.push(`        ${use}  ${d.path}`);
  }
  return lines.join("\n");
}

function locateExecutable(name) {
  try {
    // stderr is discarded: a miss is an ordinary outcome here (we probe
    // several candidates), but Windows `where` announces it as
    // "INFO: Could not find files for the given pattern(s)." on stderr,
    // which reads like a failure in the middle of a successful install.
    const out = execFileSync(WHICH, [name], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
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

// Single keyring account that stores ALL operator-identity addresses
// for the executive assistant as a JSON blob: {mailbox, principal, aliases[]}.
// Replaces the older per-field accounts (`principal-email:<mailbox>`,
// `principal-aliases:<mailbox>`) and removes mailbox from .env — every
// operator-identity address now lives only in the OS keyring,
// encrypted at rest. Mailbox stays the keyring-account key for the
// app-specific password (and brave-search-api-key), so the launcher's
// first task is to fetch THIS blob, parse it, then proceed with the
// per-mailbox secret fetches.
const IDENTITIES_KEYRING_ACCOUNT = "executive-assistant-identities";

// Direct-spawn keyring helpers usable BEFORE the `keyring` wrapper is
// built at line ~835 (the prompt section runs first and needs to read
// any prior identities-blob to pre-fill defaults).
function directKeyringGet(appDirArg, configIdArg, account) {
  try {
    const helperPath = join(appDirArg, "bin", "keyring.mjs");
    if (!existsSync(helperPath)) {
      return "";
    }
    const r = spawnSync(
      process.execPath,
      [helperPath, "get", "--service", `enclawed-${configIdArg}`, "--account", account],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    return r.status === 0 ? (r.stdout ?? "").trim() : "";
  } catch {
    return "";
  }
}

function directKeyringSet(appDirArg, configIdArg, account, value) {
  const helperPath = join(appDirArg, "bin", "keyring.mjs");
  const r = spawnSync(
    process.execPath,
    [helperPath, "set", "--service", `enclawed-${configIdArg}`, "--account", account],
    { input: value, encoding: "utf8", stdio: ["pipe", "ignore", "inherit"] },
  );
  if (r.status !== 0) {
    throw new Error(`keyring set ${account} exited ${r.status}`);
  }
}

function directKeyringDelete(appDirArg, configIdArg, account) {
  try {
    const helperPath = join(appDirArg, "bin", "keyring.mjs");
    if (!existsSync(helperPath)) {
      return;
    }
    spawnSync(
      process.execPath,
      [helperPath, "delete", "--service", `enclawed-${configIdArg}`, "--account", account],
      { stdio: "ignore" },
    );
  } catch {
    // best-effort
  }
}

// Read+parse the identities JSON blob from the keyring. Returns
// {mailbox, principal, aliases} (with sensible defaults) or null if
// the blob is missing or unparseable.
function readIdentitiesBlob(appDirArg, configIdArg) {
  const raw = directKeyringGet(appDirArg, configIdArg, IDENTITIES_KEYRING_ACCOUNT);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    return {
      mailbox: typeof parsed.mailbox === "string" ? parsed.mailbox : "",
      principal: typeof parsed.principal === "string" ? parsed.principal : "",
      aliases: Array.isArray(parsed.aliases)
        ? parsed.aliases.filter((s) => typeof s === "string" && s.length > 0)
        : [],
    };
  } catch {
    return null;
  }
}

function writeIdentitiesBlob(appDirArg, configIdArg, identities) {
  const payload = JSON.stringify({
    mailbox: identities.mailbox,
    principal: identities.principal || "",
    aliases: identities.aliases || [],
  });
  directKeyringSet(appDirArg, configIdArg, IDENTITIES_KEYRING_ACCOUNT, payload);
}

// Scrub the legacy plaintext mailbox/principal/aliases lines from a
// generated .env file. Used by both install (after writing identities
// to the keyring) and runUpdate (auto-migrating older installs).
function scrubIdentitiesFromEnvFile(p) {
  if (!existsSync(p)) {
    return;
  }
  const drop = new Set([
    "ENCLAWED_EXECUTIVE_ASSISTANT_MAILBOX_EMAIL",
    "ENCLAWED_EXECUTIVE_ASSISTANT_PRINCIPAL_EMAIL",
    "ENCLAWED_EXECUTIVE_ASSISTANT_PRINCIPAL_ALIASES",
  ]);
  const lines = readFileSync(p, "utf8").split(/\r?\n/);
  const out = [];
  let touched = false;
  for (const raw of lines) {
    const trimmed = raw.trim();
    const eq = trimmed.indexOf("=");
    if (eq < 0) {
      out.push(raw);
      continue;
    }
    let key = trimmed.slice(0, eq).trim();
    if (key.startsWith("export ")) {
      key = key.slice(7).trim();
    }
    if (drop.has(key)) {
      touched = true;
      continue;
    }
    out.push(raw);
  }
  if (touched) {
    writeFileSync(p, out.join("\n").replace(/\n+$/, "") + "\n", "utf8");
  }
}

// Resolve the executive assistant's mailbox identity from an env-file dict,
// accepting both the new ENCLAWED_EXECUTIVE_ASSISTANT_MAILBOX_EMAIL and the
// legacy ENCLAWED_EXECUTIVE_ASSISTANT_PRINCIPAL_EMAIL (which, before the
// principal/mailbox split, held the mailbox value). Returns the
// resolved address or null.
function resolveMailboxFromEnv(env) {
  if (!env) {
    return null;
  }
  return (
    env["ENCLAWED_EXECUTIVE_ASSISTANT_MAILBOX_EMAIL"] ??
    env["ENCLAWED_EXECUTIVE_ASSISTANT_PRINCIPAL_EMAIL"] ??
    null
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

/**
 * Re-merge maintainer-controlled keys (app.config.json's
 * service.extraEnv) into the .env file in place. Existing user-prompted
 * keys (mailbox, principal, etc.) are preserved verbatim — only the
 * keys listed in `extraEnv` are overwritten / inserted. Used by
 * runUpdate so security defaults shipped in the OSS tree (flavor,
 * FIPS requirement) reach the next service start without forcing a
 * full re-install.
 */
function refreshExtraEnvInEnvFile(p, extraEnv) {
  if (!existsSync(p) || Object.keys(extraEnv).length === 0) {
    return;
  }
  const lines = readFileSync(p, "utf8").split(/\r?\n/);
  const keysToReplace = new Set(Object.keys(extraEnv));
  const seen = new Set();
  const out = [];
  for (const raw of lines) {
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      out.push(raw);
      continue;
    }
    const eq = trimmed.indexOf("=");
    if (eq < 0) {
      out.push(raw);
      continue;
    }
    let key = trimmed.slice(0, eq).trim();
    if (key.startsWith("export ")) {
      key = key.slice(7).trim();
    }
    if (keysToReplace.has(key)) {
      const v = String(extraEnv[key]).replace(/"/g, '\\"');
      out.push(`export ${key}="${v}"`);
      seen.add(key);
      continue;
    }
    out.push(raw);
  }
  for (const key of keysToReplace) {
    if (!seen.has(key)) {
      const v = String(extraEnv[key]).replace(/"/g, '\\"');
      out.push(`export ${key}="${v}"`);
    }
  }
  writeFileSync(p, out.join("\n").replace(/\n+$/, "") + "\n", "utf8");
  ok(`Refreshed maintainer env keys in ${p}: ${[...keysToReplace].join(", ")}`);
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
if (adversarialGateOnly) {
  await runAdversarialGate({ exitOnFailure: true });
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
    // windowsHide keeps each dispatch from flashing its own console
    // window. Without it a long install is a stream of windows opening
    // and closing, and any error text scrolls past in a window that is
    // already gone. The child still inherits our stdio, so output lands
    // in the operator's terminal either way.
    return execSync(cmdline, { windowsHide: true, ...opts, shell: true });
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
// bundled extensions (Discord, Matrix, sharp, llama-cpp). The executive assistant
// app doesn't load any of them, but their postinstall scripts try to
// native-compile and fail without Visual Studio Build Tools on Windows.
// The app runtime is otherwise pure JS / TS + node:crypto + fetch, so
// skipping the build scripts is safe here — with exactly one exception,
// handled immediately below.
runExe(pnpmPath, ["install", "--prefer-offline", "--ignore-scripts"], {
  cwd: repoRoot,
  stdio: "inherit",
});
ok("Workspace linked.");

// The one native module the app actually loads: node-hid, which backs
// the enclaweder hardware root on macOS and Windows (Linux drives the
// device through /dev/hidraw and needs nothing native). --ignore-scripts
// above leaves it unbuilt, and an unbuilt node-hid fails to require,
// which would silently downgrade the hardware trust anchor to
// software-only — the precise failure this backend exists to remove.
// Rebuild just that one package rather than relaxing the global script
// policy: every other native dep stays unbuilt.
if (platform() !== "linux") {
  try {
    runExe(pnpmPath, ["rebuild", "node-hid"], { cwd: repoRoot, stdio: "inherit" });
    ok("node-hid built (enclaweder hardware root available on this platform).");
  } catch (err) {
    warn(
      `node-hid could not be built (${(err && err.message) || err}).\n` +
        `  The enclaweder cannot be driven on this platform; the app will run software-only.\n` +
        `  Re-run after installing the platform build tools if you intend to use the hardware root.`,
    );
  }
}

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
  // Stage-0 semantic prompt-injection classifier (few-shot-classifier.ts)
  // runs on a separate, smaller model with a hard 5s budget per call —
  // a 32B reply model times out at that budget. The 7B–8B class is the
  // right scale.
  if (config.llm.classifierModel && config.llm.classifierModel !== config.llm.model) {
    runExe(ollamaPath, ["pull", config.llm.classifierModel], { stdio: "inherit" });
    ok(`Classifier model ${config.llm.classifierModel} ready.`);
  }
  // Ollama auto-detects CUDA / ROCm / Metal but silently falls back to
  // CPU if drivers are stale, VRAM is too small for the model, or the
  // WSL2 NVIDIA bridge is missing. Probe with a single-token inference
  // so the model loads, then read `ollama ps` and report the processor
  // split. Best-effort: any failure here just skips the report.
  probeOllamaGpu(ollamaPath, config.llm.model);
}

// 2.5) Adversarial gate — run the prompt-injection shield self-tests
//      BEFORE we ask the operator for credentials. If the shield is
//      broken we want them to abort now, not after they have typed an
//      app password and TZ. Both the regex test (no network) and the
//      classifier test (requires Ollama + the classifier model, which
//      were both readied in step 2) are exercised here. Failure exits
//      non-zero with the contact email; the operator can re-run
//      standalone via `install.mjs <app> --adversarial-gate`.
await runAdversarialGate({ exitOnFailure: true });

// 3) Two distinct identities — the executive assistant's mailbox (where it
//    signs in over IMAP/SMTP) and the principal (the human who
//    administrates this install). They were conflated as a single
//    "principal" field in earlier versions; this caused HITL replies
//    to be silently dropped when the operator's reply identity
//    differed from the mailbox the executive assistant signed in to.
//
//    Naming after the rename:
//      mailbox   = service account / IMAP-SMTP credentials
//                  (env var: ENCLAWED_EXECUTIVE_ASSISTANT_MAILBOX_EMAIL)
//      principal = human administrator
//                  (env var: ENCLAWED_EXECUTIVE_ASSISTANT_PRINCIPAL_EMAIL —
//                   stored in the OS keyring, never in .env)
//
//    Backwards compat for re-installs: when the .env from a prior
//    install only has ENCLAWED_EXECUTIVE_ASSISTANT_PRINCIPAL_EMAIL (the old
//    misnamed mailbox), surface its value as the candidate for the
//    new "mailbox" prompt — operator confirms or replaces it.
const existingEnv = readExistingEnv(envPath);
const mailboxConfig = config.mailbox ?? config.principal;
const mailboxVar = mailboxConfig.envVar;
const existingMailbox =
  existingEnv?.[mailboxVar] ?? existingEnv?.["ENCLAWED_EXECUTIVE_ASSISTANT_PRINCIPAL_EMAIL"];

let mailbox;
header("Executive Assistant mailbox");
console.log(`The address the executive assistant itself signs in to over IMAP/SMTP — its mailbox.`);
console.log(`This is NOT your personal address. Use a dedicated account if you can`);
console.log(
  `(e.g. yourname-executive assistant@gmail.com) so the executive assistant's traffic is`,
);
console.log(`isolated from your own mail.`);
if (existingMailbox && PRINCIPAL_EMAIL_RE.test(existingMailbox)) {
  const reuse = (await ask(`Reuse executive assistant mailbox ${existingMailbox}? [Y/n] `))
    .trim()
    .toLowerCase();
  mailbox = reuse === "n" || reuse === "no" ? "" : existingMailbox;
}
while (!mailbox) {
  const raw = (await ask(`Executive Assistant mailbox email: `)).trim();
  if (PRINCIPAL_EMAIL_RE.test(raw)) {
    mailbox = raw;
    break;
  }
  fail(`"${raw}" is not a valid email address. Try again.`);
}

// principal = the human authorized to administrate this executive assistant.
// Used by the HITL email broker for matching incoming approvals.
// Stored in the OS keyring (encrypted at rest), never in .env.
const principalConfig = config.principal;
const principalVar = principalConfig?.envVar ?? "ENCLAWED_EXECUTIVE_ASSISTANT_PRINCIPAL_EMAIL";
let principal;
header("Principal");
console.log(`YOUR personal email address — the human authorized to administrate`);
console.log(`this executive assistant. The HITL approval emails will be sent here and the`);
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
// Prefer the unified identities-blob if present; otherwise fall back
// to the legacy per-field account so existing installs still pre-fill
// the right default at the prompt.
let existingPrincipalFromKeyring = "";
const existingIdentitiesBlob = readIdentitiesBlob(appDir, config.id);
if (existingIdentitiesBlob?.principal) {
  existingPrincipalFromKeyring = existingIdentitiesBlob.principal;
} else {
  existingPrincipalFromKeyring = directKeyringGet(appDir, config.id, `principal-email:${mailbox}`);
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
  console.log(`Defaults to the executive assistant mailbox itself (self-admin install).`);
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

// 3b) Principal aliases — additional addresses the operator also
//     considers "themselves" (typical: alfredo@enclawed.com is the
//     registered principal, but they sometimes email the executive assistant
//     from alfredo@metereconsulting.com too). Without this list the
//     broker's principal-authored carve-out misses those emails and
//     every update / delete from an alias falls into HITL keypress.
//     Stored comma-separated in the OS keyring under a distinct
//     account namespace inside the same service.
header("Principal aliases (optional)");
// Existing aliases candidates: prefer the unified identities-blob;
// fall back to the legacy `principal-aliases:<mailbox>` account.
let existingAliases = existingIdentitiesBlob?.aliases?.join(",") ?? "";
if (!existingAliases) {
  existingAliases = directKeyringGet(appDir, config.id, `principal-aliases:${mailbox}`);
}
let principalAliases = "";
if (existingAliases.length > 0) {
  const reuse = (await ask(`Reuse stored principal aliases (${existingAliases})? [Y/n] `))
    .trim()
    .toLowerCase();
  if (reuse !== "n" && reuse !== "no") {
    principalAliases = existingAliases;
  }
}
if (!principalAliases) {
  console.log(`Other email addresses YOU consider principal-equivalent (e.g. a personal company`);
  console.log(
    `address you also email the executive assistant from). Comma-separated. Leave blank to skip;`,
  );
  console.log(`only ${principal} will be treated as principal.`);
  const raw = (await ask(`Principal aliases (comma-separated, optional): `)).trim();
  if (raw.length > 0) {
    const candidates = raw
      .split(",")
      .map((s) => s.toLowerCase().trim())
      .filter((s) => s.length > 0);
    const valid = [];
    for (const c of candidates) {
      if (PRINCIPAL_EMAIL_RE.test(c) && c !== principal && c !== mailbox.toLowerCase()) {
        valid.push(c);
      } else if (!PRINCIPAL_EMAIL_RE.test(c)) {
        warn(`"${c}" is not a valid email address — skipping.`);
      }
      // Same-as-principal / same-as-mailbox: silently dedupe.
    }
    principalAliases = valid.join(",");
  }
}
// Individual keyring writes for aliases are no longer done here — the
// unified `executive-assistant-identities` JSON blob below carries every
// operator-identity address in one encrypted-at-rest record.

// 3a) Persona — display name + custom system prompt baked at install
//     time. Set once, frozen at service boot. The runtime never
//     re-reads these from disk after the daily-loop starts, so a
//     prompt-injection attempt buried in an inbound email body
//     cannot rewrite the executive assistant's identity at runtime — the only
//     way to change either field is to re-run the installer
//     (which requires write access to ~/.enclawed and the OS keyring,
//     i.e. the same surface that holds the credentials themselves).
header("Persona");
const personaConfig = config.persona ?? {};
const displayNameVar =
  personaConfig.displayNameEnvVar ?? "ENCLAWED_EXECUTIVE_ASSISTANT_DISPLAY_NAME";
const systemPromptVar =
  personaConfig.systemPromptEnvVar ?? "ENCLAWED_EXECUTIVE_ASSISTANT_SYSTEM_PROMPT";
const defaultDisplayName = personaConfig.defaultDisplayName ?? "Executive Assistant";
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
    await ask(
      `What name should the executive assistant use in outgoing replies? [${defaultDisplayName}]: `,
    )
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
  console.log(`In ONE sentence, how should the executive assistant behave?`);
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
//        "Europe/Rome", "Asia/Tokyo") the executive assistant uses to interpret
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
  console.log(
    `The executive assistant uses this time zone to interpret relative dates in inbound mail.`,
  );
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
const inboxPollVar = "ENCLAWED_EXECUTIVE_ASSISTANT_INBOX_POLL_MS";
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
  console.log(`How often should the executive assistant check Gmail for new mail? Faster = more`);
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

// 3a-bis) Hardware root policy. This only governs what happens when NO
//     enclaweder is present at boot: a device that IS present is always
//     bound and always enforced, and a session accredited by one always
//     refuses to continue without it. The choice here is whether a host
//     with no device may start at all.
const enclawederRootVar = "ENCLAWEDER_ROOT";
const existingEnclawederRoot = existingEnv?.[enclawederRootVar];
let enclawederRoot = "";
if (existingEnclawederRoot !== undefined) {
  const reuse = (await ask(`Reuse hardware-root policy "${existingEnclawederRoot}"? [Y/n] `))
    .trim()
    .toLowerCase();
  if (reuse !== "n" && reuse !== "no") {
    enclawederRoot = existingEnclawederRoot;
  }
}
while (!enclawederRoot) {
  console.log("");
  console.log("Hardware root of trust (enclaweder). A connected device is always used and");
  console.log("always enforced; this setting decides what happens when none is connected:");
  console.log("");
  console.log("  required  refuse to start without an enclaweder (strictest)");
  console.log("  default   start software-only, unless resuming a session that had one");
  console.log("  optional  always allow software-only, even resuming such a session");
  console.log("");
  const raw = (await ask(`Hardware-root policy [default]: `)).trim().toLowerCase();
  const v = raw.length > 0 ? raw : "default";
  if (!["required", "default", "optional"].includes(v)) {
    fail(`"${v}" must be one of: required, default, optional.`);
    continue;
  }
  // "default" is the absence of the variable: the boot path already
  // treats unset as "software-only unless a session is open", so
  // writing a literal "default" would be a value the runtime does not
  // recognise.
  enclawederRoot = v;
}
ok(
  enclawederRoot === "default"
    ? `Hardware-root policy: start software-only when no enclaweder is present.`
    : `Hardware-root policy set to ${enclawederRoot}.`,
);

// 3b) Approval channel — picks how the bicriterion broker prompts the
//     principal when keypress is required (sensitive draft, calendar
//     write, anything that fails the auto-approve criterion). Choices:
//       auto   — stdin if a TTY is attached at start, else dialog
//       dialog — platform-native modal (Windows MessageBox / osascript
//                / zenity)
//       email  — executive assistant self-emails the principal and waits for a
//                YES/NO reply (away-from-keyboard / mobile use case)
//       stdin  — in-terminal keypress (only sane when the user runs
//                the app interactively)
//     The choice is baked into the .env so the launcher reads it
//     without any CLI args.
header("Approval channel (HITL)");
const hitlChannelVar = "ENCLAWED_EXECUTIVE_ASSISTANT_HITL_CHANNEL";
const hitlEmailTimeoutVar = "ENCLAWED_EXECUTIVE_ASSISTANT_HITL_EMAIL_TIMEOUT_MIN";
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
  console.log(
    `When the executive assistant asks for your approval (sensitive drafts, calendar writes),`,
  );
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
// script that can talk to @napi-rs/keyring; for the executive assistant this
// lives at enclawed-apps/<id>/bin/keyring.mjs. Wrap it in get/set/
// delete closures the provider and the post-install path can call.
const keyringHelper = join(appDir, "bin", "keyring.mjs");
const keyringService = providerModule.keyringService?.(config.id) ?? `enclawed-${config.id}`;
const keyring = providerModule.usesKeyring
  ? buildKeyring({ helperPath: keyringHelper, service: keyringService })
  : null;

// Second half of the secretary -> executive-assistant migration: the
// secrets. These are keyed by SERVICE name, so a renamed app cannot see
// what the old one stored and would re-prompt for an app password the
// operator already provided. Copy each entry across, then delete the
// original so one authority holds it. Best-effort: on any failure the
// old entries are left untouched and the install falls back to asking.
if (keyring && providerModule.usesKeyring) {
  const legacyService =
    providerModule.keyringService?.(LEGACY_APP_ID) ?? `enclawed-${LEGACY_APP_ID}`;
  if (legacyService !== keyringService) {
    try {
      const legacy = buildKeyring({ helperPath: keyringHelper, service: legacyService });
      // The identities blob names the mailbox, and the mailbox is the
      // account name the app password is stored under, so it has to be
      // read first.
      const legacyIdentitiesAccount = `${LEGACY_APP_ID}-identities`;
      const identitiesAccount = `${config.id}-identities`;
      const movedAccounts = [];
      const identitiesBlob = legacy.get({ account: legacyIdentitiesAccount });
      if (identitiesBlob && !keyring.get({ account: identitiesAccount })) {
        keyring.set({ account: identitiesAccount, secret: identitiesBlob });
        movedAccounts.push(legacyIdentitiesAccount);
        let legacyMailbox = null;
        try {
          legacyMailbox = JSON.parse(identitiesBlob)?.mailbox ?? null;
        } catch {
          /* not JSON -- nothing further to migrate */
        }
        if (legacyMailbox) {
          const secret = legacy.get({ account: legacyMailbox });
          if (secret && !keyring.get({ account: legacyMailbox })) {
            keyring.set({ account: legacyMailbox, secret });
            movedAccounts.push(legacyMailbox);
          }
        }
      }
      for (const account of movedAccounts) {
        try {
          legacy.delete({ account });
        } catch {
          /* leaving a stale entry is harmless; failing the install is not */
        }
      }
      if (movedAccounts.length > 0) {
        ok(`Migrated ${movedAccounts.length} keyring entr(y/ies) to service=${keyringService}.`);
      }
    } catch (err) {
      warn(
        `Could not migrate keyring entries from ${legacyService}: ${(err && err.message) || err}.\n` +
          `  You will be asked for the app password again; the old entries were left in place.`,
      );
    }
  }
}

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

// Brave Search API key — optional, per-install opt-in. The web_search
// tool turns on only when the operator supplies one; otherwise the
// schema is filtered so the LLM can't call it.
header("Web search (optional)");
const BRAVE_SEARCH_ACCOUNT = `brave-search-api-key:${mailbox}`;
let braveSearchKey = "";
if (keyring) {
  try {
    braveSearchKey = keyring.get({ account: BRAVE_SEARCH_ACCOUNT }) || "";
  } catch {
    braveSearchKey = "";
  }
}
const reuseBrave =
  braveSearchKey.length > 0
    ? await ask(
        `Reuse stored Brave Search API key (last 4 chars: ${braveSearchKey.slice(-4)})? [Y/n] `,
      )
    : "";
if (reuseBrave && /^n/i.test(reuseBrave.trim())) {
  braveSearchKey = "";
}
if (!braveSearchKey) {
  console.log("Enclawed can call Brave Search from the executive assistant's tool loop to look up");
  console.log("addresses, business hours, and similar facts the LLM weaves into replies.");
  console.log("Leave blank to skip — the web_search tool stays disabled.");
  console.log("Get a key (free tier available): https://brave.com/search/api/");
  const entered = await askSecret("Brave Search API key (paste, then Enter): ");
  braveSearchKey = (entered ?? "").trim();
}
if (keyring && braveSearchKey.length > 0) {
  try {
    keyring.set({ account: BRAVE_SEARCH_ACCOUNT, secret: braveSearchKey });
    ok("Brave Search API key stored in the OS keyring; web_search tool enabled.");
  } catch (err) {
    fail(
      `Could not write the Brave Search API key to the keyring (${(err && err.message) || err}).\n` +
        `  web_search tool will stay disabled until the keyring write succeeds.`,
    );
    braveSearchKey = "";
  }
} else if (keyring && braveSearchKey.length === 0) {
  // Clear any prior entry from a previous install.
  try {
    keyring.delete({ account: BRAVE_SEARCH_ACCOUNT });
  } catch {
    // best effort
  }
  ok("Skipping web search — executive assistant will run without it.");
}

// All operator-identity addresses (mailbox, principal, aliases) go
// into ONE keyring blob — `executive-assistant-identities` — as JSON. Replaces
// the older per-field accounts. Encrypted at rest, never written to
// .env. Legacy per-field accounts are cleaned up so they don't
// outlive the migration.
const principalDiffersFromMailbox = principal !== mailbox.toLowerCase();
if (keyring) {
  try {
    writeIdentitiesBlob(appDir, config.id, {
      mailbox,
      principal: principalDiffersFromMailbox ? principal : "",
      aliases: principalAliases ? principalAliases.split(",").filter((s) => s.length > 0) : [],
    });
    ok(
      `Operator identities stored in OS keyring (encrypted JSON: executive-assistant-identities).`,
    );
  } catch (err) {
    fail(
      `Could not write operator identities to the keyring (${(err && err.message) || err}).\n` +
        `  HITL replies will fall back to mailbox-only matching.`,
    );
  }
  // Clean up legacy per-field accounts (and the older hitl-reply-from
  // entry) so the blob is the only place these addresses live.
  directKeyringDelete(appDir, config.id, `principal-email:${mailbox}`);
  directKeyringDelete(appDir, config.id, `principal-aliases:${mailbox}`);
  directKeyringDelete(appDir, config.id, `hitl-reply-from:${mailbox}`);
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
  // mailbox / principal / aliases intentionally NOT here — they live
  // in the OS keyring under the `executive-assistant-identities` JSON blob and
  // are restored to env at launcher start. See feedback rule
  // "no emails in .env".
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
  // Only written when it changes behaviour; "default" is the unset case.
  ...(enclawederRoot && enclawederRoot !== "default"
    ? { [enclawederRootVar]: enclawederRoot }
    : {}),
  ...providerEnv,
  ...(config.service?.extraEnv ? config.service.extraEnv : {}),
  ...(config.llm?.type === "ollama" ? { OLLAMA_MODEL: config.llm.model } : {}),
  ...(config.llm?.type === "ollama" && config.llm.classifierModel
    ? { ENCLAWED_EXECUTIVE_ASSISTANT_CLASSIFIER_MODEL: config.llm.classifierModel }
    : {}),
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
    // The app-password keyring entry is keyed under the MAILBOX
    // email. The launcher restores mailbox into env from the
    // identities-blob below, THEN uses that env value as the account
    // for the password fetch.
    keyringAccountEnvVar: keyring ? mailboxVar : "",
    // Unified identities blob: a single keyring entry holding
    // {mailbox, principal, aliases}. Launcher reads it FIRST so the
    // env vars are present for every subsequent fetch + the runtime.
    identitiesAccount: keyring ? IDENTITIES_KEYRING_ACCOUNT : "",
    mailboxEnvVar: keyring ? mailboxVar : "",
    principalEnvVar: keyring ? principalVar : "",
    aliasesEnvVar: keyring ? "ENCLAWED_EXECUTIVE_ASSISTANT_PRINCIPAL_ALIASES" : "",
    // Brave Search API key: keyring account + env var the runtime reads
    // (runApp.ts gates the web_search tool on this env var being non-empty).
    braveSearchAccount: braveSearchKey.length > 0 ? BRAVE_SEARCH_ACCOUNT : "",
    braveSearchEnvVar: braveSearchKey.length > 0 ? "BRAVE_SEARCH_API_KEY" : "",
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
// new launcher and pulled a new model but the running executive assistant
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
  console.log(`Review or change settings (no reinstall, keeps credentials):`);
  console.log(`  Set-EnclawedAppSettings ${config.id}`);
  console.log(`  Set-EnclawedAppSettings ${config.id} -List`);
  console.log(`Update to the latest code and restart:`);
  console.log(`  Update-EnclawedApp ${config.id}`);
  console.log(`Uninstall (wipes service, env, audit log, keyring entry):`);
  console.log(`  Uninstall-EnclawedApp ${config.id}`);
  console.log(``);
  console.log(`Every command, any time:`);
  console.log(`  Get-EnclawedHelp`);
  console.log(``);
  console.log(`(install.ps1 registers itself in your PowerShell profile, so the verb`);
  console.log(` commands above are auto-loaded in every new shell. If a future shell`);
  console.log(` reports them missing — e.g. on a different host or after profile reset —`);
  console.log(` re-source via:  irm https://www.enclawed.com/enclawed-apps/install.ps1 | iex)`);
} else {
  console.log(`Check status:`);
  console.log(`  node ${installScript} ${config.id} --status`);
  console.log(`Stop the service (keeps credentials + audit log):`);
  console.log(`  node ${installScript} ${config.id} --stop`);
  console.log(`Start it again:`);
  console.log(`  node ${installScript} ${config.id} --start`);
  console.log(`Review or change settings (no reinstall, keeps credentials):`);
  console.log(`  node ${join(here, "settings.mjs")} ${config.id}`);
  console.log(`Update to the latest code and restart:`);
  console.log(`  node ${installScript} ${config.id} --update`);
  console.log(`Uninstall (wipes service, env, audit log, keyring entry):`);
  console.log(`  node ${installScript} ${config.id} --uninstall`);
  console.log(``);
  console.log(`Every command, any time:`);
  console.log(`  node ${installScript} --help`);
}

// ────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────

// Diagnostic snapshot of the service: is it loaded? is the env file
// present? is the keyring entry present? how big is the audit log?
// what are the last few lines of the service log? Together that
// answers "the executive assistant is not running" without forcing the user
// to remember 4 different platform commands.
// Reading a whole log into a string is how `status` got killed in the field.
//
// Node caps a string at about 512MB (0x1fffffe8 chars). The assistant appends
// to audit.jsonl on every message and nothing rotates it, so on a busy mailbox
// the file crosses that line and readFileSync throws ERR_STRING_TOO_LONG --
// taking down the one command an operator runs to find out whether anything is
// wrong. The status command must survive any file size, because a file large
// enough to break it is itself the thing worth reporting.

function humanBytes(n) {
  if (n < 1024) {
    return `${n} B`;
  }
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

/**
 * Read only the last `maxBytes` of a file.
 *
 * The leading partial line is dropped, so callers never see half a record.
 * Returns `truncated` so the caller can say so rather than quietly showing a
 * tail as if it were the whole file.
 */
function readTailUtf8(path, maxBytes = LOG_TAIL_BYTES) {
  const size = statSync(path).size;
  if (size <= maxBytes) {
    return { text: readFileSync(path, "utf8"), truncated: false, size };
  }
  const fd = openSync(path, "r");
  try {
    const buf = Buffer.allocUnsafe(maxBytes);
    readSync(fd, buf, 0, maxBytes, size - maxBytes);
    const text = buf.toString("utf8");
    const nl = text.indexOf("\n");
    return { text: nl >= 0 ? text.slice(nl + 1) : text, truncated: true, size };
  } finally {
    closeSync(fd);
  }
}

/**
 * Count records in a JSONL file without holding it in memory.
 *
 * Counts newlines in fixed-size chunks, plus a final unterminated line if the
 * file does not end in one. A blank line would be counted, but the audit
 * writer never emits them.
 */
function countLinesStreaming(path) {
  const size = statSync(path).size;
  if (size === 0) {
    return { count: 0, size };
  }
  const fd = openSync(path, "r");
  try {
    const buf = Buffer.allocUnsafe(1024 * 1024);
    let count = 0;
    let read = 0;
    let lastByte = 0x0a;
    while ((read = readSync(fd, buf, 0, buf.length, null)) > 0) {
      for (let i = 0; i < read; i++) {
        if (buf[i] === 0x0a) {
          count++;
        }
      }
      lastByte = buf[read - 1];
    }
    if (lastByte !== 0x0a) {
      count++;
    }
    return { count, size };
  } finally {
    closeSync(fd);
  }
}

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
  {
    const health = healthSummary({
      logPath,
      auditPath: join(envDir, "audit.jsonl"),
      serviceState,
    });
    console.log(`  Health:         ${health.verdict}`);
    for (const d of health.detail) {
      console.log(`                  ${d}`);
    }
  }

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
    const { count, size } = countLinesStreaming(auditPath);
    // Sealed segments are part of the same chain, so the honest total is all of
    // them, not just the file currently being written.
    const sealed = readdirSync(envDir)
      .filter((n) => /^audit\.\d+\.jsonl$/.test(n))
      .map((n) => join(envDir, n));
    let totalSize = size;
    let totalCount = count;
    for (const f of sealed) {
      const s = countLinesStreaming(f);
      totalSize += s.size;
      totalCount += s.count;
    }
    console.log(
      `  Audit log:      ${auditPath} (${count} record${count === 1 ? "" : "s"}, ${humanBytes(size)})`,
    );
    if (sealed.length > 0) {
      console.log(
        `                  + ${sealed.length} sealed segment${sealed.length === 1 ? "" : "s"}: ` +
          `${totalCount} records, ${humanBytes(totalSize)} total (one hash chain across all of them)`,
      );
    }
    if (totalSize >= AUDIT_SIZE_WARN_BYTES) {
      // Segments are sealed, never deleted -- discarding audit history is what
      // an attacker would want, so pruning is the operator's call, not ours.
      console.log(
        `                  NOTE: ${humanBytes(totalSize)} of audit history. Segments rotate but are never` +
          ` deleted; prune old ones deliberately if you need the space.`,
      );
    }
  } else {
    console.log(`  Audit log:      not yet created (no inbound mail processed)`);
  }

  console.log(`  enclaweder:     ${enclawederStatus()}`);

  if (existsSync(logPath)) {
    const logTail = readTailUtf8(logPath);
    const content = logTail.text;
    console.log(
      `  Service log:    ${logPath} (${humanBytes(logTail.size)}${logTail.truncated ? `, showing last ${humanBytes(LOG_TAIL_BYTES)}` : ""})`,
    );
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
    // Pull any [executive-assistant warn] lines that were emitted near the most
    // recent startup. We find the last "executive-assistant: started" boundary
    // and only consider lines AFTER it, so warns from a prior boot
    // don't bleed into the current status.
    const lastStartIdx = lines.findLastIndex((l) => /\bexecutive-assistant: started\b/.test(l));
    const sinceLastStart = lastStartIdx >= 0 ? lines.slice(lastStartIdx) : lines;
    const startupWarns = sinceLastStart
      .filter((l) => /\[executive-assistant warn\]/.test(l))
      .slice(0, 3);
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
// Adversarial gate. The executive assistant will not be started — on install or
// on update — until every component of the prompt-injection shield
// passes its own self-test. The shield is what keeps untrusted inbound
// mail from hijacking the operator's mailbox, calendar, and contacts;
// running with a broken shield is strictly worse than not running at
// all. Two suites are required to pass:
//
//   (1) Regex coverage — src/enclawed/dlp-scanner.test.ts. Asserts that
//       every payload from the internal 20-shape prompt-injection
//       catalog produces at least one critical-severity DLP finding
//       (which short-circuits to the dry
//       "Request denied" refusal in the daily loop). Pure unit test,
//       no network, runs in well under a second.
//
//   (2) Live classifier — test/enclawed/few-shot-classifier.live.test.ts.
//       Exercises the Stage-0 sandboxed LLM-as-judge against the local
//       Ollama using the configured classifier model. Covers the
//       regex-invisible cases (few-shot poison, fictional-frame, false-
//       fact authorization, classifier-self-defense canary path). Takes
//       a few seconds per case; whole suite ~5–10s.
//
// Any failure on either suite aborts the install and emits a clear
// instruction to contact alfredo.metere@enclawed.com with the full
// installer transcript. The operator can re-run the gate standalone
// via `install.mjs <app> --adversarial-gate` once the issue is fixed.
// Path the gate writes its log to. Append mode, with clear run headers,
// so an operator can review the full history of gate runs (every
// install + every update appends one block). Lives next to .env and
// audit.jsonl so the same directory ACL protects all three.
function adversarialGateLogPath() {
  return join(envDir, "adversarial-gate.log");
}

// Tee execFile output into a writable stream AND stdout/stderr. Used
// by runAdversarialGate so the operator sees vitest output live, the
// log file gets the same bytes for later audit, and stdio sequencing
// matches what they would have seen in a terminal.
//
// Windows: spawn() refuses to launch `.cmd` / `.bat` shims directly
// since the CVE-2024-27980 mitigation (Node 18.20.2 / 20.12.2 /
// 21.7.3+). pnpm on Windows resolves to pnpm.CMD via `where`, so a
// naive spawn(pnpmPath, [...]) throws EINVAL. We dispatch via
// cmd.exe /d /s /c with an explicitly quoted command line and
// windowsVerbatimArguments:true so Node passes the string through
// without further escaping. Quoting is our responsibility — inputs
// here are program-controlled paths and literal flags, never
// untrusted user input.
async function execFileTee(exe, args, opts, logStream) {
  return await new Promise((resolve) => {
    let child;
    if (platform() === "win32") {
      // Microsoft's documented form for `cmd /S /C ""…""`: the FIRST
      // and LAST quote on the line are stripped by /S, then whatever
      // is left is parsed as the actual command. If we pass the inner
      // command without an outer pair, /S strips the leading quote
      // of the pnpm.cmd path and the trailing quote of the last
      // vitest arg, breaking both — `cmd.exe` then prints "The system
      // cannot find the path specified." and exits 1. Wrapping the
      // whole line in an EXTRA pair of double quotes (the "outer"
      // pair) is what /S removes, leaving every "inner" quoted
      // segment around individual args intact.
      const inner = [quoteWinArg(exe), ...args.map(quoteWinArg)].join(" ");
      const cmdline = `"${inner}"`;
      child = spawn("cmd.exe", ["/d", "/s", "/c", cmdline], {
        windowsHide: true,
        ...opts,
        windowsVerbatimArguments: true,
      });
    } else {
      child = spawn(exe, args, opts);
    }
    if (child.stdout) {
      child.stdout.on("data", (chunk) => {
        process.stdout.write(chunk);
        logStream.write(chunk);
      });
    }
    if (child.stderr) {
      child.stderr.on("data", (chunk) => {
        process.stderr.write(chunk);
        logStream.write(chunk);
      });
    }
    child.on("error", (err) => {
      resolve({ ok: false, code: -1, error: err.message });
    });
    child.on("close", (code) => {
      resolve({ ok: code === 0, code, error: null });
    });
  });
}

async function runAdversarialGate({ exitOnFailure = true } = {}) {
  header("Adversarial gate: prompt-injection shield self-test");
  // The gate invokes vitest through scripts/run-vitest.mjs (the repo's
  // canonical wrapper). The wrapper transparently strips noisy build-
  // pipeline warnings (PLUGIN_TIMINGS) and applies the repo's standard
  // vitest spawn args. We call it directly with `node` rather than
  // through pnpm so we don't pay a second pnpm-resolution round-trip
  // per suite — pnpm IS still required because the wrapper uses
  // `pnpm exec` internally to put vitest on PATH, but it locates pnpm
  // itself via its own helper.
  const nodeExe = process.execPath;
  const runVitestScript = join(repoRoot, "scripts", "run-vitest.mjs");
  if (!existsSync(runVitestScript)) {
    fail(`scripts/run-vitest.mjs missing at ${runVitestScript}; cannot run the gate.`);
    if (exitOnFailure) {
      process.exit(2);
    }
    return false;
  }

  mkdirSync(envDir, { recursive: true });
  const logPath = adversarialGateLogPath();
  const logStream = createWriteStream(logPath, { flags: "a" });

  const baseEnv = {
    ...process.env,
    CI: "1",
  };
  const classifierModel =
    process.env.ENCLAWED_EXECUTIVE_ASSISTANT_CLASSIFIER_MODEL ??
    config.llm?.classifierModel ??
    "llama3.1:8b";

  // Run header (printed and logged): when, who, what model, what host.
  const runHeader = [
    "",
    "================================================================",
    `  Adversarial gate run — ${new Date().toISOString()}`,
    `  host:             ${hostname()}`,
    `  app:              ${config.id} (${config.name})`,
    `  classifier model: ${classifierModel}`,
    `  log path:         ${logPath}`,
    "================================================================",
    "",
    "Coverage of the prompt-injection technique catalog (20 shapes):",
    ...TWENTY_TECHNIQUES_COVERAGE.map(
      ([n, name, suites]) => `  ${n.padEnd(4)} ${name.padEnd(42)} [${suites}]`,
    ),
    "",
    "  Note on #11 (payload hidden in attachment BYTES, which no text regex can",
    "  see). Handling now differs by type:",
    "",
    "    images   re-encoded at ingest before anything interprets them — lossy",
    "             requantisation plus LSB perturbation, which destroys the low-",
    "             order bits a steganographic payload lives in. Recognition then",
    "             runs as a separate single-turn call with its own locked-down",
    "             prompt, and the description it returns is screened before it",
    "             reaches the reply model, which never sees pixels. With no",
    "             vision model configured the image is not interpreted at all.",
    "    audio    refused before any analysis; the assistant has no use for them,",
    "    video    and handing an unaudited container to a parser is the risk.",
    "    other    Same for any type outside the text/PDF/image allowlist.",
    "    PDF      only extracted TEXT reaches the model, and that text is scanned",
    "             like any other. The bytes themselves are not re-encoded, so a",
    "             payload aimed at the PDF parser is the residual surface here.",
    "",
    "  So: closed for images, closed by refusal for audio/video/other, and",
    "  tracked-not-closed for the PDF parser surface.",
    "",
  ].join("\n");
  process.stdout.write(runHeader);
  logStream.write(runHeader);

  const SUITES = [
    {
      label: "Regex coverage (Stage-1 DLP scanner)",
      argv: [runVitestScript, "run", "src/enclawed/dlp-scanner.test.ts"],
      env: baseEnv,
    },
    {
      label: "Live classifier (Stage-0 sandboxed LLM-as-judge)",
      argv: [
        runVitestScript,
        "--config",
        "test/vitest/vitest.live.config.ts",
        "run",
        "test/enclawed/few-shot-classifier.live.test.ts",
      ],
      env: {
        ...baseEnv,
        ENCLAWED_CLASSIFIER_LIVE_TEST: "1",
        ENCLAWED_EXECUTIVE_ASSISTANT_CLASSIFIER_MODEL: classifierModel,
      },
    },
  ];

  const failures = [];
  for (const suite of SUITES) {
    const suiteBanner = `\n  → ${suite.label}\n`;
    process.stdout.write(suiteBanner);
    logStream.write(suiteBanner);
    const result = await execFileTee(
      nodeExe,
      suite.argv,
      { cwd: repoRoot, env: suite.env },
      logStream,
    );
    if (result.ok) {
      const msg = `  \x1b[32m✓\x1b[0m ${suite.label}: passed\n`;
      process.stdout.write(msg);
      logStream.write(`  PASS  ${suite.label}\n`);
    } else {
      const msg = `  \x1b[31mx\x1b[0m ${suite.label}: failed (exit ${result.code})\n`;
      process.stderr.write(msg);
      logStream.write(`  FAIL  ${suite.label} (exit ${result.code})\n`);
      failures.push({ label: suite.label, error: `exit ${result.code}` });
    }
  }

  const footer = [
    "",
    `Gate result: ${failures.length === 0 ? "PASS" : "FAIL"}  (${new Date().toISOString()})`,
    "================================================================",
    "",
  ].join("\n");
  process.stdout.write(footer);
  logStream.write(footer);
  await new Promise((resolve) => logStream.end(resolve));

  if (failures.length > 0) {
    console.error("");
    console.error(
      "\x1b[1m\x1b[31m=============================================================\x1b[0m",
    );
    console.error("\x1b[1m\x1b[31m  ADVERSARIAL GATE FAILED — install/update aborted.\x1b[0m");
    console.error(
      "\x1b[1m\x1b[31m=============================================================\x1b[0m",
    );
    console.error("");
    console.error("  One or more components of the executive assistant's prompt-injection");
    console.error("  shield did NOT pass its self-test. The executive assistant will not be");
    console.error("  started in this state — a broken shield is strictly worse");
    console.error("  than no executive assistant at all, because inbound mail can hijack");
    console.error("  your mailbox, calendar, and contacts.");
    console.error("");
    console.error("  Failed suite(s):");
    for (const f of failures) {
      console.error(`    • ${f.label}`);
    }
    console.error("");
    console.error("  Please contact:");
    console.error("    \x1b[1malfredo.metere@enclawed.com\x1b[0m");
    console.error("");
    console.error("  Full transcript of this gate run was written to:");
    console.error(`    ${logPath}`);
    console.error("  Attach that file to your message. After Alfredo confirms a");
    console.error("  fix, re-run the gate standalone with:");
    console.error(`    node enclawed-apps/install.mjs ${config.id} --adversarial-gate`);
    console.error("");
    if (exitOnFailure) {
      process.exit(2);
    }
    return false;
  }
  ok("All adversarial-gate suites passed — shield is healthy.");
  ok(`Full transcript written to ${logPath}`);
  return true;
}

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
      `No mailbox address in ${envPath} — expected ENCLAWED_EXECUTIVE_ASSISTANT_MAILBOX_EMAIL (or legacy ENCLAWED_EXECUTIVE_ASSISTANT_PRINCIPAL_EMAIL).`,
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
    ENCLAWED_EXECUTIVE_ASSISTANT_MAILBOX_EMAIL: mailbox,
    // Keep the legacy var populated so older code paths still resolve.
    ENCLAWED_EXECUTIVE_ASSISTANT_PRINCIPAL_EMAIL: mailbox,
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
// process so file handles on enclawed-apps/executive-assistant/ release before
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
  // Refresh the static maintainer-controlled portion of the .env file
  // (service.extraEnv in app.config.json) so security knobs the project
  // ships — ENCLAWED_FLAVOR, ENCLAWED_FIPS_REQUIRED, etc. — propagate on
  // every update. User-prompted values (mailbox, principal, aliases,
  // timezone, hitlChannel, ...) are left untouched.
  refreshExtraEnvInEnvFile(envPath, config.service?.extraEnv ?? {});
  // Rebuild dist/ — the workspace's package.json declares
  //   "enclawed/framework" -> ./dist/framework.js
  // so the executive assistant imports the COMPILED output, not src/. Without
  // this step the runtime keeps using whatever dist was on disk when
  // the operator first ran Install-EnclawedApp — every src/ change
  // we ship via Update-EnclawedApp would be invisible to the running
  // executive assistant.
  //
  // Profile = "ciArtifacts" — excludes the `build:plugin-sdk:dts`
  // step from BUILD_ALL_STEPS, which is what `pnpm run build`
  // defaults to. That dts step runs a strict tsc pass over
  // src/agents/** and currently has 20 pre-existing type errors in
  // pi-coding-agent/OpenAI/Anthropic adapter code that has nothing
  // to do with the executive assistant. ciArtifacts still runs tsdown
  // (produces dist/framework.js), runtime-postbuild, build-stamp,
  // and the CLI metadata writers — everything the runtime needs.
  runExe(pnpm, ["run", "build", "ciArtifacts"], {
    cwd: repoRoot,
    stdio: "inherit",
  });
  // Verify rather than assert. The runtime imports enclawed/framework,
  // which resolves to dist/framework.js, so a build that silently
  // no-ops leaves the app executing stale code while this line claims
  // otherwise. That is not hypothetical: a hardware-root fix landed in
  // src/ and the enclaweder went on being undetected because dist/ was
  // 48 minutes older than the source it was supposedly built from.
  const srcNewest = newestMtimeMs(join(repoRoot, "src"));
  const distNewest = newestMtimeMs(join(repoRoot, "dist"));
  if (srcNewest > 0 && distNewest > 0 && distNewest < srcNewest) {
    warn(
      `dist/ is OLDER than src/ after the build (dist ${new Date(distNewest).toLocaleString()} < ` +
        `src ${new Date(srcNewest).toLocaleString()}).\n` +
        `  The app runs from dist/, so it is executing stale code. Re-run:\n` +
        `    pnpm run build ciArtifacts`,
    );
  } else {
    ok("Workspace rebuilt — dist/ is newer than src/.");
  }
  // Regenerate launcher.mjs from the current source template. Without
  // this, every fix that touches the template (new keyring fetch, new
  // env passthrough, new spawn flag) is INVISIBLE to the running
  // install — the operator has to fully reinstall to pick it up. The
  // values are derived from the existing .env (mailbox) and the on-
  // disk app.config.json (provider type, keyringService), so no
  // prompting is needed.
  await regenerateLauncher();
  // Block the restart on the prompt-injection shield self-test. A
  // shield regression that lands via Update-EnclawedApp must not be
  // exposed to live inbound mail; better to leave the operator running
  // the previous, known-good service stopped than to expose them to a
  // broken shield.
  await runAdversarialGate({ exitOnFailure: true });
  await runStart();
  ok(`${config.name} updated and restarted.`);
}

async function regenerateLauncher() {
  const existingEnv = readExistingEnv(envPath);
  if (!existingEnv) {
    warn(`No .env at ${envPath}; skipping launcher regeneration (run --install first)`);
    return;
  }
  const mailboxVarLocal = (config.mailbox ?? config.principal)?.envVar;
  if (!mailboxVarLocal) {
    warn("Provider config has no mailbox/principal envVar; skipping launcher regeneration");
    return;
  }
  const principalVarLocal =
    config.principal?.envVar ?? "ENCLAWED_EXECUTIVE_ASSISTANT_PRINCIPAL_EMAIL";
  const providerModuleLocal = await import(`./providers/${config.provider.type}.mjs`);
  const usesKeyringLocal = !!providerModuleLocal.usesKeyring;
  const keyringHelperLocal = join(appDir, "bin", "keyring.mjs");
  const keyringServiceLocal =
    providerModuleLocal.keyringService?.(config.id) ?? `enclawed-${config.id}`;

  // ─── Migration: identities live in the unified executive-assistant-identities
  // JSON blob now, not per-field accounts and not in .env. Detect the
  // pre-migration state (mailbox in .env, no blob) and write the blob
  // before regenerating the launcher. After this, the .env mailbox/
  // principal/aliases lines are scrubbed.
  if (usesKeyringLocal) {
    const existingBlob = readIdentitiesBlob(appDir, config.id);
    if (!existingBlob) {
      const mailboxFromEnv = existingEnv[mailboxVarLocal];
      if (mailboxFromEnv) {
        const principalFromEnv = existingEnv[principalVarLocal];
        const legacyPrincipal = directKeyringGet(
          appDir,
          config.id,
          `principal-email:${mailboxFromEnv}`,
        );
        const legacyAliasesRaw =
          existingEnv["ENCLAWED_EXECUTIVE_ASSISTANT_PRINCIPAL_ALIASES"] ||
          directKeyringGet(appDir, config.id, `principal-aliases:${mailboxFromEnv}`);
        const aliases = legacyAliasesRaw
          ? legacyAliasesRaw
              .split(",")
              .map((s) => s.trim())
              .filter((s) => s.length > 0)
          : [];
        const principalForBlob =
          legacyPrincipal ||
          (principalFromEnv && principalFromEnv.toLowerCase() !== mailboxFromEnv.toLowerCase()
            ? principalFromEnv
            : "");
        try {
          writeIdentitiesBlob(appDir, config.id, {
            mailbox: mailboxFromEnv,
            principal: principalForBlob,
            aliases,
          });
          ok(`Migrated operator identities into ${IDENTITIES_KEYRING_ACCOUNT} keyring blob.`);
          directKeyringDelete(appDir, config.id, `principal-email:${mailboxFromEnv}`);
          directKeyringDelete(appDir, config.id, `principal-aliases:${mailboxFromEnv}`);
          directKeyringDelete(appDir, config.id, `hitl-reply-from:${mailboxFromEnv}`);
        } catch (err) {
          warn(`Identities-blob migration failed (${err.message}); leaving .env values in place`);
        }
      }
    }
  }
  // Strip mailbox/principal/aliases lines from .env regardless of
  // whether migration just ran — they may also have been written by
  // older Update paths.
  scrubIdentitiesFromEnvFile(envPath);

  const pnpmPathLocal = locateExecutable("pnpm");
  if (!pnpmPathLocal) {
    warn("pnpm not on PATH; skipping launcher regeneration");
    return;
  }
  writeFileSync(
    launcherPath,
    buildLauncher({
      envPath,
      pnpmPath: pnpmPathLocal,
      packageName: config.package,
      workspaceRoot: repoRoot,
      keyringHelperPath: usesKeyringLocal ? keyringHelperLocal : "",
      keyringService: usesKeyringLocal ? keyringServiceLocal : "",
      keyringSecretEnvVar: usesKeyringLocal ? "ENCLAWED_IMAP_APP_PASSWORD" : "",
      keyringAccountEnvVar: usesKeyringLocal ? mailboxVarLocal : "",
      identitiesAccount: usesKeyringLocal ? IDENTITIES_KEYRING_ACCOUNT : "",
      mailboxEnvVar: usesKeyringLocal ? mailboxVarLocal : "",
      principalEnvVar: usesKeyringLocal ? principalVarLocal : "",
      aliasesEnvVar: usesKeyringLocal ? "ENCLAWED_EXECUTIVE_ASSISTANT_PRINCIPAL_ALIASES" : "",
      braveSearchAccount: usesKeyringLocal
        ? `brave-search-api-key:${readIdentitiesBlob(appDir, config.id)?.mailbox ?? existingEnv[mailboxVarLocal] ?? ""}`
        : "",
      braveSearchEnvVar: usesKeyringLocal ? "BRAVE_SEARCH_API_KEY" : "",
    }),
    "utf8",
  );
  ok(`Regenerated ${launcherPath} from current source template.`);
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
  console.log("and delete the Enclawed Executive Assistant entry.");
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
        "  The executive assistant will still run on CPU; expect ~1–2 minutes per reply instead of seconds.",
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
  identitiesAccount = "",
  mailboxEnvVar = "",
  principalEnvVar,
  aliasesEnvVar = "",
  braveSearchAccount = "",
  braveSearchEnvVar = "",
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
// Unified operator-identity blob (mailbox + principal + aliases).
// Kept in ONE encrypted-at-rest keyring entry; nothing identity-
// related lives in .env. Launcher MUST fetch this first because the
// app-password fetch below uses the mailbox value as its keyring
// account name.
const identitiesAccount = ${JSON.stringify(identitiesAccount)};
const mailboxEnvVar = ${JSON.stringify(mailboxEnvVar)};
const principalEnvVar = ${JSON.stringify(principalEnvVar)};
const aliasesEnvVar = ${JSON.stringify(aliasesEnvVar)};
// Optional Brave Search API key. Missing keyring entry (status 65) just
// means the operator skipped the web-search prompt at install — runtime
// silently disables the web_search tool when the env var is unset.
const braveSearchAccount = ${JSON.stringify(braveSearchAccount)};
const braveSearchEnvVar = ${JSON.stringify(braveSearchEnvVar)};
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

// FIRST keyring fetch: the operator-identity JSON blob. Mailbox lives
// only in the keyring (never .env), so this must happen before the
// app-password fetch — that fetch keys on the mailbox env var, which
// gets populated here.
if (keyringHelper && identitiesAccount) {
  const r = spawnSync(
    process.execPath,
    [keyringHelper, "get", "--service", keyringService, "--account", identitiesAccount],
    { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
  );
  if (r.status === 0) {
    try {
      const parsed = JSON.parse(r.stdout);
      if (mailboxEnvVar && typeof parsed.mailbox === "string" && parsed.mailbox) {
        env[mailboxEnvVar] = parsed.mailbox;
      }
      if (principalEnvVar && typeof parsed.principal === "string" && parsed.principal) {
        env[principalEnvVar] = parsed.principal;
      }
      if (aliasesEnvVar && Array.isArray(parsed.aliases) && parsed.aliases.length > 0) {
        env[aliasesEnvVar] = parsed.aliases.filter((s) => typeof s === "string" && s.length > 0).join(",");
      }
    } catch (err) {
      process.stderr.write(\`launcher: identities-blob is not valid JSON (\${err.message}); re-run the installer.\\n\`);
      process.exit(2);
    }
  } else if (r.status === 65) {
    // Migration path: identities blob missing but mailbox is in .env
    // (older install). Accept the .env value silently so the next
    // Update-EnclawedApp can finish the migration into the keyring.
    if (mailboxEnvVar && !env[mailboxEnvVar]) {
      process.stderr.write(\`launcher: identities-blob missing AND \${mailboxEnvVar} not in .env; re-run the installer.\\n\`);
      process.exit(2);
    }
  } else {
    process.stderr.write(\`launcher: identities-blob keyring get failed (exit \${r.status}); the OS keyring may be locked.\\n\`);
    process.exit(2);
  }
}

// Pull the app-specific password out of the OS keyring under the
// account whose name is the mailbox set above. The secret is written
// to env in memory only — never to disk, never to argv, never to a
// log line.
if (keyringHelper && keyringSecretEnvVar) {
  const account = env[keyringAccountEnvVar];
  if (!account) {
    process.stderr.write(\`launcher: \${keyringAccountEnvVar} is not set; cannot locate keyring entry for the app password\\n\`);
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
  // Trim, as the Brave-key fetch below already does. The keyring helper
  // writes the secret raw with no trailing newline, so this is belt-and-
  // braces — but an app password that silently carries stray whitespace
  // fails authentication with the same "Invalid credentials" the server
  // returns for a genuinely wrong password, which is close to
  // undiagnosable from the outside.
  env[keyringSecretEnvVar] = r.stdout.trim();
}

// Optional third keyring fetch: Brave Search API key. Same service,
// distinct account namespace. Missing (status 65) = web search disabled
// by operator choice; runtime filters the web_search tool out of the
// LLM schema. Non-65 failure logged but not fatal — the executive assistant can
// run without web search.
if (keyringHelper && braveSearchAccount && braveSearchEnvVar) {
  const r = spawnSync(
    process.execPath,
    [keyringHelper, "get", "--service", keyringService, "--account", braveSearchAccount],
    { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
  );
  if (r.status === 0) {
    env[braveSearchEnvVar] = r.stdout.trim();
  } else if (r.status !== 65) {
    process.stderr.write(\`launcher: brave-search-api-key keyring get failed (exit \${r.status}); web_search tool disabled\\n\`);
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
//   'C:\\...\\pnpm.cmd" -F "enclawed-executive-assistant-app' is not recognized
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
// "No projects found in <cwd>" before the executive assistant even starts.
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
    // -ExecutionTimeLimit 0 means "no limit"; the executive assistant is meant
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
