import { a as resetAgentToolGuardForTest } from "./agent-tool-guard-CAhgsJQb.js";
import { t as ApprovalGrantLedger } from "./approval-binding-DJpS6Wuh.js";
import { a as withTempDir, i as withEnv, n as expectThat, r as installSandboxRuntime } from "./types-CPFzDBXk.js";
import { l as runWithToolCallApprover, o as runBeforeToolCallHook } from "./pi-tools.before-tool-call-CLNI8eCu.js";
import { r as buildSystemRunApprovalBinding } from "./system-run-command-Bu05DcpI.js";
import { n as ExecApprovalManager, t as sanitizeSystemRunParamsForForwarding } from "./node-invoke-system-run-approval-DckSYJO_.js";
import fs from "node:fs";
import path from "node:path";
//#region src/enclawed/conformance/checks-approval.ts
const client = {
	connId: "conn-1",
	connect: {
		scopes: ["operator.write", "operator.approvals"],
		device: { id: "dev-1" },
		client: { id: "cli-1" }
	}
};
function execApproval(runId) {
	const manager = new ExecApprovalManager();
	const record = manager.create({
		host: "node",
		nodeId: "node-1",
		command: "echo SAFE",
		commandArgv: ["echo", "SAFE"],
		systemRunBinding: buildSystemRunApprovalBinding({
			argv: ["echo", "SAFE"],
			cwd: null,
			agentId: null,
			sessionKey: null
		}).binding,
		cwd: null,
		agentId: null,
		sessionKey: null
	}, 6e4, runId);
	record.requestedByConnId = "conn-1";
	record.requestedByDeviceId = "dev-1";
	record.requestedByClientId = "cli-1";
	const decision = manager.register(record, 6e4);
	const invoke = (over = {}) => {
		const command = over.command ?? ["echo", "SAFE"];
		return sanitizeSystemRunParamsForForwarding({
			nodeId: over.nodeId ?? "node-1",
			rawParams: {
				command,
				rawCommand: command.join(" "),
				runId,
				approved: true,
				approvalDecision: "allow-once"
			},
			client,
			execApprovalManager: manager,
			nowMs: over.nowMs ?? Date.now()
		});
	};
	return {
		manager,
		record,
		decision,
		invoke
	};
}
const DENY = {
	kind: "decision",
	decision: "deny"
};
const ALLOW_ONCE = {
	kind: "decision",
	decision: "allow-once"
};
/** Gate one irreversible write in `workspace`; `during` runs while the person decides. */
async function gateWrite(workspace, params, during = () => {}, toolCallId = "c1") {
	let asked = 0;
	return {
		blocked: (await runWithToolCallApprover(async (_req) => {
			asked += 1;
			during();
			return ALLOW_ONCE;
		}, () => runBeforeToolCallHook({
			toolName: "write",
			params,
			toolCallId,
			ctx: {
				agentId: "conformance",
				sessionKey: "conformance",
				fsRoot: workspace
			}
		}))).blocked,
		asked
	};
}
function enclavedWritesNeedAPerson() {
	return installSandboxRuntime("enclaved", { history: { noHistoryTools: [
		"write",
		"edit",
		"apply_patch"
	] } });
}
const CHECKS = [{
	id: "approval-replay",
	title: "Approval single use and binding",
	proves: "an approval runs one execution of the exact tool, arguments and target it was given for; a replay, other arguments, another target or a late answer is refused",
	remedy: "do not rely on approvals on this installation; reinstall it and report the failure to your Enclawed contact",
	async run() {
		const once = execApproval("conf-once");
		once.manager.resolve("conf-once", "allow-once", null);
		await once.decision;
		expectThat(once.invoke().ok, "an approved command did not run");
		expectThat(!once.invoke().ok, "a used exec approval ran a second time");
		const fallback = execApproval("conf-fallback");
		fallback.manager.expire("conf-fallback");
		await fallback.decision;
		expectThat(fallback.invoke().ok && !fallback.invoke().ok, "a timed-out fallback ran twice");
		const other = execApproval("conf-other");
		other.manager.resolve("conf-other", "allow-once", "operator");
		await other.decision;
		expectThat(!other.invoke({ command: [
			"rm",
			"-rf",
			"/"
		] }).ok, "an approval ran another command");
		expectThat(!other.invoke({ nodeId: "node-2" }).ok, "an approval ran on another machine");
		expectThat(!other.invoke({ nowMs: other.record.expiresAtMs + 1 }).ok, "an expired exec approval ran");
		let now = 1e3;
		const ledger = new ApprovalGrantLedger(() => now);
		const g = ledger.issue({
			tool: "write",
			args: { path: "a" }
		}, { ttlMs: 1e3 });
		ledger.approve(g.id);
		expectThat(ledger.consume(g.id, {
			tool: "write",
			args: { path: "a" }
		}).ok, "a grant was refused");
		expectThat(!ledger.consume(g.id, {
			tool: "write",
			args: { path: "a" }
		}).ok, "a grant was used twice");
		const g2 = ledger.issue({
			tool: "write",
			args: { path: "a" }
		}, { ttlMs: 1e3 });
		ledger.approve(g2.id);
		expectThat(!ledger.consume(g2.id, {
			tool: "write",
			args: { path: "b" }
		}).ok, "a grant covered other arguments");
		const g3 = ledger.issue({
			tool: "write",
			args: {}
		}, { ttlMs: 1e3 });
		ledger.approve(g3.id);
		now += 5e3;
		expectThat(!ledger.consume(g3.id, {
			tool: "write",
			args: {}
		}).ok, "an expired grant was used");
		enclavedWritesNeedAPerson();
		try {
			await withEnv({ ENCLAWEDER_ROOT: void 0 }, async () => {
				await withTempDir("approval", async (ws) => {
					const a = await gateWrite(ws, {
						path: "n.txt",
						content: "x"
					}, () => {}, "c1");
					const b = await gateWrite(ws, {
						path: "n.txt",
						content: "x"
					}, () => {}, "c2");
					expectThat(!a.blocked && !b.blocked, "an approved write was refused");
					expectThat(a.asked === 1 && b.asked === 1, "one approval covered two calls");
					const params = {
						path: "n.txt",
						content: "approved"
					};
					expectThat((await gateWrite(ws, params, () => {
						params.content = "something else";
					})).blocked, "arguments changed after approval still ran");
					expectThat((await runWithToolCallApprover(async () => DENY, () => runBeforeToolCallHook({
						toolName: "write",
						params: {
							path: "n.txt",
							content: "x"
						},
						ctx: {
							agentId: "conformance",
							sessionKey: "conformance",
							fsRoot: ws
						}
					}))).blocked, "a denied write ran");
				});
			});
		} finally {
			resetAgentToolGuardForTest();
		}
	}
}, {
	id: "approval-toctou",
	title: "Approval-to-execution resource changes",
	proves: "if the approved file or directory is swapped for a symlink, replaced, hard-linked or renamed before the action runs, the action is refused and must be approved again",
	remedy: "do not approve file writes on this installation until it is reinstalled; report the failure to your Enclawed contact",
	async run() {
		enclavedWritesNeedAPerson();
		try {
			await withEnv({ ENCLAWEDER_ROOT: void 0 }, async () => {
				await withTempDir("toctou", async (root) => {
					const ws = path.join(root, "ws");
					const protectedDir = path.join(root, "protected");
					fs.mkdirSync(ws);
					fs.mkdirSync(protectedDir);
					const secret = path.join(protectedDir, "secret");
					fs.writeFileSync(secret, "s");
					const p = path.join(ws, "notes.txt");
					fs.writeFileSync(p, "v1");
					expectThat(!(await gateWrite(ws, {
						path: "notes.txt",
						content: "v2"
					}, () => {
						fs.appendFileSync(p, "+");
					})).blocked, "an approved write to an unchanged file was refused");
					const cases = [
						["swapped for a symlink", () => {
							fs.rmSync(p, { force: true });
							fs.symlinkSync(secret, p);
						}],
						["replaced by another file", () => {
							fs.rmSync(p, { force: true });
							fs.writeFileSync(`${p}.n`, "o");
							fs.renameSync(`${p}.n`, p);
						}],
						["replaced by a hard link", () => {
							fs.rmSync(p, { force: true });
							fs.linkSync(secret, p);
						}]
					];
					for (const [what, attack] of cases) {
						fs.rmSync(p, { force: true });
						fs.writeFileSync(p, "v1");
						expectThat((await gateWrite(ws, {
							path: "notes.txt",
							content: "pwned"
						}, attack)).blocked, `a write ran although its target was ${what} after approval`);
					}
					const dir = path.join(ws, "docs");
					fs.mkdirSync(dir);
					fs.writeFileSync(path.join(dir, "a.txt"), "v1");
					expectThat((await gateWrite(ws, {
						path: "docs/a.txt",
						content: "v2"
					}, () => {
						fs.renameSync(dir, path.join(ws, "docs-old"));
						fs.mkdirSync(dir);
						fs.writeFileSync(path.join(dir, "a.txt"), "decoy");
					})).blocked, "a write ran although its directory was replaced after approval");
				});
			});
		} finally {
			resetAgentToolGuardForTest();
		}
	}
}];
//#endregion
export { CHECKS };
