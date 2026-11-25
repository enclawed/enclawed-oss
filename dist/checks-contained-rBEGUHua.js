import { d as approvalEffect, n as ApprovalLedger, u as approvalConfirmation } from "./approval-D951on-P.js";
import { a as containProjectScript, p as containmentSupport } from "./mcp-CCxcW5Le.js";
import "./containment-MTY-3mrV.js";
import { a as withTempDir, n as expectThat } from "./types-Cl2qLaUZ.js";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
//#region src/enclawed/conformance/checks-contained.ts
const sha = (b) => createHash("sha256").update(b).digest("hex");
const codePins = {
	id: "contained-code-pins",
	title: "Contained runs load only the code Enclawed read",
	proves: "a command offered containment because Enclawed read what it runs cannot load or execute other code from the project or a writable place inside the containment: a module whose name it computes at run time from a file Enclawed did not read fails to load, a read file whose content changed fails to load, a program it writes is not executable, while the read files themselves run",
	remedy: "do not let the agent run project code without a person on this installation until it is reinstalled; report the failure to your Enclawed contact",
	async run() {
		const sup = containmentSupport();
		if (!sup.ok) return { skip: `containment is not available here (${sup.reason}), so no command is offered it: such commands ask the person` };
		return withTempDir("code-pins", async (dir) => {
			const project = fs.realpathSync(dir);
			const write = (rel, s) => {
				fs.mkdirSync(path.dirname(path.join(project, rel)), { recursive: true });
				fs.writeFileSync(path.join(project, rel), s);
			};
			write("lib/unread.cjs", "require(\"node:fs\").writeFileSync(\"pwned\", \"x\");\n");
			write("main.cjs", "const name = [\"lib\", \"unr\" + \"ead.cjs\"].join(\"/\");\nrequire(require(\"node:path\").join(__dirname, name));\nconsole.log(\"LOADED\");\n");
			write("ok.cjs", "console.log(\"RAN-\" + 6 * 7);\n");
			write("spawn.sh", "printf \"#!/bin/sh\\necho EXECUTED\\n\" > /tmp/w.sh && chmod +x /tmp/w.sh && /tmp/w.sh\n");
			const pin = (rel) => {
				const p = path.join(project, rel);
				return {
					path: p,
					sha256: sha(fs.readFileSync(p)),
					exec: false
				};
			};
			const run = async (line, pins) => {
				const out = await containProjectScript({
					label: "conformance",
					projectDir: project,
					command: "sh",
					args: ["-c", line],
					codePins: pins
				}, { stateDir: path.join(project, ".state") });
				if (!out.ok) throw new Error(`containment refused: ${out.message}`);
				const c = out.containment;
				try {
					const r = spawnSync(c.argv[0], c.argv.slice(1), {
						env: { ...c.env },
						encoding: "utf8",
						timeout: 3e4
					});
					return `${r.stdout}\n${r.stderr}`;
				} finally {
					await c.close();
				}
			};
			const legit = await run("node ok.cjs", [pin("ok.cjs")]);
			expectThat(legit.includes("RAN-42"), `a read file did not run under code pins: ${legit.slice(0, 300)}`);
			expectThat(!(await run("node main.cjs", [pin("main.cjs")])).includes("LOADED") && !fs.existsSync(path.join(project, "pwned")), "a module named at run time, from a file Enclawed did not read, was loaded inside the containment");
			const pins = [pin("main.cjs"), pin("lib/unread.cjs")];
			fs.appendFileSync(path.join(project, "lib/unread.cjs"), "// changed after it was read\n");
			expectThat(!(await run("node main.cjs", pins)).includes("LOADED") && !fs.existsSync(path.join(project, "pwned")), "a read file whose content changed afterwards was loaded inside the containment");
			expectThat(!(await run("sh spawn.sh", [pin("spawn.sh")])).includes("EXECUTED"), "a program the run wrote to a writable place was executed");
		});
	}
};
const ev = (o) => ({
	type: "pre-action",
	actor: {
		kind: "agent",
		id: "conformance"
	},
	callId: "c1",
	tool: "Write",
	policyIds: ["write"],
	kind: "fs-write",
	params: {},
	cwd: "/",
	approvalRoute: "host",
	...o
});
const CHECKS = [codePins, {
	id: "approval-effect-confirmation",
	title: "Approvals state the effect and need an answer derived from it",
	proves: "a call put to a person states its effect in plain words (what cannot be undone, and which file or host), and only an answer derived from that effect (the target's name, then a random code shown with it) approves: the code alone, the name alone, a yes, or the answer of another call is refused",
	remedy: "do not rely on approvals on this installation; reinstall it and report the failure to your Enclawed contact",
	async run() {
		const params = {
			file_path: "/srv/app/deploy/config.yaml",
			content: "x"
		};
		const effect = approvalEffect(ev({
			params,
			writes: [{
				path: params.file_path,
				op: "write"
			}]
		}), {
			reversible: false,
			targets: []
		});
		expectThat(effect.summary.includes("cannot be undone") && effect.summary.includes(params.file_path), `the effect does not say what cannot be undone and where: ${effect.summary}`);
		const ledger = new ApprovalLedger({ code: () => "kqr" });
		const other = approvalConfirmation(approvalEffect(ev({ writes: [{
			path: "/srv/app/notes.txt",
			op: "write"
		}] })), "kqr").answer;
		for (const typed of [
			"kqr",
			"config",
			"y",
			"yes",
			other
		]) {
			const req = ledger.request({
				callId: "c1",
				tool: "Write",
				params,
				reason: "r",
				effect
			});
			expectThat(!ledger.answer({
				type: "approval-answer",
				requestId: req.id,
				typed,
				callId: "c1",
				tool: "Write",
				params
			}).approved, `a reflexive answer approved a call: ${JSON.stringify(typed)}`);
		}
		const req = ledger.request({
			callId: "c1",
			tool: "Write",
			params,
			reason: "r",
			effect
		});
		expectThat(req.confirm.includes("config kqr"), `the prompt does not ask for the effect's word: ${req.confirm}`);
		const v = ledger.answer({
			type: "approval-answer",
			requestId: req.id,
			typed: "Config KQR",
			callId: "c1",
			tool: "Write",
			params
		});
		expectThat(v.approved, `the answer derived from the effect was refused (${v.code})`);
	}
}];
//#endregion
export { CHECKS };
