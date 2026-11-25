import { n as defaultRuntime } from "./runtime-1ULlIz69.js";
//#region src/cli/hardware-root-cli.ts
/**
* `enclawed hardware-root status|recover`: the Enclaweder's DEVICE-held halt latch, from the core
* CLI. The implementation lives in src/enclawed/hardware-root/recover-cli.ts and is shared with
* the installer and codenclawed. `wsl-setup` (src/enclawed/platform/wsl-usb.ts) gives WSL
* automatic USB access to the device.
*/
function registerHardwareRootCli(program) {
	const hw = program.command("hardware-root").description("Enclaweder hardware root: diagnose the device and recover its halt state");
	hw.command("status").description("Diagnose the Enclaweder: present, genuine, operational, zeroized, halt state (CLEAN/DIRTY), recovery readiness, and what to do. Read-only; never asks for a factor").addHelpText("after", "\nExit codes:\n  0  operational and CLEAN\n  2  DIRTY: run `enclawed hardware-root recover`\n  3  not operational, zeroized, not genuine, a different unit, or no device\n  1  error\n").option("--json", "Output JSON", false).option("--state <path>", "This computer's halt record to report (default: ENCLAWEDER_STATE or ~/.enclawed-hw-root.state)").action(async (opts) => {
		if (!opts.json) await printWslUsbStatusIfWsl();
		const { hardwareRootStatusCli } = await import("./recover-cli-BWf0akh1.js");
		defaultRuntime.exit(await hardwareRootStatusCli({
			json: opts.json,
			statePath: opts.state
		}));
	});
	hw.command("wsl-setup").description("On Windows with WSL: let WSL see the Enclaweder by itself after every reboot and replug (usbipd-win bind + a logon auto-attach task, one administrator prompt; plugdev group and udev rule on the Linux side). Idempotent").option("--yes", "Install usbipd-win with winget without asking", false).option("--non-interactive", "Only report what is missing; never prompt, elevate or sudo", false).option("--installer", "Installer mode: skip quietly when no Enclaweder is plugged in", false).action(async (opts) => {
		const { wslUsbSetupCli } = await import("./wsl-usb-cli-BNK_dBV-.js");
		defaultRuntime.exit(await wslUsbSetupCli({
			yes: opts.yes,
			nonInteractive: opts.nonInteractive,
			installer: opts.installer
		}));
	});
	hw.command("recover").description("Clear a DIRTY halt state on the device: your authenticator code (or --fido security key) AND one recovery code, both verified by the Enclaweder; or your operators, for lost factors").option("--state <path>", "This computer's halt record to update").option("--fido <device>", "Use the registered FIDO2 security key (libfido2 device path) instead of the authenticator app").option("--operator-key <file...>", "Operator quorum: Ed25519 PKCS#8 key files on removable media (lost factors only)").option("--operator-offline <count>", "Operator quorum with keys off this host: print each message, paste each signature").option("--hidraw <path>", "Pin one Enclaweder").action(async (opts) => {
		const { hardwareRootRecoverCli } = await import("./recover-cli-BWf0akh1.js");
		defaultRuntime.exit(await hardwareRootRecoverCli({
			statePath: opts.state,
			fido: opts.fido,
			operatorKeys: opts.operatorKey,
			operatorOffline: opts.operatorOffline ? Number(opts.operatorOffline) : void 0,
			hidraw: opts.hidraw
		}));
	});
}
/** Under WSL the device first has to reach Linux at all; say so before the device diagnosis. */
async function printWslUsbStatusIfWsl() {
	const { isWslHost, wslUsbStatus, describeWslUsbStatus } = await import("./wsl-usb-cli-BNK_dBV-.js");
	if (!isWslHost()) return;
	const { lines } = describeWslUsbStatus(await wslUsbStatus());
	defaultRuntime.log("WSL USB access:");
	for (const line of lines) defaultRuntime.log(`  ${line}`);
	defaultRuntime.log("");
}
//#endregion
export { registerHardwareRootCli };
