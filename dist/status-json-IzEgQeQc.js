import { t as runStatusJsonCommand } from "./status-json-command-DBu_9TE9.js";
import { t as scanStatusJsonFast } from "./status.scan.fast-json-CDOC5fNT.js";
//#region src/commands/status-json.ts
async function statusJsonCommand(opts, runtime) {
	await runStatusJsonCommand({
		opts,
		runtime,
		scanStatusJsonFast,
		includeSecurityAudit: opts.all === true,
		suppressHealthErrors: true
	});
}
//#endregion
export { statusJsonCommand };
