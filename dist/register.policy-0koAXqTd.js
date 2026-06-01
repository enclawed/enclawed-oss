import { n as resolveDefaultConfigPath } from "./workspace-dir-BFXVbXDc.js";
import { n as defaultRuntime } from "./runtime-DVd7lkz0.js";
import { a as defaultOpenPolicy, c as makeLabel, i as defaultEnclavedPolicy, o as LEVEL, s as format } from "./policy-wE3FfoUy.js";
import { t as getFlavor } from "./flavor-DhzvlYLU.js";
import { t as loadPolicyFromJson } from "./policy-loader-D_0tQcCt.js";
import { t as formatDocsLink } from "./links-CjFnnUDy.js";
import { r as theme } from "./theme-hNdBadll.js";
import { t as formatHelpExamples } from "./help-format-DGXiWSnV.js";
import { n as runCommandWithRuntime } from "./cli-utils-BoeHfEkc.js";
import { readFile } from "node:fs/promises";
//#region src/cli/program/register.policy.ts
function registerPolicyCommand(program) {
	program.command("policy").description("Inspect the effective enclawed policy (allowlists + clearances)").addHelpText("after", () => `\n${theme.muted("Docs:")} ${formatDocsLink("/cli/policy", "docs.enclawed.ai/cli/policy")}\n`).command("show").description("Pretty-print the policy derived from the resolved enclawed.json").option("--config <path>", "Override the config file to load (default: resolved enclawed.json)").option("--json", "Output JSON instead of text", false).addHelpText("after", () => `\n${theme.heading("Examples:")}\n${formatHelpExamples([
		["enclawed policy show", "Show the resolved policy."],
		["enclawed policy show --json", "Machine-readable policy."],
		["enclawed policy show --config ./alt-enclawed.json", "Inspect a candidate config without applying it."]
	])}`).action(async (opts) => {
		await runCommandWithRuntime(defaultRuntime, async () => {
			const flavor = getFlavor(process.env);
			const fallback = flavor === "enclaved" ? defaultEnclavedPolicy() : defaultOpenPolicy();
			const configPath = opts.config ?? resolveDefaultConfigPath({ env: process.env }).path;
			let configDoc;
			let source = "flavor-default";
			let configRead = false;
			try {
				const raw = await readFile(configPath, "utf8");
				configRead = true;
				try {
					configDoc = JSON.parse(raw);
					source = configPath;
				} catch (err) {
					const message = err instanceof Error ? err.message : String(err);
					if (opts.json) defaultRuntime.writeJson({
						ok: false,
						configPath,
						error: `invalid JSON: ${message}`
					});
					else defaultRuntime.error(`enclawed policy show: ${configPath} is not valid JSON (${message})`);
					defaultRuntime.exit(1);
					return;
				}
			} catch (err) {
				if (err.code !== "ENOENT") {
					const message = err instanceof Error ? err.message : String(err);
					if (opts.json) defaultRuntime.writeJson({
						ok: false,
						configPath,
						error: message
					});
					else defaultRuntime.error(`enclawed policy show: ${configPath}: ${message}`);
					defaultRuntime.exit(1);
					return;
				}
			}
			let resolved;
			try {
				resolved = loadPolicyFromJson(configDoc, {
					maxOutputClearance: fallback.maxOutputClearance,
					defaultDataLabel: fallback.defaultDataLabel,
					enforceAllowlists: fallback.enforceAllowlists
				});
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				if (opts.json) defaultRuntime.writeJson({
					ok: false,
					configPath,
					error: message
				});
				else defaultRuntime.error(`enclawed policy show: ${message}`);
				defaultRuntime.exit(1);
				return;
			}
			const view = {
				source: configRead ? source : "flavor-default (no enclawed.json)",
				flavor,
				enforceAllowlists: resolved.enforceAllowlists,
				allowedHosts: [...resolved.allowedHosts].sort(),
				allowedChannels: [...resolved.allowedChannels].sort(),
				allowedProviders: [...resolved.allowedProviders].sort(),
				allowedTools: [...resolved.allowedTools].sort(),
				maxOutputClearance: format(resolved.maxOutputClearance),
				defaultDataLabel: format(resolved.defaultDataLabel)
			};
			if (opts.json) {
				defaultRuntime.writeJson(view);
				return;
			}
			defaultRuntime.log(`policy:`);
			defaultRuntime.log(`  source:             ${view.source}`);
			defaultRuntime.log(`  flavor:             ${view.flavor}`);
			defaultRuntime.log(`  enforceAllowlists:  ${view.enforceAllowlists}`);
			defaultRuntime.log(`  allowedHosts:       ${formatList(view.allowedHosts)}`);
			defaultRuntime.log(`  allowedChannels:    ${formatList(view.allowedChannels)}`);
			defaultRuntime.log(`  allowedProviders:   ${formatList(view.allowedProviders)}`);
			defaultRuntime.log(`  allowedTools:       ${formatList(view.allowedTools)}`);
			defaultRuntime.log(`  maxOutputClearance: ${view.maxOutputClearance}`);
			defaultRuntime.log(`  defaultDataLabel:   ${view.defaultDataLabel}`);
			makeLabel({ level: LEVEL.UNCLASSIFIED });
		});
	});
}
function formatList(items) {
	if (items.length === 0) return "(empty)";
	return items.map((s) => `"${s}"`).join(", ");
}
//#endregion
export { registerPolicyCommand };
