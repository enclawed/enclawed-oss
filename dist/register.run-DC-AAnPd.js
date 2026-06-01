import { n as defaultRuntime } from "./runtime-DVd7lkz0.js";
import { t as formatDocsLink } from "./links-CjFnnUDy.js";
import { r as theme } from "./theme-hNdBadll.js";
import { t as formatHelpExamples } from "./help-format-DGXiWSnV.js";
import { n as runCommandWithRuntime } from "./cli-utils-BoeHfEkc.js";
import { t as createDefaultDeps } from "./deps-m2fnVQr7.js";
import { t as agentCliCommand } from "./agent-via-gateway-P1n0C72K.js";
import { readFile } from "node:fs/promises";
//#region src/cli/program/register.run.ts
const SECTION_RE = /^##\s+(.+?)\s*$/gm;
function parseTaskFile(raw) {
	const sections = {};
	const matches = [];
	let match;
	const re = new RegExp(SECTION_RE);
	while ((match = re.exec(raw)) !== null) {
		matches.push({
			name: match[1].toLowerCase(),
			start: match.index + match[0].length,
			end: raw.length
		});
		if (matches.length > 1) matches[matches.length - 2].end = match.index;
	}
	for (const m of matches) sections[m.name] = raw.slice(m.start, m.end).trim();
	const userMessage = sections.user ?? sections.message ?? sections.task ?? "";
	const systemPrompt = sections.system ?? sections.systemprompt;
	if (!userMessage) throw new Error("task file must contain a `## User` (or `## Message`) section with the user prompt");
	return {
		systemPrompt,
		userMessage
	};
}
const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;
function substituteVars(text, vars) {
	return text.replace(PLACEHOLDER_RE, (orig, key) => {
		if (Object.hasOwn(vars, key)) return vars[key];
		return orig;
	});
}
function parseVarAssignments(raw) {
	const out = {};
	for (const entry of raw) {
		const eq = entry.indexOf("=");
		if (eq <= 0) throw new Error(`invalid --var "${entry}" (expected k=v with non-empty key)`);
		const key = entry.slice(0, eq).trim();
		if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) throw new Error(`invalid --var key "${key}" (must match [a-zA-Z_][a-zA-Z0-9_]*)`);
		out[key] = entry.slice(eq + 1);
	}
	return out;
}
function collectVar(value, prev = []) {
	return [...prev, value];
}
function registerRunCommand(program) {
	program.command("run <taskFile>").description("Run a markdown-defined task (## System / ## User sections) as one or more agent turns").option("--var <k=v>", "Substitute {{k}} placeholders inside the task file. Repeat for multiple vars.", collectVar, []).option("--max-steps <n>", "Maximum agent turns to run before exiting (default 1)", "1").option("--agent <id>", "Agent id (forwarded to `enclawed agent`)").option("--local", "Run the embedded agent locally (requires model provider API keys in your shell)", false).option("--session-id <id>", "Use an explicit session id").option("--to <number>", "E.164 recipient (forwarded to `enclawed agent`)").option("--thinking <level>", "Thinking level forwarded to the agent turn").option("--json", "Output JSON instead of text", false).option("--timeout <seconds>", "Override agent command timeout (seconds; forwarded to `enclawed agent`)").addHelpText("after", () => `\n${theme.heading("Examples:")}\n${formatHelpExamples([["enclawed run ./tasks/secretary.md --var window=24h", "Run a single agent turn with {{window}} substituted."], ["enclawed run ./tasks/triage.md --max-steps 3 --agent ops --local", "Up to three turns through the local agent."]])}\n\n${theme.muted("Docs:")} ${formatDocsLink("/cli/run", "docs.enclawed.ai/cli/run")}`).action(async (taskFile, opts) => {
		await runCommandWithRuntime(defaultRuntime, async () => {
			const maxSteps = Number.parseInt(opts.maxSteps, 10);
			if (!Number.isInteger(maxSteps) || maxSteps < 1) {
				defaultRuntime.error("enclawed run: --max-steps must be a positive integer");
				defaultRuntime.exit(1);
				return;
			}
			let raw;
			try {
				raw = await readFile(taskFile, "utf8");
			} catch (err) {
				defaultRuntime.error(`enclawed run: cannot read task file ${taskFile}: ${err instanceof Error ? err.message : String(err)}`);
				defaultRuntime.exit(1);
				return;
			}
			let vars;
			try {
				vars = parseVarAssignments(opts.var ?? []);
			} catch (err) {
				defaultRuntime.error(`enclawed run: ${err instanceof Error ? err.message : String(err)}`);
				defaultRuntime.exit(1);
				return;
			}
			let parsed;
			try {
				parsed = parseTaskFile(substituteVars(raw, vars));
			} catch (err) {
				defaultRuntime.error(`enclawed run: ${err instanceof Error ? err.message : String(err)}`);
				defaultRuntime.exit(1);
				return;
			}
			const baseAgentOpts = {
				message: parsed.userMessage,
				...opts.agent ? { agent: opts.agent } : {},
				...opts.local ? { local: true } : {},
				...opts.sessionId ? { sessionId: opts.sessionId } : {},
				...opts.to ? { to: opts.to } : {},
				...opts.thinking ? { thinking: opts.thinking } : {},
				...opts.json ? { json: true } : {},
				...opts.timeout ? { timeout: opts.timeout } : {},
				...parsed.systemPrompt ? { extraSystemPrompt: parsed.systemPrompt } : {}
			};
			const deps = createDefaultDeps();
			let step = 0;
			while (step < maxSteps) {
				step += 1;
				defaultRuntime.log(`[run] step ${step}/${maxSteps}`);
				try {
					await agentCliCommand(baseAgentOpts, defaultRuntime, deps);
				} catch (err) {
					defaultRuntime.error(`enclawed run: step ${step} failed: ${err instanceof Error ? err.message : String(err)}`);
					defaultRuntime.exit(1);
					return;
				}
			}
		});
	});
}
//#endregion
export { parseTaskFile, parseVarAssignments, registerRunCommand, substituteVars };
