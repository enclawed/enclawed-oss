import { n as defaultRuntime, r as writeRuntimeJson } from "./runtime-DVd7lkz0.js";
import { t as formatDocsLink } from "./links-CjFnnUDy.js";
import { r as theme } from "./theme-hNdBadll.js";
import { n as formatBackupCreateSummary, t as createBackupArchive } from "./backup-create-QgbZhBfR.js";
import { t as formatHelpExamples } from "./help-format-DGXiWSnV.js";
import { n as runCommandWithRuntime } from "./cli-utils-BoeHfEkc.js";
import { t as backupVerifyCommand } from "./backup-verify-D6iiSugX.js";
//#region src/commands/backup.ts
let backupVerifyRuntimePromise;
function loadBackupVerifyRuntime() {
	backupVerifyRuntimePromise ??= import("./backup-verify-BYYm8he0.js");
	return backupVerifyRuntimePromise;
}
async function backupCreateCommand(runtime, opts = {}) {
	const result = await createBackupArchive(opts);
	if (opts.verify && !opts.dryRun) {
		const { backupVerifyCommand } = await loadBackupVerifyRuntime();
		await backupVerifyCommand({
			...runtime,
			log: () => {}
		}, {
			archive: result.archivePath,
			json: false
		});
		result.verified = true;
	}
	if (opts.json) writeRuntimeJson(runtime, result);
	else runtime.log(formatBackupCreateSummary(result).join("\n"));
	return result;
}
//#endregion
//#region src/cli/program/register.backup.ts
function registerBackupCommand(program) {
	const backup = program.command("backup").description("Create and verify local backup archives for Enclawed state").addHelpText("after", () => `\n${theme.muted("Docs:")} ${formatDocsLink("/cli/backup", "docs.enclawed.ai/cli/backup")}\n`);
	backup.command("create").description("Write a backup archive for config, credentials, sessions, and workspaces").option("--output <path>", "Archive path or destination directory").option("--json", "Output JSON", false).option("--dry-run", "Print the backup plan without writing the archive", false).option("--verify", "Verify the archive after writing it", false).option("--only-config", "Back up only the active JSON config file", false).option("--no-include-workspace", "Exclude workspace directories from the backup").addHelpText("after", () => `\n${theme.heading("Examples:")}\n${formatHelpExamples([
		["enclawed backup create", "Create a timestamped backup in the current directory."],
		["enclawed backup create --output ~/Backups", "Write the archive into an existing backup directory."],
		["enclawed backup create --dry-run --json", "Preview the archive plan without writing any files."],
		["enclawed backup create --verify", "Create the archive and immediately validate its manifest and payload layout."],
		["enclawed backup create --no-include-workspace", "Back up state/config without agent workspace files."],
		["enclawed backup create --only-config", "Back up only the active JSON config file."]
	])}`).action(async (opts) => {
		await runCommandWithRuntime(defaultRuntime, async () => {
			await backupCreateCommand(defaultRuntime, {
				output: opts.output,
				json: Boolean(opts.json),
				dryRun: Boolean(opts.dryRun),
				verify: Boolean(opts.verify),
				onlyConfig: Boolean(opts.onlyConfig),
				includeWorkspace: opts.includeWorkspace
			});
		});
	});
	backup.command("verify <archive>").description("Validate a backup archive and its embedded manifest").option("--json", "Output JSON", false).addHelpText("after", () => `\n${theme.heading("Examples:")}\n${formatHelpExamples([["enclawed backup verify ./2026-03-09T00-00-00.000Z-enclawed-backup.tar.gz", "Check that the archive structure and manifest are intact."], ["enclawed backup verify ~/Backups/latest.tar.gz --json", "Emit machine-readable verification output."]])}`).action(async (archive, opts) => {
		await runCommandWithRuntime(defaultRuntime, async () => {
			await backupVerifyCommand(defaultRuntime, {
				archive,
				json: Boolean(opts.json)
			});
		});
	});
}
//#endregion
export { registerBackupCommand };
