import { n as defaultRuntime } from "./runtime-1ULlIz69.js";
import { a as verifyHistory } from "./audit-log-qJGFYr5O.js";
import { a as launchRootClaimsInFiles, n as decideAuditAnchorVerdict, r as deviceFactorActivationsInFiles } from "./audit-anchor-verdict-O427eJse.js";
import { r as formatDocsLink } from "./links-CpzyPPKB.js";
import { r as theme } from "./theme-m3fOXe3B.js";
import { t as formatHelpExamples } from "./help-format-Iet8t7MY.js";
import { n as runCommandWithRuntime } from "./cli-utils-0UxwpDtv.js";
import { resolve } from "node:path";
import { homedir } from "node:os";
//#region src/cli/program/register.audit.ts
function defaultAuditPath(env = process.env) {
	const explicit = env.ENCLAWED_AUDIT_PATH ?? env.ENCLAWED_AUDIT_PATH;
	if (typeof explicit === "string" && explicit.length > 0) return explicit;
	return resolve(homedir(), ".enclawed", "audit.jsonl");
}
function registerAuditCommand(program) {
	program.command("audit").description("Inspect the hash-chained framework audit log").addHelpText("after", () => `\n${theme.muted("Docs:")} ${formatDocsLink("/cli/audit", "docs/cli/index.md")}\n`).command("verify [path]").description("Verify a hash-chained audit log end-to-end, across all rotated segments").option("--json", "Output JSON", false).addHelpText("after", () => `\n${theme.heading("Examples:")}\n${formatHelpExamples([
		["enclawed audit verify", "Verify the default audit log (~/.enclawed/audit.jsonl)."],
		["enclawed audit verify /var/log/enclawed/audit.jsonl", "Verify a specific log file."],
		["enclawed audit verify --json", "Machine-readable verification output."]
	])}`).action(async (pathArg, opts) => {
		const path = pathArg && pathArg.length > 0 ? pathArg : defaultAuditPath();
		await runCommandWithRuntime(defaultRuntime, async () => {
			let result;
			try {
				result = await verifyHistory(path);
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
			if (result.ok) {
				const files = result.segments.map((s) => s.file);
				const verdict = decideAuditAnchorVerdict({
					claims: launchRootClaimsInFiles(files),
					device: null,
					chainAnchor: result.anchorId === "enclaweder" ? result.anchor : "absent",
					attestation: result.anchorId === "enclaweder" ? result.anchorAttestation ?? null : null,
					activations: deviceFactorActivationsInFiles(files)
				});
				if (!verdict.ok) {
					if (opts.json) defaultRuntime.writeJson({
						path,
						...result,
						ok: false,
						reason: verdict.detail,
						code: verdict.code
					});
					else {
						defaultRuntime.error(`audit log does NOT verify: ${verdict.detail}`);
						defaultRuntime.error(`path: ${path}`);
					}
					defaultRuntime.exit(1);
					return;
				}
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
				if (result.segments.length > 1) defaultRuntime.log(`segments: ${result.segments.length} (one chain across all of them)`);
				defaultRuntime.log(`path:  ${path}`);
				if (result.anchor === "matched") defaultRuntime.log(`chain ok (head attested by ${result.anchorId})`);
				else if (result.anchor === "matched-offline") defaultRuntime.log(`chain ok (head matches a ${result.anchorId}-signed record, but the device was not present: completeness is not proven)`);
				else defaultRuntime.log("chain ok (no head anchor: completeness is not proven)");
				return;
			}
			defaultRuntime.error(result.brokenAt === null ? `chain broken between segments (${result.reason}); ${result.count} entries verified before failure` : `chain broken at entry ${result.brokenAt} of ${result.file} (${result.reason}); ${result.count} entries verified before failure`);
			defaultRuntime.error(`path: ${path}`);
			defaultRuntime.exit(1);
		});
	});
}
//#endregion
export { registerAuditCommand };
