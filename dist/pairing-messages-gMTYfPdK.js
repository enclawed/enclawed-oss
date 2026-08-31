import { t as formatCliCommand } from "./command-format-CAEA84sd.js";
//#region src/pairing/pairing-messages.ts
function buildPairingReply(params) {
	const { channel, idLine, code } = params;
	const approveCommand = formatCliCommand(`enclawed pairing approve ${channel} ${code}`);
	return [
		"Enclawed: access not configured.",
		"",
		idLine,
		"Pairing code:",
		"```",
		code,
		"```",
		"",
		"Ask the bot owner to approve with:",
		formatCliCommand(`enclawed pairing approve ${channel} ${code}`),
		"```",
		approveCommand,
		"```"
	].join("\n");
}
//#endregion
export { buildPairingReply as t };
