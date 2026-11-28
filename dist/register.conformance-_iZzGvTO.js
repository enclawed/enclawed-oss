import { n as defaultRuntime } from "./runtime-1ULlIz69.js";
import { r as formatDocsLink } from "./links-DrliplKz.js";
import { r as theme } from "./theme-saR5plEq.js";
import { t as formatHelpExamples } from "./help-format-Fea7Z3Mp.js";
import { n as runCommandWithRuntime } from "./cli-utils-BcsJO2Qh.js";
//#region src/cli/program/register.conformance.ts
function registerConformanceCommand(program) {
	program.command("conformance").description("Verify Enclawed's security guarantees on this installation").option("--json", "Output JSON instead of text", false).option("--only <ids>", "Run only these checks (comma-separated ids)").option("--adapter <module>", "Also run the invariants through an agent-CLI adapter's own event mapping (a module exporting enclawedConformanceAdapter)").addHelpText("after", () => `\n${theme.heading("Examples:")}\n${formatHelpExamples([
		["enclawed conformance", "Run every check; one line per guarantee."],
		["enclawed conformance --json", "Machine-readable results."],
		["enclawed conformance --adapter ./node_modules/enclawed-code/src/conformance.mjs", "Also run the invariants through an adapter."]
	])}\n\n${theme.muted("Docs:")} ${formatDocsLink("/cli/conformance", "docs/cli/conformance.md")}\n`).action(async (opts) => {
		await runCommandWithRuntime(defaultRuntime, async () => {
			const { renderConformanceReport, runConformanceChecks } = await import("./conformance-DLr2ACrL.js");
			const only = opts.only?.split(",").map((s) => s.trim()).filter(Boolean);
			const extraChecks = opts.adapter ? await import("./checks-adapter-CSNaQpsk.js").then(async (m) => m.adapterChecks(await m.loadConformanceAdapter(opts.adapter))) : [];
			const report = await runConformanceChecks({
				...only?.length ? { only } : {},
				extraChecks
			});
			if (opts.json) defaultRuntime.writeJson(report);
			else defaultRuntime.log(renderConformanceReport(report));
			if (!report.ok) defaultRuntime.exit(1);
		});
	});
}
//#endregion
export { registerConformanceCommand };
