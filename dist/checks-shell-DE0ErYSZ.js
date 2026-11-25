import { W as nodeFsProbe } from "./audit-redact-C0T5dRSd.js";
import { a as createPolicy, c as LEVEL, d as makeLabel } from "./policy-DkHRIVB7.js";
import { t as HistoryStore } from "./history-store-Dkwag-pM.js";
import { D as NO_SHELL_DEFINITIONS, O as containedCommandLine, o as decidePreAction, t as DecisionEngine } from "./engine-D39c_4aO.js";
import { a as withTempDir, n as expectThat } from "./types-Cl2qLaUZ.js";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
const CHECKS = [{
	id: "shell-definition-shadow",
	title: "A command word the shell defines is not the program of its name",
	proves: "a command word shadowed by an alias or function of the shell it runs in (one the adapter names, or one the environment exports as BASH_FUNC_NAME%%) is never decided as the system program: an alias of ls that deletes, a function cat, a function exec in front of a contained command, and any word when the shell's definitions are unknown, are each asked or contained, never run bare as read-only; a backslash that skips an alias leaves the real program read-only",
	remedy: "do not let the agent run shell commands without a person on this installation until it is reinstalled; report the failure to your Enclawed contact",
	run: () => withTempDir("shell-definitions", async (dir) => {
		if (spawnSync("bash", ["-c", "true"]).status !== 0) return { skip: "bash is not available here, so no shell definitions apply" };
		const project = path.join(dir, "project");
		fs.mkdirSync(project, { recursive: true });
		fs.writeFileSync(path.join(project, "README.md"), "# project\n");
		fs.mkdirSync(path.join(project, "test"));
		fs.writeFileSync(path.join(project, "test", "a.test.js"), "const { test } = require(\"node:test\");\ntest(\"a\", () => {});\n");
		const git = (...args) => spawnSync("git", [
			"-c",
			"user.name=c",
			"-c",
			"user.email=c@example.invalid",
			"-c",
			"core.hooksPath=/dev/null",
			...args
		], {
			cwd: project,
			env: {
				PATH: process.env.PATH ?? "/usr/bin:/bin",
				HOME: dir,
				GIT_CONFIG_NOSYSTEM: "1"
			}
		}).status === 0;
		if (!(git("init", "-q") && git("add", "-A") && git("commit", "-q", "-m", "c"))) return { skip: "git is not available here to make the check's project" };
		const realProject = fs.realpathSync(project);
		const policy = createPolicy({
			enforceAllowlists: false,
			maxOutputClearance: makeLabel({ level: LEVEL.UNCLASSIFIED }),
			defaultDataLabel: makeLabel({ level: LEVEL.UNCLASSIFIED })
		});
		const env = {
			PATH: process.env.PATH ?? "/usr/bin:/bin",
			HOME: dir
		};
		let k = 0;
		const opts = (defs, extra = {}) => ({
			host: "conformance",
			policy,
			projectDir: realProject,
			home: dir,
			history: { store: new HistoryStore({
				dir: path.join(dir, `hist-${k++}`),
				limits: policy.history
			}) },
			hardware: () => ({ allowed: true }),
			fs: nodeFsProbe(),
			environment: env,
			shellDefinitions: defs,
			...extra
		});
		const shell = (command) => ({
			type: "pre-action",
			actor: {
				sessionId: "conformance",
				subagentId: null
			},
			callId: `c${k++}`,
			cwd: realProject,
			approvalRoute: "no-person",
			tool: "shell",
			policyIds: ["exec"],
			kind: "shell",
			params: { command },
			command: {
				text: command,
				dialect: "posix"
			}
		});
		const bare = (d) => d.outcome === "allow" && !d.contain;
		const bash = (setup, line, extraEnv = {}) => {
			const r = spawnSync("bash", ["-c", `shopt -s expand_aliases\n${setup}\n${line}`], {
				cwd: realProject,
				encoding: "utf8",
				env: {
					...env,
					...extraEnv
				}
			});
			return `${r.stdout}${r.stderr}`;
		};
		expectThat(bash("alias ls='echo SHADOWED'", "ls") === "SHADOWED\n" && bash("cat() { echo SHADOWED; }", "cat README.md") === "SHADOWED\n", "bash did not run the alias or function in place of the program (the check's premise)");
		const cases = [
			["ls -la", {
				aliases: { ls: "rm -rf ~" },
				functions: []
			}],
			["cat README.md", {
				aliases: {},
				functions: ["cat"]
			}],
			["\\cat README.md", {
				aliases: {},
				functions: ["cat"]
			}],
			[
				"cat README.md",
				NO_SHELL_DEFINITIONS,
				{ "BASH_FUNC_cat%%": "() {  echo x\n}" }
			],
			["ls -la", "unknown"],
			["git status", "unknown"]
		];
		for (const [line, defs, extraEnv] of cases) {
			const d = await decidePreAction(shell(line), opts(defs, extraEnv ? { environment: {
				...env,
				...extraEnv
			} } : {}));
			expectThat(!bare(d) && !d.codes.includes("read-only-command"), `a shadowed command word was decided as the program of its name: ${line} (${d.outcome}: ${d.codes.join(", ")})`);
		}
		expectThat(bash("exec() { echo SHADOWED; }", containedCommandLine({ A: "1" }, ["/bin/true"])) === "SHADOWED\n", "bash did not run a function exec in place of the builtin (the check's premise)");
		const container = async (req) => ({
			ok: true,
			command: containedCommandLine({ ENCLAWED_CONTAIN: "conformance" }, [
				"sh",
				"-c",
				req.command
			])
		});
		const plain = await new DecisionEngine(opts(NO_SHELL_DEFINITIONS, { containScripts: container })).preAction(shell("node --test"));
		expectThat(plain.answer === "allow" && Boolean(plain.rewrite), `the project's tests did not run contained with nothing defined (${plain.answer}: ${plain.codes.join(", ")}): the check cannot show the shadowed case`);
		for (const defs of [{
			aliases: {},
			functions: ["exec"]
		}, "unknown"]) {
			const d = await new DecisionEngine(opts(defs, { containScripts: container })).preAction(shell("node --test"));
			expectThat(d.answer !== "allow" || !d.rewrite, `a contained command was handed to a shell whose exec is not the builtin (${d.answer}: ${d.codes.join(", ")})`);
		}
		for (const [line, defs] of [["\\ls -la", {
			aliases: { ls: "rm -rf ~" },
			functions: []
		}], ["ls -la", NO_SHELL_DEFINITIONS]]) {
			const d = await decidePreAction(shell(line), opts(defs));
			expectThat(bare(d) && d.codes.includes("read-only-command"), `a command word that runs the real program was not read-only: ${line} (${d.outcome}: ${d.codes.join(", ")})`);
		}
	})
}];
//#endregion
export { CHECKS };
