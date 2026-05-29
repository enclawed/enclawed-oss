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

import { execFileSync, spawn, spawnSync } from "node:child_process";
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
if (!appId) {
  console.error("usage: install.mjs <app-id> [--uninstall]");
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

// Detect prior install. Don't silently wipe the user's env, audit log,
// or service state — ask. Default is to keep and reuse (re-install path
// already detects existing .env / credentials and offers to reuse them).
if (existsSync(envDir)) {
  const ans = (
    await ask(
      `Found a prior install of "${config.id}" at ${envDir}.\nDelete it (audit log, env, service state) and start fresh? [y/N] `,
    )
  )
    .trim()
    .toLowerCase();
  if (ans === "y" || ans === "yes") {
    // Stop and remove the background service first so the audit log
    // and env are not held open while we rm.
    try {
      await runUninstall();
    } catch (err) {
      warn(`Pre-wipe uninstall reported: ${(err && err.message) || err}`);
    }
    if (existsSync(envDir)) {
      rmSync(envDir, { recursive: true, force: true });
    }
    ok(`Cleared ${envDir}.`);
  }
}

// shell:true is required on Windows when spawning .cmd / .bat files via
// execFileSync — Node 18.20.2 / 20.12.2 / 21.7.3 and later refuse direct
// spawn with EINVAL as the mitigation for CVE-2024-27980. cmd.exe then
// dispatches the .cmd correctly; arg quoting is handled by Node's
// internal escape pass for shell:true on Windows.
const SPAWN_OPTS = { shell: platform() === "win32" };

// With shell:true on Windows, Node concatenates `file + args` into a single
// command line and hands it to `cmd /d /s /c "<that>"`. Node does NOT quote
// the file part, so if the resolved binary path contains a space (e.g.
// "C:\Program Files\..." or "C:\...\Google\Cloud SDK\...\gcloud.cmd"),
// cmd.exe parses the path's first whitespace-bounded token as the command
// and discards the rest. Wrap the path here so cmd's /s flag round-trips
// the inner quotes verbatim. No-op off Windows.
function winSpawnable(p) {
  return platform() === "win32" ? `"${p}"` : p;
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
execFileSync(winSpawnable(pnpmPath), ["--version"], { stdio: "ignore", ...SPAWN_OPTS });
// --ignore-scripts: skip every package's postinstall. The repo's root
// declares 67 runtime deps that include native modules used by other
// bundled extensions (Discord, Matrix, sharp, llama-cpp). The secretary
// app doesn't load any of them, but their postinstall scripts try to
// native-compile and fail without Visual Studio Build Tools on Windows.
// The app runtime is pure JS / TS + node:crypto + fetch — no native
// dep ever loads, so skipping the build scripts is safe here.
execFileSync(winSpawnable(pnpmPath), ["install", "--prefer-offline", "--ignore-scripts"], {
  cwd: repoRoot,
  stdio: "inherit",
  ...SPAWN_OPTS,
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
  execFileSync(winSpawnable(ollamaPath), ["pull", config.llm.model], {
    stdio: "inherit",
    ...SPAWN_OPTS,
  });
  ok(`Model ${config.llm.model} ready.`);
}

// 3) Principal address (the email the agent runs on behalf of).
//    If a prior install wrote a .env, offer to reuse it.
const existingEnv = readExistingEnv(envPath);
const existingPrincipal = existingEnv?.[config.principal.envVar];
let principal;
header("Principal");
if (existingPrincipal && PRINCIPAL_EMAIL_RE.test(existingPrincipal)) {
  const reuse = (await ask(`Reuse principal ${existingPrincipal}? [Y/n] `)).trim().toLowerCase();
  principal = reuse === "n" || reuse === "no" ? "" : existingPrincipal;
}
while (!principal) {
  const raw = (await ask(`${config.principal.prompt}: `)).trim();
  if (PRINCIPAL_EMAIL_RE.test(raw)) {
    principal = raw;
    break;
  }
  fail(`"${raw}" is not a valid email address. Try again.`);
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
    principal,
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

// 5) Run any provider-specific post-auth setup (e.g. create Gmail labels).
if (providerModule.postAuthSetup) {
  await providerModule.postAuthSetup({ config, credentials, principal, ok, warn });
}

// 6) Write the env file under ~/.enclawed/enclawed-apps/<id>/.env (chmod 600).
header("Writing env file");
mkdirSync(envDir, { recursive: true });
const providerEnv = providerModule.envVars(credentials);
const envEntries = {
  [config.principal.envVar]: principal,
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
    execFileSync(
      "icacls",
      [envPath, "/inheritance:r", "/grant:r", `${process.env.USERNAME ?? "."}:F`],
      { stdio: "ignore", ...SPAWN_OPTS },
    );
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
    keyringHelperPath: keyring ? keyringHelper : "",
    keyringService: keyring ? keyringService : "",
    keyringSecretEnvVar: keyring ? "ENCLAWED_IMAP_APP_PASSWORD" : "",
    keyringAccountEnvVar: keyring ? config.principal.envVar : "",
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
console.log(`Tail the audit log:`);
console.log(`  tail -F ${join(envDir, "audit.jsonl")}`);
console.log(`Service log:`);
console.log(`  tail -F ${logPath}`);
console.log(`Stop:`);
console.log(`  node ${fileURLToPath(import.meta.url)} ${config.id} --uninstall`);

// ────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────

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
    try {
      execFileSync("schtasks", ["/End", "/TN", taskName], { stdio: "ignore" });
    } catch {}
    try {
      execFileSync("schtasks", ["/Delete", "/TN", taskName, "/F"], { stdio: "ignore" });
      ok(`Removed Task Scheduler entry "${taskName}".`);
    } catch {
      warn(`No Task Scheduler entry named "${taskName}".`);
    }
  }
  // Delete the OS keyring entry, if any. We read the principal out of
  // the env file before unlinking it (it's the keyring lookup key);
  // doing this before the rmSync below is the only ordering that
  // works.
  try {
    const env = readExistingEnv(envPath);
    const account = env?.[config.principal.envVar];
    const providerModule = await import(`./providers/${config.provider.type}.mjs`);
    if (account && providerModule.usesKeyring) {
      const service = providerModule.keyringService?.(config.id) ?? `enclawed-${config.id}`;
      const helper = join(appDir, "bin", "keyring.mjs");
      if (existsSync(helper)) {
        const k = buildKeyring({ helperPath: helper, service });
        k.delete({ account });
        ok(`Removed keyring entry (service=${service}, account=${account}).`);
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
      execFileSync(
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
        { stdio: "inherit", ...SPAWN_OPTS },
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

function buildLauncher({
  envPath,
  pnpmPath,
  packageName,
  keyringHelperPath,
  keyringService,
  keyringSecretEnvVar,
  keyringAccountEnvVar,
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
const keyringHelper = ${JSON.stringify(keyringHelperPath)};
const keyringService = ${JSON.stringify(keyringService)};
const keyringSecretEnvVar = ${JSON.stringify(keyringSecretEnvVar)};
const keyringAccountEnvVar = ${JSON.stringify(keyringAccountEnvVar)};
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

// Prepend the install-time directories of Node and pnpm to PATH so any
// child processes (pnpm itself, tsx, ollama) find their dependencies
// when running under launchd / systemd-user / schtasks (which start
// with a minimal PATH).
env.PATH = [${JSON.stringify(nodeDir)}, ${JSON.stringify(pnpmDir)}, env.PATH ?? ""]
  .filter((p) => p.length > 0)
  .join(delimiter);

// Quote the executable on Windows when handing off via shell:true; the
// pnpm path may sit under a directory with a space and would otherwise be
// truncated at cmd.exe's parse stage. See install.mjs:winSpawnable.
const pnpmCmd = process.platform === "win32" ? \`"\${pnpmPath}"\` : pnpmPath;
const child = spawn(pnpmCmd, ["-F", ${JSON.stringify(packageName)}, "start"], {
  env,
  stdio: "inherit",
  shell: process.platform === "win32",
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
  try {
    execFileSync("schtasks", ["/Delete", "/TN", taskName, "/F"], { stdio: "ignore" });
  } catch {}
  execFileSync("schtasks", [
    "/Create",
    "/SC",
    "ONLOGON",
    "/TN",
    taskName,
    "/TR",
    `"${cmdPath}"`,
    "/RL",
    "LIMITED",
    "/F",
  ]);
  execFileSync("schtasks", ["/Run", "/TN", taskName]);
  ok(`Task Scheduler: "${taskName}" (logs at ${logPath})`);
}
