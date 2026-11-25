// Opening the person's browser on a loopback ceremony page, on a Linux
// desktop (xdg-open), macOS (open), Windows (start) and WSL (wslview, else
// the Windows shell's start, which opens the Windows browser). Under WSL the
// Windows browser reaches the page only through WSL's localhost forwarding;
// `probeWslLocalhost` checks that from the Windows side before the page is
// opened, so a person is told why it cannot work instead of looking at a
// browser error. Both need WSL's Windows interop (the kernel's binfmt_misc
// "WSLInterop" entry, which runs a Windows .exe from Linux): when it is not
// registered, no Windows program can be started from this instance, so no
// opener is claimed and the probe reports "unknown" (the URL is printed).

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export type BrowserHost = "wsl" | "darwin" | "linux" | "win32" | "other";

export type OpenDeps = {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  readFile?: (p: string) => string | null;
  onPath?: (cmd: string) => boolean;
  spawnDetached?: (cmd: string, args: string[], cwd?: string) => boolean;
  run?: (cmd: string, args: string[], timeoutMs: number, cwd?: string) => string | null;
  /** Under WSL: can a Windows .exe be started from here (default: binfmt_misc). */
  interop?: () => WslInterop;
};

export type WslInterop = "on" | "off" | "unknown";

const BINFMT = "/proc/sys/fs/binfmt_misc";

/**
 * Whether WSL's Windows interop is registered with the kernel: "on" when a
 * WSLInterop binfmt entry is enabled, "off" when binfmt_misc is mounted and
 * readable but no enabled entry exists (or binfmt_misc is disabled as a
 * whole), "unknown" when binfmt_misc cannot be read at all. Without it,
 * exec of a Windows .exe fails (ENOEXEC) and the C library's fallback hands
 * the file to /bin/sh, which exits with an error: nothing Windows-side runs.
 */
export function detectWslInterop(read: (p: string) => string | null = readFileOrNull): WslInterop {
  const status = read(`${BINFMT}/status`)?.trim();
  if (status === undefined) {
    return "unknown";
  }
  if (status === "disabled") {
    return "off";
  }
  // WSL registers "WSLInterop"; some releases register "WSLInterop-late" after systemd starts.
  for (const name of ["WSLInterop", "WSLInterop-late"]) {
    if (read(`${BINFMT}/${name}`)?.split("\n")[0]?.trim() === "enabled") {
      return "on";
    }
  }
  return "off";
}

function readFileOrNull(p: string): string | null {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return null;
  }
}

function onPathDefault(cmd: string, env: NodeJS.ProcessEnv): boolean {
  for (const dir of (env.PATH ?? "").split(path.delimiter)) {
    if (!dir) {
      continue;
    }
    try {
      fs.accessSync(path.join(dir, cmd), fs.constants.X_OK);
      return true;
    } catch {
      // next
    }
  }
  return false;
}

export function detectBrowserHost(deps: OpenDeps = {}): BrowserHost {
  const platform = deps.platform ?? process.platform;
  const env = deps.env ?? process.env;
  if (platform === "linux") {
    const read = deps.readFile ?? readFileOrNull;
    const version = read("/proc/sys/kernel/osrelease") ?? read("/proc/version") ?? "";
    if (env.WSL_DISTRO_NAME || /microsoft|wsl/i.test(version)) {
      return "wsl";
    }
    return "linux";
  }
  if (platform === "darwin" || platform === "win32") {
    return platform;
  }
  return "other";
}

/** Only our own page URLs are handed to a shell-like opener: no character a shell would read. */
const SAFE_URL = /^http:\/\/localhost:[0-9]{1,5}\/[A-Za-z0-9_-]+$/;

/** The command that opens `url` in the person's browser on this host, or null when none is known. */
export function browserCommand(
  host: BrowserHost,
  url: string,
  onPath: (cmd: string) => boolean,
): { cmd: string; args: string[]; cwd?: string } | null {
  if (!SAFE_URL.test(url)) {
    return null;
  }
  switch (host) {
    case "darwin":
      return { cmd: "open", args: [url] };
    case "linux":
      return onPath("xdg-open") ? { cmd: "xdg-open", args: [url] } : null;
    case "win32":
      return { cmd: "cmd.exe", args: ["/d", "/c", "start", '""', url] };
    case "wsl":
      if (onPath("wslview")) {
        return { cmd: "wslview", args: [url] };
      }
      // The Windows shell, started from a Windows folder so it does not
      // complain about a WSL working directory.
      return onPath("cmd.exe")
        ? { cmd: "cmd.exe", args: ["/d", "/c", "start", '""', url], cwd: "/mnt/c" }
        : null;
    default:
      return null;
  }
}

function spawnDetachedDefault(cmd: string, args: string[], cwd?: string): boolean {
  try {
    const child = spawn(cmd, args, {
      detached: true,
      stdio: "ignore",
      ...(cwd && fs.existsSync(cwd) ? { cwd } : {}),
    });
    child.on("error", () => {});
    child.unref();
    return true;
  } catch {
    return false;
  }
}

/** Open `url`; returns how, or null when no opener is available (the caller prints the URL). */
export function openBrowser(url: string, deps: OpenDeps = {}): string | null {
  const env = deps.env ?? process.env;
  const host = detectBrowserHost(deps);
  if (host === "wsl" && (deps.interop ?? (() => detectWslInterop(deps.readFile)))() === "off") {
    // wslview and cmd.exe both start Windows programs: neither can run.
    return null;
  }
  const c = browserCommand(host, url, deps.onPath ?? ((cmd) => onPathDefault(cmd, env)));
  if (!c) {
    return null;
  }
  return (deps.spawnDetached ?? spawnDetachedDefault)(c.cmd, c.args, c.cwd) ? c.cmd : null;
}

function runDefault(cmd: string, args: string[], timeoutMs: number, cwd?: string): string | null {
  const r = spawnSync(cmd, args, {
    encoding: "utf8",
    timeout: timeoutMs,
    stdio: ["ignore", "pipe", "ignore"],
    ...(cwd && fs.existsSync(cwd) ? { cwd } : {}),
  });
  return r.status === 0 ? r.stdout : null;
}

export type WslReachability = "reachable" | "unreachable" | "unknown";

/**
 * Under WSL: can a Windows program connect to localhost:<port>? A TCP
 * connect from Windows PowerShell answers "reachable" when localhost
 * forwarding (or mirrored networking) carries it into this WSL instance,
 * "unreachable" when it does not, "unknown" when the check cannot run or
 * says nothing clear (Windows interop off, PowerShell missing, slow or
 * answering something else). Only "unreachable" is evidence the page cannot
 * load; "unknown" is no evidence either way.
 */
export function probeWslLocalhost(port: number, deps: OpenDeps = {}): WslReachability {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return "unknown";
  }
  if ((deps.interop ?? (() => detectWslInterop(deps.readFile)))() === "off") {
    return "unknown";
  }
  const run = deps.run ?? runDefault;
  const script =
    "$c = New-Object System.Net.Sockets.TcpClient; " +
    `try { $c.Connect('localhost', ${port}); 'reachable' } catch { 'unreachable' } finally { $c.Close() }`;
  const out = run(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", script],
    15_000,
    "/mnt/c",
  );
  const word = out?.trim().split(/\s+/).pop();
  return word === "reachable" || word === "unreachable" ? word : "unknown";
}

export const WSL_FORWARDING_HELP = [
  "The Windows browser cannot reach this WSL instance's localhost, so the passkey page cannot open there.",
  "Turn WSL localhost forwarding on: in %UserProfile%\\.wslconfig put",
  "  [wsl2]",
  "  localhostForwarding=true",
  '(or networkingMode=mirrored), run "wsl --shutdown" from Windows, reopen the WSL terminal and try again.',
].join("\n");
