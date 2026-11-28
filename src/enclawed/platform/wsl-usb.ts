/**
 * Automatic USB access to the Enclaweder from WSL2.
 *
 * Under WSL2 the Linux distro does not see USB devices plugged into Windows. usbipd-win (>= 4)
 * shares a device with the WSL utility VM: `usbipd bind` (administrator, persists across reboots)
 * marks it shareable, and `usbipd attach --wsl --auto-attach` hands it to Linux and re-attaches it
 * every time it is replugged or WSL restarts. This module makes that a one-time, idempotent setup:
 *
 *   Windows side (reached through WSL interop, powershell.exe):
 *     - usbipd-win installed (winget, after asking the person)
 *     - the Enclaweder bound (one elevation prompt)
 *     - a per-user logon task running the auto-attach, started now
 *   Linux side:
 *     - the person in `plugdev`, and a udev rule giving 1209:e100 group plugdev, mode 0660
 *   Verification:
 *     - a /dev/hidraw* node whose sysfs ids say 1209:e100 appears (never opened here)
 *
 * Every side effect goes through {@link WslUsbDeps}, so the flow is unit-tested with the Windows
 * commands stubbed. Re-running on a configured machine only queries; it changes nothing.
 */

import { Buffer } from "node:buffer";

export const ENCLAWEDER_HARDWARE_ID = "1209:e100";
export const AUTO_ATTACH_TASK_NAME = "Enclaweder auto-attach";
export const WSL_USB_FIX_COMMAND = "enclawed hardware-root wsl-setup";
export const USBIPD_WINGET_ID = "dorssel.usbipd-win";
export const USBIPD_MIN_MAJOR = 4;
export const UDEV_RULE_PATH = "/etc/udev/rules.d/99-enclaweder.rules";
export const ENCLAWEDER_GROUP = "plugdev";
const AUTO_ATTACH_ARGS = `attach --wsl --hardware-id ${ENCLAWEDER_HARDWARE_ID} --auto-attach`;
const POWERSHELL_FALLBACK = "/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe";
const UDEV_RULE_DIRS = [
  "/etc/udev/rules.d",
  "/run/udev/rules.d",
  "/usr/lib/udev/rules.d",
  "/lib/udev/rules.d",
];
const ELEVATION_REFUSED_EXIT = 1223; // ERROR_CANCELLED, what UAC "No" maps to
const ELEVATED_BIND_FAILED_EXIT = 10;
const ELEVATED_TASK_FAILED_EXIT = 11;

export const UDEV_RULE = [
  "# Enclaweder (USB 1209:e100): non-root access for members of plugdev.",
  "# Written by `enclawed hardware-root wsl-setup`.",
  'SUBSYSTEM=="hidraw", ATTRS{idVendor}=="1209", ATTRS{idProduct}=="e100", MODE="0660", GROUP="plugdev", TAG+="uaccess"',
  'SUBSYSTEM=="usb", ATTRS{idVendor}=="1209", ATTRS{idProduct}=="e100", MODE="0660", GROUP="plugdev", TAG+="uaccess"',
  "",
].join("\n");

export type RunOptions = {
  /** Inherit the terminal (sudo password, winget progress). */
  interactive?: boolean;
  /** Bytes for stdin (stderr and the terminal stay available for sudo). */
  input?: string;
  timeoutMs?: number;
};

export type RunResult = {
  code: number | null;
  stdout: string;
  stderr: string;
  /** Set when the program could not be started at all (ENOENT, ENOEXEC, ...). */
  spawnError?: string;
};

export type WslUsbDeps = {
  env: Record<string, string | undefined>;
  readFile(path: string): string | null;
  readDir(path: string): string[];
  exists(path: string): boolean;
  /** access(2) for read+write. Never opens the node. */
  canReadWrite(path: string): boolean;
  which(command: string): string | null;
  run(command: string, args: string[], opts?: RunOptions): Promise<RunResult>;
  sleep(ms: number): Promise<void>;
  now(): number;
  userName: string;
  isRoot: boolean;
  /** Group ids active in THIS process (a just-added group is not active until re-login). */
  activeGroupIds: number[];
  log(line: string): void;
  confirm(question: string): Promise<boolean>;
};

export type InteropState =
  | "ok"
  | "disabled-by-config"
  | "not-registered"
  | "no-powershell"
  | "failed";

export type WindowsSide = {
  usbipdPath: string | null;
  usbipdVersion: string | null;
  usbipdMajor: number | null;
  winget: boolean;
  /** DOMAIN\user of the person running WSL (the task runs as them). */
  user: string;
  /** The Enclaweder is plugged into this computer (Windows device manager). */
  devicePresent: boolean;
  device: { connected: boolean; bound: boolean; attached: boolean };
  task: { present: boolean; current: boolean; state: string | null };
};

export type LinuxSide = {
  groupGid: number | null;
  userInGroup: boolean;
  groupActive: boolean;
  udevRule: boolean;
  udevRunning: boolean;
  hidraw: string | null;
  hidrawAccess: boolean;
};

export type WslUsbIssue =
  | "interop-unavailable"
  | "usbipd-missing"
  | "usbipd-too-old"
  | "device-not-plugged-in"
  | "not-bound"
  | "task-missing"
  | "task-not-running"
  | "not-attached"
  | "group-missing"
  | "group-not-active"
  | "udev-rule-missing"
  | "udev-not-running"
  | "hidraw-missing"
  | "hidraw-no-access";

export type WslUsbStatus =
  | { wsl: false }
  | {
      wsl: true;
      interop: InteropState;
      powershell: string | null;
      windows: WindowsSide | null;
      linux: LinuxSide;
      issues: WslUsbIssue[];
    };

export type WslUsbSetupOutcome =
  | "ready"
  | "ready-relogin"
  | "not-wsl"
  | "no-device"
  | "interop-unavailable"
  | "usbipd-missing"
  | "usbipd-install-failed"
  | "elevation-refused"
  | "bind-failed"
  | "task-failed"
  | "linux-setup-failed"
  | "not-visible"
  | "report-only";

export type WslUsbSetupOptions = {
  /** "non-interactive": report only, never prompt, elevate or sudo. */
  mode: "interactive" | "non-interactive";
  /** Install usbipd-win without asking. */
  assumeYes?: boolean;
  /** Called from an installer: with no Enclaweder plugged in and nothing set up, skip quietly. */
  installer?: boolean;
  attachTimeoutMs?: number;
};

export type WslUsbSetupResult = { outcome: WslUsbSetupOutcome; status: WslUsbStatus };

// ---------------------------------------------------------------------------------------------
// Detection

export function detectWsl(deps: Pick<WslUsbDeps, "env" | "readFile">): boolean {
  if (deps.env.WSL_DISTRO_NAME || deps.env.WSL_INTEROP) {
    return true;
  }
  const version = deps.readFile("/proc/version");
  return version !== null && /microsoft/i.test(version);
}

/** `[interop] enabled=false` in /etc/wsl.conf. */
export function wslConfDisablesInterop(text: string | null): boolean {
  if (!text) {
    return false;
  }
  let section = "";
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/[#;].*$/, "").trim();
    const header = /^\[(.+)\]$/.exec(line);
    if (header) {
      section = header[1].trim().toLowerCase();
      continue;
    }
    const kv = /^([^=]+)=(.*)$/.exec(line);
    if (section === "interop" && kv && kv[1].trim().toLowerCase() === "enabled") {
      return /^(false|0|no)$/i.test(kv[2].trim());
    }
  }
  return false;
}

/** true/false when binfmt_misc is readable, null when it cannot be inspected. */
function interopBinfmtRegistered(deps: WslUsbDeps): boolean | null {
  const dir = "/proc/sys/fs/binfmt_misc";
  const entries = deps.readDir(dir);
  if (entries.length === 0) {
    return null;
  }
  const interop = entries.filter((e) => e.startsWith("WSLInterop"));
  if (interop.length === 0) {
    return false;
  }
  return interop.some((e) => /^enabled/m.test(deps.readFile(`${dir}/${e}`) ?? ""));
}

function locatePowershell(deps: WslUsbDeps): string | null {
  return (
    deps.which("powershell.exe") ?? (deps.exists(POWERSHELL_FALLBACK) ? POWERSHELL_FALLBACK : null)
  );
}

export function encodePowershell(script: string): string {
  return Buffer.from(script, "utf16le").toString("base64");
}

function runPowershell(
  deps: WslUsbDeps,
  powershell: string,
  script: string,
  opts?: RunOptions,
): Promise<RunResult> {
  return deps.run(
    powershell,
    [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-EncodedCommand",
      encodePowershell(script),
    ],
    { timeoutMs: 60_000, ...opts },
  );
}

async function probeInterop(
  deps: WslUsbDeps,
): Promise<{ interop: InteropState; powershell: string | null }> {
  const confDisabled = wslConfDisablesInterop(deps.readFile("/etc/wsl.conf"));
  const powershell = locatePowershell(deps);
  if (!powershell) {
    return { interop: confDisabled ? "disabled-by-config" : "no-powershell", powershell };
  }
  const probe = await runPowershell(deps, powershell, "exit 0", { timeoutMs: 30_000 });
  if (probe.code === 0 && !probe.spawnError) {
    return { interop: "ok", powershell };
  }
  if (confDisabled) {
    return { interop: "disabled-by-config", powershell };
  }
  if (interopBinfmtRegistered(deps) === false) {
    return { interop: "not-registered", powershell };
  }
  return { interop: "failed", powershell };
}

export function explainInterop(state: InteropState): string[] {
  switch (state) {
    case "ok":
      return [];
    case "disabled-by-config":
      return [
        "WSL cannot run Windows programs: interop is turned off in /etc/wsl.conf.",
        "Fix: set the following in /etc/wsl.conf, then run `wsl --shutdown` from Windows and reopen WSL:",
        "  [interop]",
        "  enabled=true",
      ];
    case "not-registered":
      return [
        "WSL cannot run Windows programs: the WSLInterop handler is not registered (common with systemd=true).",
        "Fix: echo ':WSLInterop:M::MZ::/init:PF' | sudo tee /usr/lib/binfmt.d/WSLInterop.conf && sudo systemctl restart systemd-binfmt",
      ];
    case "no-powershell":
      return [
        "powershell.exe is not reachable from WSL.",
        "Check /etc/wsl.conf: [interop] enabled=true and appendWindowsPath=true, then run `wsl --shutdown` from Windows and reopen WSL.",
      ];
    default:
      return [
        "WSL could not run powershell.exe (Windows interop is not working).",
        "Check /etc/wsl.conf ([interop] enabled=true), then run `wsl --shutdown` from Windows and reopen WSL.",
      ];
  }
}

// ---------------------------------------------------------------------------------------------
// Windows side

function psQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

const USBIPD_LOCATE_PS = [
  "$u = (Get-Command usbipd.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1).Source",
  "if (-not $u) { $p = Join-Path $env:ProgramFiles 'usbipd-win\\usbipd.exe'; if (Test-Path $p) { $u = $p } }",
].join("\n");

export const WINDOWS_STATUS_PS = [
  "$ErrorActionPreference = 'SilentlyContinue'",
  USBIPD_LOCATE_PS,
  "$ver = $null; $state = $null",
  "if ($u) { $ver = (& $u --version) -join ''; $state = (& $u state) -join \"`n\" }",
  `$t = Get-ScheduledTask -TaskName ${psQuote(AUTO_ATTACH_TASK_NAME)} -ErrorAction SilentlyContinue`,
  "$task = $null",
  'if ($t) { $task = @{ state = "$($t.State)"; arguments = "$($t.Actions[0].Arguments)" } }',
  "$pnp = [bool](Get-PnpDevice -PresentOnly -ErrorAction SilentlyContinue | Where-Object { $_.InstanceId -match 'VID_1209&PID_E100' })",
  "$w = [bool](Get-Command winget.exe -ErrorAction SilentlyContinue)",
  '@{ usbipd = $u; version = $ver; state = $state; task = $task; pnp = $pnp; winget = $w; user = "$env:USERDOMAIN\\$env:USERNAME" } | ConvertTo-Json -Compress -Depth 4',
].join("\n");

type UsbipdStateDevice = {
  BusId?: string | null;
  ClientIPAddress?: string | null;
  InstanceId?: string | null;
  PersistedGuid?: string | null;
};

/** `usbipd state` (JSON, usbipd-win >= 4) narrowed to the Enclaweder. */
export function parseUsbipdState(text: string | null): WindowsSide["device"] {
  const none = { connected: false, bound: false, attached: false };
  if (!text) {
    return none;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(Math.max(0, text.indexOf("{"))));
  } catch {
    return none;
  }
  const devices = (parsed as { Devices?: unknown }).Devices;
  if (!Array.isArray(devices)) {
    return none;
  }
  const ours = (devices as UsbipdStateDevice[]).filter((d) =>
    /VID_1209&PID_E100/i.test(d?.InstanceId ?? ""),
  );
  const connected = ours.filter((d) => Boolean(d.BusId));
  return {
    connected: connected.length > 0,
    bound: connected.length > 0 && connected.every((d) => Boolean(d.PersistedGuid)),
    attached: ours.some((d) => Boolean(d.ClientIPAddress)),
  };
}

export function parseWindowsStatus(stdout: string): WindowsSide | null {
  const start = stdout.indexOf("{");
  if (start < 0) {
    return null;
  }
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(stdout.slice(start)) as Record<string, unknown>;
  } catch {
    return null;
  }
  const usbipdPath = typeof raw.usbipd === "string" && raw.usbipd ? raw.usbipd : null;
  const version = typeof raw.version === "string" && raw.version ? raw.version.trim() : null;
  const major = version ? Number.parseInt(version, 10) : Number.NaN;
  const task = raw.task as { state?: unknown; arguments?: unknown } | null | undefined;
  return {
    usbipdPath,
    usbipdVersion: version,
    usbipdMajor: Number.isFinite(major) ? major : null,
    winget: raw.winget === true,
    user: typeof raw.user === "string" ? raw.user : "",
    devicePresent: raw.pnp === true,
    device: parseUsbipdState(typeof raw.state === "string" ? raw.state : null),
    task: task
      ? {
          present: true,
          current: typeof task.arguments === "string" && task.arguments.includes(AUTO_ATTACH_ARGS),
          state: typeof task.state === "string" ? task.state : null,
        }
      : { present: false, current: false, state: null },
  };
}

async function queryWindows(deps: WslUsbDeps, powershell: string): Promise<WindowsSide | null> {
  const res = await runPowershell(deps, powershell, WINDOWS_STATUS_PS);
  return res.code === 0 ? parseWindowsStatus(res.stdout) : null;
}

/** The task action: hidden PowerShell running the auto-attach loop (it never exits by itself). */
export function autoAttachTaskArgument(usbipdPath: string): string {
  return `-NoProfile -WindowStyle Hidden -Command & ${psQuote(usbipdPath)} ${AUTO_ATTACH_ARGS}`;
}

/** The script run once, elevated: bind (persists across reboots) and register the logon task. */
export function elevatedSetupScript(params: {
  usbipdPath: string;
  user: string;
  bind: boolean;
  task: boolean;
}): string {
  const lines = ["$ErrorActionPreference = 'Stop'", `$u = ${psQuote(params.usbipdPath)}`];
  if (params.bind) {
    lines.push(
      `try { & $u bind --hardware-id ${ENCLAWEDER_HARDWARE_ID}; if ($LASTEXITCODE -ne 0) { exit ${ELEVATED_BIND_FAILED_EXIT} } } catch { exit ${ELEVATED_BIND_FAILED_EXIT} }`,
    );
  }
  if (params.task) {
    lines.push(
      "try {",
      `  $a = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ${psQuote(autoAttachTaskArgument(params.usbipdPath))}`,
      `  $tr = New-ScheduledTaskTrigger -AtLogOn -User ${psQuote(params.user)}`,
      "  $s = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -Hidden",
      `  $pr = New-ScheduledTaskPrincipal -UserId ${psQuote(params.user)} -LogonType Interactive -RunLevel Limited`,
      `  Register-ScheduledTask -TaskName ${psQuote(AUTO_ATTACH_TASK_NAME)} -Action $a -Trigger $tr -Settings $s -Principal $pr -Description 'Attach the Enclaweder to WSL at logon and whenever it is replugged.' -Force | Out-Null`,
      `  Start-ScheduledTask -TaskName ${psQuote(AUTO_ATTACH_TASK_NAME)}`,
      `} catch { exit ${ELEVATED_TASK_FAILED_EXIT} }`,
    );
  }
  lines.push("exit 0");
  return lines.join("\n");
}

/** Non-elevated wrapper: one UAC prompt, wait, return the elevated exit code. */
export function elevationWrapperScript(elevated: string): string {
  return [
    "try {",
    `  $p = Start-Process -FilePath 'powershell.exe' -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-WindowStyle','Hidden','-EncodedCommand','${encodePowershell(elevated)}' -Verb RunAs -Wait -PassThru`,
    "  exit $p.ExitCode",
    `} catch { exit ${ELEVATION_REFUSED_EXIT} }`,
  ].join("\n");
}

// ---------------------------------------------------------------------------------------------
// Linux side

function readGroup(deps: WslUsbDeps): { gid: number; members: string[] } | null {
  for (const line of (deps.readFile("/etc/group") ?? "").split("\n")) {
    const [name, , gid, members] = line.split(":");
    if (name === ENCLAWEDER_GROUP && gid !== undefined) {
      return {
        gid: Number.parseInt(gid, 10),
        members: (members ?? "")
          .split(",")
          .map((m) => m.trim())
          .filter(Boolean),
      };
    }
  }
  return null;
}

/** A rule line (continuations joined) naming both the vendor and the product id. */
export function rulesTextCoversEnclaweder(text: string): boolean {
  return text
    .replace(/\\\r?\n/g, " ")
    .split("\n")
    .some(
      (line) =>
        !line.trim().startsWith("#") &&
        /idVendor\}=="1209"/i.test(line) &&
        /idProduct\}=="e100"/i.test(line),
    );
}

function hasUdevRule(deps: WslUsbDeps): boolean {
  return UDEV_RULE_DIRS.some((dir) =>
    deps
      .readDir(dir)
      .filter((f) => f.endsWith(".rules"))
      .some((f) => rulesTextCoversEnclaweder(deps.readFile(`${dir}/${f}`) ?? "")),
  );
}

/** The Enclaweder's hidraw node, by its sysfs ids. Reads uevent only; never opens /dev. */
export function findEnclawederHidraw(deps: WslUsbDeps): string | null {
  for (const name of deps.readDir("/sys/class/hidraw").toSorted()) {
    const uevent = deps.readFile(`/sys/class/hidraw/${name}/device/uevent`) ?? "";
    if (/HID_ID=[0-9a-f]+:00001209:0000E100/i.test(uevent) && deps.exists(`/dev/${name}`)) {
      return `/dev/${name}`;
    }
  }
  return null;
}

export function queryLinux(deps: WslUsbDeps): LinuxSide {
  const group = readGroup(deps);
  const userInGroup = group !== null && group.members.includes(deps.userName);
  const hidraw = findEnclawederHidraw(deps);
  return {
    groupGid: group?.gid ?? null,
    userInGroup,
    groupActive: deps.isRoot || (group !== null && deps.activeGroupIds.includes(group.gid)),
    udevRule: hasUdevRule(deps),
    udevRunning: deps.exists("/run/udev/control"),
    hidraw,
    hidrawAccess: hidraw !== null && deps.canReadWrite(hidraw),
  };
}

// ---------------------------------------------------------------------------------------------
// Status

function listIssues(
  interop: InteropState,
  windows: WindowsSide | null,
  linux: LinuxSide,
): WslUsbIssue[] {
  const issues: WslUsbIssue[] = [];
  if (interop !== "ok" || !windows) {
    issues.push("interop-unavailable");
  } else {
    if (!windows.usbipdPath) {
      issues.push("usbipd-missing");
    } else if ((windows.usbipdMajor ?? 0) < USBIPD_MIN_MAJOR) {
      issues.push("usbipd-too-old");
    }
    if (!windows.devicePresent && !windows.device.connected && !linux.hidraw) {
      issues.push("device-not-plugged-in");
    } else if (windows.usbipdPath && !windows.device.bound && !linux.hidraw) {
      issues.push("not-bound");
    }
    if (!windows.task.present || !windows.task.current) {
      issues.push("task-missing");
    } else if (windows.task.state !== "Running") {
      issues.push("task-not-running");
    }
    if (windows.device.connected && !windows.device.attached && !linux.hidraw) {
      issues.push("not-attached");
    }
  }
  if (linux.hidraw && linux.hidrawAccess) {
    // Reachable: how access is granted (group, rule) is the distro's business.
    return issues;
  }
  if (!linux.userInGroup && !linux.groupActive) {
    issues.push("group-missing");
  } else if (!linux.groupActive) {
    issues.push("group-not-active");
  }
  if (!linux.udevRule) {
    issues.push("udev-rule-missing");
  } else if (!linux.udevRunning) {
    issues.push("udev-not-running");
  }
  issues.push(linux.hidraw ? "hidraw-no-access" : "hidraw-missing");
  return issues;
}

export async function gatherWslUsbStatus(deps: WslUsbDeps): Promise<WslUsbStatus> {
  if (!detectWsl(deps)) {
    return { wsl: false };
  }
  const { interop, powershell } = await probeInterop(deps);
  const windows = interop === "ok" && powershell ? await queryWindows(deps, powershell) : null;
  const linux = queryLinux(deps);
  return {
    wsl: true,
    interop: interop === "ok" && !windows ? "failed" : interop,
    powershell,
    windows,
    linux,
    issues: listIssues(interop, windows, linux),
  };
}

/** Is the Enclaweder in play on this machine at all (doctor stays quiet when not)? */
export function wslUsbRelevant(status: WslUsbStatus): boolean {
  if (!status.wsl) {
    return false;
  }
  const w = status.windows;
  return Boolean(
    status.linux.hidraw ||
    status.linux.udevRule ||
    (w && (w.devicePresent || w.device.connected || w.device.bound || w.task.present)),
  );
}

export function describeWslUsbStatus(status: WslUsbStatus): { healthy: boolean; lines: string[] } {
  if (!status.wsl) {
    return { healthy: true, lines: ["Not running under WSL; nothing to set up."] };
  }
  const lines: string[] = [];
  const yes = (b: boolean) => (b ? "yes" : "no");
  if (status.interop !== "ok" || !status.windows) {
    lines.push(...explainInterop(status.interop === "ok" ? "failed" : status.interop));
  } else {
    const w = status.windows;
    lines.push(
      `usbipd-win: ${w.usbipdPath ? (w.usbipdVersion ?? "installed") : "not installed"}`,
      `Enclaweder plugged into Windows: ${yes(w.devicePresent || w.device.connected)}`,
      `Shared with WSL (bound): ${yes(w.device.bound)}`,
      `Auto-attach task: ${
        w.task.present
          ? `${w.task.state ?? "present"}${w.task.current ? "" : " (outdated)"}`
          : "missing"
      }`,
      `Attached to WSL: ${yes(w.device.attached || Boolean(status.linux.hidraw))}`,
    );
  }
  const l = status.linux;
  lines.push(
    `Linux device node: ${l.hidraw ? `${l.hidraw} (${l.hidrawAccess ? "read/write ok" : "no access"})` : "not present"}`,
    `${ENCLAWEDER_GROUP} group: ${
      l.groupActive ? "active" : l.userInGroup ? "added (open a new WSL terminal)" : "not a member"
    }`,
    `udev rule: ${l.udevRule ? (l.udevRunning ? "present" : "present, but udev is not running") : "missing"}`,
  );
  const healthy = status.issues.length === 0;
  // An interop problem has its own fix above; wsl-setup cannot proceed until it is fixed.
  if (!healthy && !status.issues.includes("interop-unavailable")) {
    lines.push(`Fix: ${WSL_USB_FIX_COMMAND}`);
  }
  return { healthy, lines };
}

// ---------------------------------------------------------------------------------------------
// Setup

async function ensureUsbipd(
  deps: WslUsbDeps,
  powershell: string,
  windows: WindowsSide,
  opts: WslUsbSetupOptions,
): Promise<WindowsSide | WslUsbSetupOutcome> {
  const missing = !windows.usbipdPath;
  const tooOld = !missing && (windows.usbipdMajor ?? 0) < USBIPD_MIN_MAJOR;
  if (!missing && !tooOld) {
    return windows;
  }
  if (!windows.winget) {
    deps.log(
      `usbipd-win ${USBIPD_MIN_MAJOR} or newer is needed on Windows, and winget is not available to install it.`,
    );
    deps.log("Install it from https://github.com/dorssel/usbipd-win/releases, then re-run:");
    deps.log(`  ${WSL_USB_FIX_COMMAND}`);
    return "usbipd-missing";
  }
  const verb = missing ? "install" : "upgrade";
  const question = missing
    ? "usbipd-win (Windows USB sharing for WSL) is not installed. Install it now with winget? [Y/n] "
    : `usbipd-win ${windows.usbipdVersion ?? ""} is too old (need ${USBIPD_MIN_MAJOR}+). Upgrade it now with winget? [Y/n] `;
  if (!opts.assumeYes && !(await deps.confirm(question))) {
    deps.log(`Skipped. To do it yourself: winget ${verb} --exact --id ${USBIPD_WINGET_ID}`);
    return "usbipd-missing";
  }
  deps.log(
    `Running: winget ${verb} --exact --id ${USBIPD_WINGET_ID} (Windows may ask for approval)`,
  );
  const res = await runPowershell(
    deps,
    powershell,
    `winget ${verb} --exact --id ${USBIPD_WINGET_ID} --accept-source-agreements --accept-package-agreements; exit $LASTEXITCODE`,
    { interactive: true, timeoutMs: 15 * 60_000 },
  );
  const after = await queryWindows(deps, powershell);
  if (!after?.usbipdPath || (after.usbipdMajor ?? 0) < USBIPD_MIN_MAJOR) {
    deps.log(`winget ${verb} did not leave a usable usbipd-win (exit ${res.code ?? "none"}).`);
    return "usbipd-install-failed";
  }
  deps.log(`usbipd-win ${after.usbipdVersion ?? ""} installed.`);
  return after;
}

async function sudoRun(deps: WslUsbDeps, args: string[], input?: string): Promise<boolean> {
  const [cmd, rest] = deps.isRoot ? [args[0], args.slice(1)] : ["sudo", args];
  const res = await deps.run(cmd, rest, {
    interactive: input === undefined,
    input,
    timeoutMs: 120_000,
  });
  return res.code === 0 && !res.spawnError;
}

/** plugdev membership and the udev rule. Returns false when a step failed. */
async function ensureLinuxAccess(deps: WslUsbDeps, linux: LinuxSide): Promise<boolean> {
  const needGroup = linux.groupGid === null;
  const needMember = !linux.userInGroup && !linux.groupActive;
  const needRule = !linux.udevRule;
  if (!needGroup && !needMember && !needRule) {
    return true;
  }
  if (!deps.isRoot) {
    deps.log("Linux side: sudo may ask for your password (group membership and udev rule).");
  }
  if (needGroup && !(await sudoRun(deps, ["groupadd", "--system", ENCLAWEDER_GROUP]))) {
    deps.log(`Could not create the ${ENCLAWEDER_GROUP} group.`);
    return false;
  }
  if (needMember && !(await sudoRun(deps, ["usermod", "-aG", ENCLAWEDER_GROUP, deps.userName]))) {
    deps.log(`Could not add ${deps.userName} to ${ENCLAWEDER_GROUP}.`);
    return false;
  }
  if (needRule) {
    if (!(await sudoRun(deps, ["tee", UDEV_RULE_PATH], UDEV_RULE))) {
      deps.log(`Could not write ${UDEV_RULE_PATH}.`);
      return false;
    }
    await sudoRun(deps, ["udevadm", "control", "--reload-rules"]);
    await sudoRun(deps, ["udevadm", "trigger", "--subsystem-match=hidraw", "--action=add"]);
    deps.log(`udev rule written: ${UDEV_RULE_PATH}`);
  }
  return true;
}

async function waitForHidraw(deps: WslUsbDeps, timeoutMs: number): Promise<string | null> {
  const deadline = deps.now() + timeoutMs;
  for (;;) {
    const node = findEnclawederHidraw(deps);
    if (node || deps.now() >= deadline) {
      return node;
    }
    await deps.sleep(500);
  }
}

export async function runWslUsbSetup(
  deps: WslUsbDeps,
  opts: WslUsbSetupOptions,
): Promise<WslUsbSetupResult> {
  let status = await gatherWslUsbStatus(deps);
  const done = (outcome: WslUsbSetupOutcome): WslUsbSetupResult => ({ outcome, status });
  if (!status.wsl) {
    return done("not-wsl");
  }
  if (status.interop !== "ok" || !status.powershell || !status.windows) {
    for (const line of explainInterop(status.interop === "ok" ? "failed" : status.interop)) {
      deps.log(line);
    }
    return done("interop-unavailable");
  }
  if (opts.installer && !wslUsbRelevant(status)) {
    deps.log("No Enclaweder is plugged in; skipping WSL USB setup.");
    deps.log(`Plug it in later and run: ${WSL_USB_FIX_COMMAND}`);
    return done("no-device");
  }
  if (status.issues.length === 0) {
    deps.log(`The Enclaweder is reachable in WSL at ${status.linux.hidraw}; nothing to change.`);
    return done("ready");
  }
  if (opts.mode === "non-interactive") {
    for (const line of describeWslUsbStatus(status).lines) {
      deps.log(line);
    }
    return done("report-only");
  }
  const powershell = status.powershell;

  // 1. usbipd-win
  const ensured = await ensureUsbipd(deps, powershell, status.windows, opts);
  if (typeof ensured === "string") {
    return done(ensured);
  }
  let windows: WindowsSide = ensured;

  // 2. The device has to be plugged in for `bind` to find it.
  const linuxNow = queryLinux(deps);
  if (!windows.devicePresent && !windows.device.connected && !linuxNow.hidraw) {
    deps.log("Plug the Enclaweder into this computer, then run:");
    deps.log(`  ${WSL_USB_FIX_COMMAND}`);
    status = await gatherWslUsbStatus(deps);
    return done("no-device");
  }

  // 3. One elevation: bind + logon task (only what is missing).
  const needBind = !windows.device.bound && !linuxNow.hidraw;
  const needTask = !windows.task.present || !windows.task.current;
  if (needBind || needTask) {
    deps.log(
      "Windows will ask once for administrator approval to share the Enclaweder with WSL and register its auto-attach task.",
    );
    const elevated = elevatedSetupScript({
      usbipdPath: windows.usbipdPath ?? "usbipd.exe",
      user: windows.user,
      bind: needBind,
      task: needTask,
    });
    const res = await runPowershell(deps, powershell, elevationWrapperScript(elevated), {
      timeoutMs: 10 * 60_000,
    });
    if (res.code === ELEVATION_REFUSED_EXIT) {
      deps.log("Administrator approval was declined; nothing was changed on Windows.");
      deps.log(`Run again when ready: ${WSL_USB_FIX_COMMAND}`);
      return done("elevation-refused");
    }
    const after = await queryWindows(deps, powershell);
    if (res.code === ELEVATED_BIND_FAILED_EXIT || (needBind && !after?.device.bound)) {
      deps.log(`usbipd bind --hardware-id ${ENCLAWEDER_HARDWARE_ID} failed.`);
      status = await gatherWslUsbStatus(deps);
      return done("bind-failed");
    }
    if (res.code !== 0 || !after?.task.present) {
      deps.log(`Registering the "${AUTO_ATTACH_TASK_NAME}" task failed.`);
      status = await gatherWslUsbStatus(deps);
      return done("task-failed");
    }
    windows = after;
    deps.log("Shared with WSL; it now attaches by itself at logon and when replugged.");
  }

  // 4. Task registered but not running (e.g. stopped): start it, no elevation needed.
  if (windows.task.state !== "Running") {
    await runPowershell(
      deps,
      powershell,
      `Start-ScheduledTask -TaskName ${psQuote(AUTO_ATTACH_TASK_NAME)}`,
    );
  }

  // 5. Linux: group + udev rule.
  const linuxOk = await ensureLinuxAccess(deps, queryLinux(deps));

  // 6. Verify: the node appears (never opened).
  const node = await waitForHidraw(deps, opts.attachTimeoutMs ?? 30_000);
  status = await gatherWslUsbStatus(deps);
  if (!linuxOk) {
    return done("linux-setup-failed");
  }
  if (status.wsl && !status.linux.udevRunning && !status.linux.hidrawAccess) {
    deps.log(
      "udev is not running in this distro, so the access rule cannot apply. Set [boot] systemd=true in /etc/wsl.conf, then run `wsl --shutdown` from Windows and reopen WSL.",
    );
  }
  if (!node || !status.wsl) {
    deps.log(
      "The Enclaweder did not appear in WSL yet. Replug it, wait a few seconds, then check:",
    );
    deps.log("  enclawed hardware-root status");
    return done("not-visible");
  }
  if (!status.linux.groupActive) {
    deps.log(
      `The Enclaweder is at ${node}. You were just added to ${ENCLAWEDER_GROUP}: open a new WSL terminal (or run \`newgrp ${ENCLAWEDER_GROUP}\`) so it applies.`,
    );
    return done("ready-relogin");
  }
  deps.log(`The Enclaweder is reachable in WSL at ${node}.`);
  return done("ready");
}
