import { n as defaultRuntime } from "./runtime-DVd7lkz0.js";
import { n as verifyChain } from "./audit-log-C65NJQk2.js";
import { t as formatDocsLink } from "./links-CjFnnUDy.js";
import { r as theme } from "./theme-hNdBadll.js";
import { t as formatHelpExamples } from "./help-format-DGXiWSnV.js";
import { n as runCommandWithRuntime } from "./cli-utils-BoeHfEkc.js";
import { resolve } from "node:path";
import { homedir } from "node:os";
//#region src/cli/program/register.audit.ts
function defaultAuditPath(env = process.env) {
	const explicit = env.ENCLAWED_AUDIT_PATH ?? env.ENCLAWED_AUDIT_PATH;
	if (typeof explicit === "string" && explicit.length > 0) return explicit;
	return resolve(homedir(), ".enclawed", "audit.jsonl");
}
function registerAuditCommand(program) {
	program.command("audit").description("Inspect the hash-chained framework audit log").addHelpText("after", () => `\n${theme.muted("Docs:")} ${formatDocsLink("/cli/audit", "docs.enclawed.ai/cli/audit")}\n`).command("verify [path]").description("Verify a hash-chained audit JSONL file end-to-end").option("--json", "Output JSON", false).addHelpText("after", () => `\n${theme.heading("Examples:")}\n${formatHelpExamples([
		["enclawed audit verify", "Verify the default audit log (~/.enclawed/audit.jsonl)."],
		["enclawed audit verify /var/log/enclawed/audit.jsonl", "Verify a specific log file."],
		["enclawed audit verify --json", "Machine-readable verification output."]
	])}`).action(async (pathArg, opts) => {
		const path = pathArg && pathArg.length > 0 ? pathArg : defaultAuditPath();
		await runCommandWithRuntime(defaultRuntime, async () => {
			let result;
			try {
				result = await verifyChain(path);
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				if (opts.json) defaultRuntime.writeJson({
					ok: false,
					path,
					error: message
				});
				else defaultRuntime.error(`enclawed audit verify: ${path}: ${message}`);
				defaultRuntime.exit(1);
				return;
			}
			if (opts.json) {
				defaultRuntime.writeJson({
					path,
					...result
				});
				if (!result.ok) defaultRuntime.exit(1);
				return;
			}
			if (result.ok) {
				defaultRuntime.log(`verified ${result.count} entries`);
				defaultRuntime.log(`path:  ${path}`);
				defaultRuntime.log("chain ok");
				return;
			}
			defaultRuntime.error(`chain broken at entry ${result.brokenAt} (${result.reason}); ${result.count} entries verified before failure`);
			defaultRuntime.error(`path: ${path}`);
			defaultRuntime.exit(1);
		});
	});
}
//#endregion
export { registerAuditCommand };
