//#region src/enclawed/hardware-root/root-mode.ts
var HardwareRootModeError = class extends Error {
	constructor(value) {
		super(`ENCLAWEDER_ROOT=${JSON.stringify(value)} is not accepted: use exactly "required" or "optional" (lowercase), or leave it unset`);
		this.value = value;
		this.name = "HardwareRootModeError";
	}
};
/**
* Parse ENCLAWEDER_ROOT. Unset (or set to the empty string) is "auto": a
* device on the bus is bound and enforced, and none means software-only.
* Throws HardwareRootModeError for anything but the exact accepted words.
*/
function parseHardwareRootMode(raw) {
	if (raw === void 0 || raw === "") return "auto";
	if (raw === "required" || raw === "optional") return raw;
	throw new HardwareRootModeError(raw);
}
/** The mode from `env` (default process.env); throws on an invalid value. */
function hardwareRootMode(env = process.env) {
	return parseHardwareRootMode(env.ENCLAWEDER_ROOT);
}
//#endregion
export { hardwareRootMode as n, parseHardwareRootMode as r, HardwareRootModeError as t };
