import { n as getRuntime } from "./runtime-Dt7e6nAN.js";
import { n as defaultRuntime } from "./runtime-1ULlIz69.js";
import { t as DEFAULT_HISTORY_POLICY } from "./policy-DkHRIVB7.js";
import { t as HistoryStore } from "./history-store-Dkwag-pM.js";
import { n as restoreSnapshot, t as RestoreError } from "./history-restore-8tM_fTZ8.js";
import { r as theme } from "./theme-m3fOXe3B.js";
import { t as formatHelpExamples } from "./help-format-Iet8t7MY.js";
import { n as runCommandWithRuntime } from "./cli-utils-0UxwpDtv.js";
//#region src/cli/program/register.history.ts
function openStore() {
	return new HistoryStore({ limits: getRuntime()?.policy.history ?? DEFAULT_HISTORY_POLICY });
}
function registerHistoryCommand(program) {
	const history = program.command("history").description("List and restore the local history of files agents changed").addHelpText("after", () => `\n${theme.heading("Examples:")}\n${formatHelpExamples([
		["enclawed history list", "Every snapshot kept, oldest first."],
		["enclawed history list ./notes.md", "Snapshots of one file."],
		["enclawed history restore <hash>", "Put a snapshot back where it came from."],
		["enclawed history restore <hash> --to ./copy.md", "Restore to another path."]
	])}`);
	history.command("list [path]").description("List kept snapshots, optionally for one path").option("--json", "Output JSON", false).action(async (pathArg, opts) => {
		await runCommandWithRuntime(defaultRuntime, async () => {
			const store = openStore();
			const entries = await store.list(pathArg);
			if (opts.json) {
				defaultRuntime.writeJson({
					dir: store.dir,
					entries
				});
				return;
			}
			if (entries.length === 0) {
				defaultRuntime.log(`no snapshots (${store.dir})`);
				return;
			}
			for (const e of entries) {
				const what = e.hash ? `${e.hash}  ${e.size} B` : "(created; no prior content)";
				const where = e.sandbox ? `${e.sandbox.containerPath} (sandbox ${e.sandbox.runtimeId})` : e.realPath;
				defaultRuntime.log(`${new Date(e.ts).toISOString()}  ${e.op.padEnd(7)} ${what}  ${where}  [${e.tool}]`);
			}
		});
	});
	history.command("restore <hash>").description("Restore a snapshot after verifying its content hash (audited)").option("--to <path>", "Restore to this path instead of the recorded one").option("--json", "Output JSON", false).action(async (hash, opts) => {
		await runCommandWithRuntime(defaultRuntime, async () => {
			try {
				const result = await restoreSnapshot({
					hash,
					to: opts.to,
					store: openStore(),
					openSandbox: async (origin) => (await import("./history-sandbox.runtime-Cb1P1kAt.js")).openSnapshotSandbox(origin)
				});
				if (opts.json) {
					defaultRuntime.writeJson({
						ok: true,
						...result
					});
					return;
				}
				defaultRuntime.log(result.sandbox ? `restored ${result.hash} to ${result.to} in ${result.sandbox.backendId} sandbox ${result.sandbox.runtimeId}` : `restored ${result.hash} to ${result.to}`);
				if (result.replacedSnapshot) defaultRuntime.log(`previous content kept as ${result.replacedSnapshot}`);
			} catch (err) {
				const code = err instanceof RestoreError ? err.code : "write-failed";
				const message = err instanceof Error ? err.message : String(err);
				if (opts.json) defaultRuntime.writeJson({
					ok: false,
					code,
					error: message
				});
				else defaultRuntime.error(`enclawed history restore: ${message}`);
				defaultRuntime.exit(1);
			}
		});
	});
	history.command("prune").description("Drop snapshots older than enclawed.policy.history.maxAgeDays now").option("--json", "Output JSON", false).action(async (opts) => {
		await runCommandWithRuntime(defaultRuntime, async () => {
			const store = openStore();
			const result = await store.prune();
			if (opts.json) {
				defaultRuntime.writeJson({
					dir: store.dir,
					...result
				});
				return;
			}
			defaultRuntime.log(`removed ${result.removedEntries} entries and ${result.removedObjects} snapshots`);
		});
	});
}
//#endregion
export { registerHistoryCommand };
