import { t as formatCliCommand } from "./command-format-CAEA84sd.js";
import { p as classifySystemdUnavailableDetail } from "./systemd-CtC8UVM8.js";
//#region src/daemon/systemd-hints.ts
function isSystemdUnavailableDetail(detail) {
	return classifySystemdUnavailableDetail(detail) !== null;
}
function renderSystemdHeadlessServerHints() {
	return ["On a headless server (SSH/no desktop session): run `sudo loginctl enable-linger $(whoami)` to persist your systemd user session across logins.", "Also ensure XDG_RUNTIME_DIR is set: `export XDG_RUNTIME_DIR=/run/user/$(id -u)`, then retry."];
}
function renderSystemdUnavailableHints(options = {}) {
	if (options.wsl) return [
		"WSL2 needs systemd enabled: edit /etc/wsl.conf with [boot]\\nsystemd=true",
		"Then run: wsl --shutdown (from PowerShell) and reopen your distro.",
		"Verify: systemctl --user status"
	];
	return [
		"systemd user services are unavailable; install/enable systemd or run the gateway under your supervisor.",
		...options.container || options.kind !== "user_bus_unavailable" ? [] : renderSystemdHeadlessServerHints(),
		`If you're in a container, run the gateway in the foreground instead of \`${formatCliCommand("enclawed gateway")}\`.`
	];
}
//#endregion
export { renderSystemdUnavailableHints as n, isSystemdUnavailableDetail as t };
