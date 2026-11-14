import { t as runStatusJsonCommand } from "./status-json-command-D39G_dhi.js";
import { t as scanStatusJsonFast } from "./status.scan.fast-json-BiwuBbAR.js";
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
