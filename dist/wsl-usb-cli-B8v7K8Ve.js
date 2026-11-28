import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import os from "node:os";
import { createInterface } from "node:readline/promises";
import { Buffer } from "node:buffer";
//#region src/enclawed/platform/wsl-usb.ts
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
const ENCLAWEDER_HARDWARE_ID = "1209:e100";
const AUTO_ATTACH_TASK_NAME = "Enclaweder auto-attach";
const WSL_USB_FIX_COMMAND = "enclawed hardware-root wsl-setup";
const USBIPD_WINGET_ID = "dorssel.usbipd-win";
const UDEV_RULE_PATH = "/etc/udev/rules.d/99-enclaweder.rules";
const ENCLAWEDER_GROUP = "plugdev";
const AUTO_ATTACH_ARGS = `attach --wsl --hardware-id ${ENCLAWEDER_HARDWARE_ID} --auto-attach`;
const POWERSHELL_FALLBACK = "/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe";
const UDEV_RULE_DIRS = [
	"/etc/udev/rules.d",
	"/run/udev/rules.d",
	"/usr/lib/udev/rules.d",
	"/lib/udev/rules.d"
];
const ELEVATION_REFUSED_EXIT = 1223;
const ELEVATED_BIND_FAILED_EXIT = 10;
const ELEVATED_TASK_FAILED_EXIT = 11;
const UDEV_RULE = [
	"# Enclaweder (USB 1209:e100): non-root access for members of plugdev.",
	"# Written by `enclawed hardware-root wsl-setup`.",
	"SUBSYSTEM==\"hidraw\", ATTRS{idVendor}==\"1209\", ATTRS{idProduct}==\"e100\", MODE=\"0660\", GROUP=\"plugdev\", TAG+=\"uaccess\"",
	"SUBSYSTEM==\"usb\", ATTRS{idVendor}==\"1209\", ATTRS{idProduct}==\"e100\", MODE=\"0660\", GROUP=\"plugdev\", TAG+=\"uaccess\"",
	""
].join("\n");
function detectWsl(deps) {
	if (deps.env.WSL_DISTRO_NAME || deps.env.WSL_INTEROP) return true;
	const version = deps.readFile("/proc/version");
	return version !== null && /microsoft/i.test(version);
}
/** `[interop] enabled=false` in /etc/wsl.conf. */
function wslConfDisablesInterop(text) {
	if (!text) return false;
	let section = "";
	for (const raw of text.split(/\r?\n/)) {
		const line = raw.replace(/[#;].*$/, "").trim();
		const header = /^\[(.+)\]$/.exec(line);
		if (header) {
			section = header[1].trim().toLowerCase();
			continue;
		}
		const kv = /^([^=]+)=(.*)$/.exec(line);
		if (section === "interop" && kv && kv[1].trim().toLowerCase() === "enabled") return /^(false|0|no)$/i.test(kv[2].trim());
	}
	return false;
}
/** true/false when binfmt_misc is readable, null when it cannot be inspected. */
function interopBinfmtRegistered(deps) {
	const dir = "/proc/sys/fs/binfmt_misc";
	const entries = deps.readDir(dir);
	if (entries.length === 0) return null;
	const interop = entries.filter((e) => e.startsWith("WSLInterop"));
	if (interop.length === 0) return false;
	return interop.some((e) => /^enabled/m.test(deps.readFile(`${dir}/${e}`) ?? ""));
}
function locatePowershell(deps) {
	return deps.which("powershell.exe") ?? (deps.exists(POWERSHELL_FALLBACK) ? POWERSHELL_FALLBACK : null);
}
function encodePowershell(script) {
	return Buffer.from(script, "utf16le").toString("base64");
}
function runPowershell(deps, powershell, script, opts) {
	return deps.run(powershell, [
		"-NoProfile",
		"-NonInteractive",
		"-ExecutionPolicy",
		"Bypass",
		"-EncodedCommand",
		encodePowershell(script)
	], {
		timeoutMs: 6e4,
		...opts
	});
}
async function probeInterop(deps) {
	const confDisabled = wslConfDisablesInterop(deps.readFile("/etc/wsl.conf"));
	const powershell = locatePowershell(deps);
	if (!powershell) return {
		interop: confDisabled ? "disabled-by-config" : "no-powershell",
		powershell
	};
	const probe = await runPowershell(deps, powershell, "exit 0", { timeoutMs: 3e4 });
	if (probe.code === 0 && !probe.spawnError) return {
		interop: "ok",
		powershell
	};
	if (confDisabled) return {
		interop: "disabled-by-config",
		powershell
	};
	if (interopBinfmtRegistered(deps) === false) return {
		interop: "not-registered",
		powershell
	};
	return {
		interop: "failed",
		powershell
	};
}
function explainInterop(state) {
	switch (state) {
		case "ok": return [];
		case "disabled-by-config": return [
			"WSL cannot run Windows programs: interop is turned off in /etc/wsl.conf.",
			"Fix: set the following in /etc/wsl.conf, then run `wsl --shutdown` from Windows and reopen WSL:",
			"  [interop]",
			"  enabled=true"
		];
		case "not-registered": return ["WSL cannot run Windows programs: the WSLInterop handler is not registered (common with systemd=true).", "Fix: echo ':WSLInterop:M::MZ::/init:PF' | sudo tee /usr/lib/binfmt.d/WSLInterop.conf && sudo systemctl restart systemd-binfmt"];
		case "no-powershell": return ["powershell.exe is not reachable from WSL.", "Check /etc/wsl.conf: [interop] enabled=true and appendWindowsPath=true, then run `wsl --shutdown` from Windows and reopen WSL."];
		default: return ["WSL could not run powershell.exe (Windows interop is not working).", "Check /etc/wsl.conf ([interop] enabled=true), then run `wsl --shutdown` from Windows and reopen WSL."];
	}
}
function psQuote(value) {
	return `'${value.replace(/'/g, "''")}'`;
}
const WINDOWS_STATUS_PS = [
	"$ErrorActionPreference = 'SilentlyContinue'",
	["$u = (Get-Command usbipd.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1).Source", "if (-not $u) { $p = Join-Path $env:ProgramFiles 'usbipd-win\\usbipd.exe'; if (Test-Path $p) { $u = $p } }"].join("\n"),
	"$ver = $null; $state = $null",
	"if ($u) { $ver = (& $u --version) -join ''; $state = (& $u state) -join \"`n\" }",
	`$t = Get-ScheduledTask -TaskName ${psQuote(AUTO_ATTACH_TASK_NAME)} -ErrorAction SilentlyContinue`,
	"$task = $null",
	"if ($t) { $task = @{ state = \"$($t.State)\"; arguments = \"$($t.Actions[0].Arguments)\" } }",
	"$pnp = [bool](Get-PnpDevice -PresentOnly -ErrorAction SilentlyContinue | Where-Object { $_.InstanceId -match 'VID_1209&PID_E100' })",
	"$w = [bool](Get-Command winget.exe -ErrorAction SilentlyContinue)",
	"@{ usbipd = $u; version = $ver; state = $state; task = $task; pnp = $pnp; winget = $w; user = \"$env:USERDOMAIN\\$env:USERNAME\" } | ConvertTo-Json -Compress -Depth 4"
].join("\n");
/** `usbipd state` (JSON, usbipd-win >= 4) narrowed to the Enclaweder. */
function parseUsbipdState(text) {
	const none = {
		connected: false,
		bound: false,
		attached: false
	};
	if (!text) return none;
	let parsed;
	try {
		parsed = JSON.parse(text.slice(Math.max(0, text.indexOf("{"))));
	} catch {
		return none;
	}
	const devices = parsed.Devices;
	if (!Array.isArray(devices)) return none;
	const ours = devices.filter((d) => /VID_1209&PID_E100/i.test(d?.InstanceId ?? ""));
	const connected = ours.filter((d) => Boolean(d.BusId));
	return {
		connected: connected.length > 0,
		bound: connected.length > 0 && connected.every((d) => Boolean(d.PersistedGuid)),
		attached: ours.some((d) => Boolean(d.ClientIPAddress))
	};
}
function parseWindowsStatus(stdout) {
	const start = stdout.indexOf("{");
	if (start < 0) return null;
	let raw;
	try {
		raw = JSON.parse(stdout.slice(start));
	} catch {
		return null;
	}
	const usbipdPath = typeof raw.usbipd === "string" && raw.usbipd ? raw.usbipd : null;
	const version = typeof raw.version === "string" && raw.version ? raw.version.trim() : null;
	const major = version ? Number.parseInt(version, 10) : NaN;
	const task = raw.task;
	return {
		usbipdPath,
		usbipdVersion: version,
		usbipdMajor: Number.isFinite(major) ? major : null,
		winget: raw.winget === true,
		user: typeof raw.user === "string" ? raw.user : "",
		devicePresent: raw.pnp === true,
		device: parseUsbipdState(typeof raw.state === "string" ? raw.state : null),
		task: task ? {
			present: true,
			current: typeof task.arguments === "string" && task.arguments.includes(AUTO_ATTACH_ARGS),
			state: typeof task.state === "string" ? task.state : null
		} : {
			present: false,
			current: false,
			state: null
		}
	};
}
async function queryWindows(deps, powershell) {
	const res = await runPowershell(deps, powershell, WINDOWS_STATUS_PS);
	return res.code === 0 ? parseWindowsStatus(res.stdout) : null;
}
/** The task action: hidden PowerShell running the auto-attach loop (it never exits by itself). */
function autoAttachTaskArgument(usbipdPath) {
	return `-NoProfile -WindowStyle Hidden -Command & ${psQuote(usbipdPath)} ${AUTO_ATTACH_ARGS}`;
}
/** The script run once, elevated: bind (persists across reboots) and register the logon task. */
function elevatedSetupScript(params) {
	const lines = ["$ErrorActionPreference = 'Stop'", `$u = ${psQuote(params.usbipdPath)}`];
	if (params.bind) lines.push(`try { & $u bind --hardware-id ${ENCLAWEDER_HARDWARE_ID}; if ($LASTEXITCODE -ne 0) { exit ${ELEVATED_BIND_FAILED_EXIT} } } catch { exit ${ELEVATED_BIND_FAILED_EXIT} }`);
	if (params.task) lines.push("try {", `  $a = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ${psQuote(autoAttachTaskArgument(params.usbipdPath))}`, `  $tr = New-ScheduledTaskTrigger -AtLogOn -User ${psQuote(params.user)}`, "  $s = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -Hidden", `  $pr = New-ScheduledTaskPrincipal -UserId ${psQuote(params.user)} -LogonType Interactive -RunLevel Limited`, `  Register-ScheduledTask -TaskName ${psQuote(AUTO_ATTACH_TASK_NAME)} -Action $a -Trigger $tr -Settings $s -Principal $pr -Description 'Attach the Enclaweder to WSL at logon and whenever it is replugged.' -Force | Out-Null`, `  Start-ScheduledTask -TaskName ${psQuote(AUTO_ATTACH_TASK_NAME)}`, `} catch { exit ${ELEVATED_TASK_FAILED_EXIT} }`);
	lines.push("exit 0");
	return lines.join("\n");
}
/** Non-elevated wrapper: one UAC prompt, wait, return the elevated exit code. */
function elevationWrapperScript(elevated) {
	return [
		"try {",
		`  $p = Start-Process -FilePath 'powershell.exe' -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-WindowStyle','Hidden','-EncodedCommand','${encodePowershell(elevated)}' -Verb RunAs -Wait -PassThru`,
		"  exit $p.ExitCode",
		`} catch { exit ${ELEVATION_REFUSED_EXIT} }`
	].join("\n");
}
function readGroup(deps) {
	for (const line of (deps.readFile("/etc/group") ?? "").split("\n")) {
		const [name, , gid, members] = line.split(":");
		if (name === "plugdev" && gid !== void 0) return {
			gid: Number.parseInt(gid, 10),
			members: (members ?? "").split(",").map((m) => m.trim()).filter(Boolean)
		};
	}
	return null;
}
/** A rule line (continuations joined) naming both the vendor and the product id. */
function rulesTextCoversEnclaweder(text) {
	return text.replace(/\\\r?\n/g, " ").split("\n").some((line) => !line.trim().startsWith("#") && /idVendor\}=="1209"/i.test(line) && /idProduct\}=="e100"/i.test(line));
}
function hasUdevRule(deps) {
	return UDEV_RULE_DIRS.some((dir) => deps.readDir(dir).filter((f) => f.endsWith(".rules")).some((f) => rulesTextCoversEnclaweder(deps.readFile(`${dir}/${f}`) ?? "")));
}
/** The Enclaweder's hidraw node, by its sysfs ids. Reads uevent only; never opens /dev. */
function findEnclawederHidraw(deps) {
	for (const name of deps.readDir("/sys/class/hidraw").toSorted()) {
		const uevent = deps.readFile(`/sys/class/hidraw/${name}/device/uevent`) ?? "";
		if (/HID_ID=[0-9a-f]+:00001209:0000E100/i.test(uevent) && deps.exists(`/dev/${name}`)) return `/dev/${name}`;
	}
	return null;
}
function queryLinux(deps) {
	const group = readGroup(deps);
	const userInGroup = group !== null && group.members.includes(deps.userName);
	const hidraw = findEnclawederHidraw(deps);
	return {
		groupGid: group?.gid ?? null,
		userInGroup,
		groupActive: deps.isRoot || group !== null && deps.activeGroupIds.includes(group.gid),
		udevRule: hasUdevRule(deps),
		udevRunning: deps.exists("/run/udev/control"),
		hidraw,
		hidrawAccess: hidraw !== null && deps.canReadWrite(hidraw)
	};
}
function listIssues(interop, windows, linux) {
	const issues = [];
	if (interop !== "ok" || !windows) issues.push("interop-unavailable");
	else {
		if (!windows.usbipdPath) issues.push("usbipd-missing");
		else if ((windows.usbipdMajor ?? 0) < 4) issues.push("usbipd-too-old");
		if (!windows.devicePresent && !windows.device.connected && !linux.hidraw) issues.push("device-not-plugged-in");
		else if (windows.usbipdPath && !windows.device.bound && !linux.hidraw) issues.push("not-bound");
		if (!windows.task.present || !windows.task.current) issues.push("task-missing");
		else if (windows.task.state !== "Running") issues.push("task-not-running");
		if (windows.device.connected && !windows.device.attached && !linux.hidraw) issues.push("not-attached");
	}
	if (linux.hidraw && linux.hidrawAccess) return issues;
	if (!linux.userInGroup && !linux.groupActive) issues.push("group-missing");
	else if (!linux.groupActive) issues.push("group-not-active");
	if (!linux.udevRule) issues.push("udev-rule-missing");
	else if (!linux.udevRunning) issues.push("udev-not-running");
	issues.push(linux.hidraw ? "hidraw-no-access" : "hidraw-missing");
	return issues;
}
async function gatherWslUsbStatus(deps) {
	if (!detectWsl(deps)) return { wsl: false };
	const { interop, powershell } = await probeInterop(deps);
	const windows = interop === "ok" && powershell ? await queryWindows(deps, powershell) : null;
	const linux = queryLinux(deps);
	return {
		wsl: true,
		interop: interop === "ok" && !windows ? "failed" : interop,
		powershell,
		windows,
		linux,
		issues: listIssues(interop, windows, linux)
	};
}
/** Is the Enclaweder in play on this machine at all (doctor stays quiet when not)? */
function wslUsbRelevant(status) {
	if (!status.wsl) return false;
	const w = status.windows;
	return Boolean(status.linux.hidraw || status.linux.udevRule || w && (w.devicePresent || w.device.connected || w.device.bound || w.task.present));
}
function describeWslUsbStatus(status) {
	if (!status.wsl) return {
		healthy: true,
		lines: ["Not running under WSL; nothing to set up."]
	};
	const lines = [];
	const yes = (b) => b ? "yes" : "no";
	if (status.interop !== "ok" || !status.windows) lines.push(...explainInterop(status.interop === "ok" ? "failed" : status.interop));
	else {
		const w = status.windows;
		lines.push(`usbipd-win: ${w.usbipdPath ? w.usbipdVersion ?? "installed" : "not installed"}`, `Enclaweder plugged into Windows: ${yes(w.devicePresent || w.device.connected)}`, `Shared with WSL (bound): ${yes(w.device.bound)}`, `Auto-attach task: ${w.task.present ? `${w.task.state ?? "present"}${w.task.current ? "" : " (outdated)"}` : "missing"}`, `Attached to WSL: ${yes(w.device.attached || Boolean(status.linux.hidraw))}`);
	}
	const l = status.linux;
	lines.push(`Linux device node: ${l.hidraw ? `${l.hidraw} (${l.hidrawAccess ? "read/write ok" : "no access"})` : "not present"}`, `${ENCLAWEDER_GROUP} group: ${l.groupActive ? "active" : l.userInGroup ? "added (open a new WSL terminal)" : "not a member"}`, `udev rule: ${l.udevRule ? l.udevRunning ? "present" : "present, but udev is not running" : "missing"}`);
	const healthy = status.issues.length === 0;
	if (!healthy && !status.issues.includes("interop-unavailable")) lines.push(`Fix: ${WSL_USB_FIX_COMMAND}`);
	return {
		healthy,
		lines
	};
}
async function ensureUsbipd(deps, powershell, windows, opts) {
	const missing = !windows.usbipdPath;
	const tooOld = !missing && (windows.usbipdMajor ?? 0) < 4;
	if (!missing && !tooOld) return windows;
	if (!windows.winget) {
		deps.log(`usbipd-win 4 or newer is needed on Windows, and winget is not available to install it.`);
		deps.log("Install it from https://github.com/dorssel/usbipd-win/releases, then re-run:");
		deps.log(`  ${WSL_USB_FIX_COMMAND}`);
		return "usbipd-missing";
	}
	const verb = missing ? "install" : "upgrade";
	const question = missing ? "usbipd-win (Windows USB sharing for WSL) is not installed. Install it now with winget? [Y/n] " : `usbipd-win ${windows.usbipdVersion ?? ""} is too old (need 4+). Upgrade it now with winget? [Y/n] `;
	if (!opts.assumeYes && !await deps.confirm(question)) {
		deps.log(`Skipped. To do it yourself: winget ${verb} --exact --id ${USBIPD_WINGET_ID}`);
		return "usbipd-missing";
	}
	deps.log(`Running: winget ${verb} --exact --id ${USBIPD_WINGET_ID} (Windows may ask for approval)`);
	const res = await runPowershell(deps, powershell, `winget ${verb} --exact --id ${USBIPD_WINGET_ID} --accept-source-agreements --accept-package-agreements; exit $LASTEXITCODE`, {
		interactive: true,
		timeoutMs: 15 * 6e4
	});
	const after = await queryWindows(deps, powershell);
	if (!after?.usbipdPath || (after.usbipdMajor ?? 0) < 4) {
		deps.log(`winget ${verb} did not leave a usable usbipd-win (exit ${res.code ?? "none"}).`);
		return "usbipd-install-failed";
	}
	deps.log(`usbipd-win ${after.usbipdVersion ?? ""} installed.`);
	return after;
}
async function sudoRun(deps, args, input) {
	const [cmd, rest] = deps.isRoot ? [args[0], args.slice(1)] : ["sudo", args];
	const res = await deps.run(cmd, rest, {
		interactive: input === void 0,
		input,
		timeoutMs: 12e4
	});
	return res.code === 0 && !res.spawnError;
}
/** plugdev membership and the udev rule. Returns false when a step failed. */
async function ensureLinuxAccess(deps, linux) {
	const needGroup = linux.groupGid === null;
	const needMember = !linux.userInGroup && !linux.groupActive;
	const needRule = !linux.udevRule;
	if (!needGroup && !needMember && !needRule) return true;
	if (!deps.isRoot) deps.log("Linux side: sudo may ask for your password (group membership and udev rule).");
	if (needGroup && !await sudoRun(deps, [
		"groupadd",
		"--system",
		"plugdev"
	])) {
		deps.log(`Could not create the ${ENCLAWEDER_GROUP} group.`);
		return false;
	}
	if (needMember && !await sudoRun(deps, [
		"usermod",
		"-aG",
		"plugdev",
		deps.userName
	])) {
		deps.log(`Could not add ${deps.userName} to ${ENCLAWEDER_GROUP}.`);
		return false;
	}
	if (needRule) {
		if (!await sudoRun(deps, ["tee", "/etc/udev/rules.d/99-enclaweder.rules"], UDEV_RULE)) {
			deps.log(`Could not write ${UDEV_RULE_PATH}.`);
			return false;
		}
		await sudoRun(deps, [
			"udevadm",
			"control",
			"--reload-rules"
		]);
		await sudoRun(deps, [
			"udevadm",
			"trigger",
			"--subsystem-match=hidraw",
			"--action=add"
		]);
		deps.log(`udev rule written: ${UDEV_RULE_PATH}`);
	}
	return true;
}
async function waitForHidraw(deps, timeoutMs) {
	const deadline = deps.now() + timeoutMs;
	for (;;) {
		const node = findEnclawederHidraw(deps);
		if (node || deps.now() >= deadline) return node;
		await deps.sleep(500);
	}
}
async function runWslUsbSetup(deps, opts) {
	let status = await gatherWslUsbStatus(deps);
	const done = (outcome) => ({
		outcome,
		status
	});
	if (!status.wsl) return done("not-wsl");
	if (status.interop !== "ok" || !status.powershell || !status.windows) {
		for (const line of explainInterop(status.interop === "ok" ? "failed" : status.interop)) deps.log(line);
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
		for (const line of describeWslUsbStatus(status).lines) deps.log(line);
		return done("report-only");
	}
	const powershell = status.powershell;
	const ensured = await ensureUsbipd(deps, powershell, status.windows, opts);
	if (typeof ensured === "string") return done(ensured);
	let windows = ensured;
	const linuxNow = queryLinux(deps);
	if (!windows.devicePresent && !windows.device.connected && !linuxNow.hidraw) {
		deps.log("Plug the Enclaweder into this computer, then run:");
		deps.log(`  ${WSL_USB_FIX_COMMAND}`);
		status = await gatherWslUsbStatus(deps);
		return done("no-device");
	}
	const needBind = !windows.device.bound && !linuxNow.hidraw;
	const needTask = !windows.task.present || !windows.task.current;
	if (needBind || needTask) {
		deps.log("Windows will ask once for administrator approval to share the Enclaweder with WSL and register its auto-attach task.");
		const res = await runPowershell(deps, powershell, elevationWrapperScript(elevatedSetupScript({
			usbipdPath: windows.usbipdPath ?? "usbipd.exe",
			user: windows.user,
			bind: needBind,
			task: needTask
		})), { timeoutMs: 10 * 6e4 });
		if (res.code === ELEVATION_REFUSED_EXIT) {
			deps.log("Administrator approval was declined; nothing was changed on Windows.");
			deps.log(`Run again when ready: ${WSL_USB_FIX_COMMAND}`);
			return done("elevation-refused");
		}
		const after = await queryWindows(deps, powershell);
		if (res.code === ELEVATED_BIND_FAILED_EXIT || needBind && !after?.device.bound) {
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
	if (windows.task.state !== "Running") await runPowershell(deps, powershell, `Start-ScheduledTask -TaskName ${psQuote(AUTO_ATTACH_TASK_NAME)}`);
	const linuxOk = await ensureLinuxAccess(deps, queryLinux(deps));
	const node = await waitForHidraw(deps, opts.attachTimeoutMs ?? 3e4);
	status = await gatherWslUsbStatus(deps);
	if (!linuxOk) return done("linux-setup-failed");
	if (status.wsl && !status.linux.udevRunning && !status.linux.hidrawAccess) deps.log("udev is not running in this distro, so the access rule cannot apply. Set [boot] systemd=true in /etc/wsl.conf, then run `wsl --shutdown` from Windows and reopen WSL.");
	if (!node || !status.wsl) {
		deps.log("The Enclaweder did not appear in WSL yet. Replug it, wait a few seconds, then check:");
		deps.log("  enclawed hardware-root status");
		return done("not-visible");
	}
	if (!status.linux.groupActive) {
		deps.log(`The Enclaweder is at ${node}. You were just added to ${ENCLAWEDER_GROUP}: open a new WSL terminal (or run \`newgrp ${ENCLAWEDER_GROUP}\`) so it applies.`);
		return done("ready-relogin");
	}
	deps.log(`The Enclaweder is reachable in WSL at ${node}.`);
	return done("ready");
}
//#endregion
//#region src/enclawed/platform/wsl-usb-cli.ts
/**
* Node-backed runner for the WSL USB setup ({@link ./wsl-usb.ts}): real fs / child_process /
* readline deps, and the entry points shared by `enclawed hardware-root wsl-setup`, `enclawed
* doctor`, `enclawed hardware-root status` and the installers.
*/
function readFileOrNull(file) {
	try {
		return fs.readFileSync(file, "utf8");
	} catch {
		return null;
	}
}
function readDirOrEmpty(dir) {
	try {
		return fs.readdirSync(dir);
	} catch {
		return [];
	}
}
function whichOnPath(command, env) {
	for (const dir of (env.PATH ?? "").split(path.delimiter)) {
		if (!dir) continue;
		const candidate = path.join(dir, command);
		try {
			fs.accessSync(candidate, fs.constants.X_OK);
			return candidate;
		} catch {}
	}
	return null;
}
function runProcess(command, args, opts = {}) {
	return new Promise((resolve) => {
		let stdout = "";
		let stderr = "";
		let settled = false;
		const finish = (result) => {
			if (!settled) {
				settled = true;
				clearTimeout(timer);
				resolve(result);
			}
		};
		const child = spawn(command, args, {
			stdio: opts.interactive ? "inherit" : [
				opts.input === void 0 ? "ignore" : "pipe",
				"pipe",
				opts.input === void 0 ? "pipe" : "inherit"
			],
			cwd: command.endsWith(".exe") && fs.existsSync("/mnt/c") ? "/mnt/c" : void 0
		});
		const timer = setTimeout(() => {
			child.kill("SIGKILL");
			finish({
				code: null,
				stdout,
				stderr,
				spawnError: "timeout"
			});
		}, opts.timeoutMs ?? 6e4);
		child.stdout?.on("data", (d) => stdout += d.toString("utf8"));
		child.stderr?.on("data", (d) => stderr += d.toString("utf8"));
		child.on("error", (err) => finish({
			code: null,
			stdout,
			stderr,
			spawnError: err.code ?? err.message
		}));
		child.on("close", (code) => finish({
			code,
			stdout,
			stderr
		}));
		if (opts.input !== void 0) child.stdin?.end(opts.input);
	});
}
async function confirmOnTerminal(question) {
	if (!process.stdin.isTTY) return false;
	const rl = createInterface({
		input: process.stdin,
		output: process.stdout
	});
	try {
		const answer = (await rl.question(question)).trim();
		return answer === "" || /^y(es)?$/i.test(answer);
	} finally {
		rl.close();
	}
}
function createNodeWslUsbDeps(overrides = {}) {
	const env = process.env;
	return {
		env,
		readFile: readFileOrNull,
		readDir: readDirOrEmpty,
		exists: (p) => fs.existsSync(p),
		canReadWrite: (p) => {
			try {
				fs.accessSync(p, fs.constants.R_OK | fs.constants.W_OK);
				return true;
			} catch {
				return false;
			}
		},
		which: (c) => whichOnPath(c, env),
		run: runProcess,
		sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
		now: () => Date.now(),
		userName: os.userInfo().username,
		isRoot: typeof process.getuid === "function" && process.getuid() === 0,
		activeGroupIds: typeof process.getgroups === "function" ? process.getgroups() : [],
		log: overrides.log ?? ((line) => console.log(`  ${line}`)),
		confirm: overrides.confirm ?? confirmOnTerminal
	};
}
/** Cheap, synchronous: no Windows call. Callers use it to skip the whole check off WSL. */
function isWslHost() {
	return detectWsl({
		env: process.env,
		readFile: readFileOrNull
	});
}
function wslUsbExitCode(outcome, installer) {
	switch (outcome) {
		case "ready":
		case "ready-relogin":
		case "not-wsl": return 0;
		case "no-device":
		case "report-only": return installer ? 0 : 1;
		default: return 1;
	}
}
/** `enclawed hardware-root wsl-setup` (and the installers): returns the process exit code. */
async function wslUsbSetupCli(opts = {}) {
	const deps = createNodeWslUsbDeps({
		log: opts.log,
		confirm: opts.confirm
	});
	if (!detectWsl(deps)) {
		deps.log("Not running under WSL; nothing to set up.");
		return 0;
	}
	const { outcome } = await runWslUsbSetup(deps, {
		mode: !opts.nonInteractive && (Boolean(opts.confirm) || process.stdin.isTTY) ? "interactive" : "non-interactive",
		assumeYes: opts.yes,
		installer: opts.installer
	});
	return wslUsbExitCode(outcome, opts.installer === true);
}
/** Read-only: the WSL USB status (no prompts, no elevation, no sudo). */
async function wslUsbStatus() {
	return gatherWslUsbStatus(createNodeWslUsbDeps());
}
//#endregion
export { wslUsbStatus as a, wslUsbSetupCli as i, isWslHost as n, describeWslUsbStatus as o, wslUsbExitCode as r, wslUsbRelevant as s, createNodeWslUsbDeps as t };
