import { n as getRuntime } from "./runtime-Dt7e6nAN.js";
import { n as resolvePreferredEnclawedTmpDir } from "./tmp-enclawed-dir-Dv5ezX8B.js";
import { t as getFlavor } from "./flavor-B_qZPDJJ.js";
import { n as pathMatchesEntry, t as isInsideDir } from "./history-paths-DhTjGYwI.js";
import { c as hardwareRootHealth, d as hardwareRootPresent, f as hardwareRootRequired, l as hardwareRootInfo } from "./hardware-root-GWFBtC9-.js";
import { a as CAPABILITY, n as isFsWriteTool, t as classifyToolCall } from "./tool-capability-map-H5F2cUc3.js";
import { t as HistoryStore } from "./history-store-Dkwag-pM.js";
import path from "node:path";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import { promisify } from "node:util";
//#region src/enclawed/fs-reversibility.ts
const execFileAsync = promisify(execFile);
async function realpathOrNearest(abs) {
	let probe = abs;
	const rest = [];
	for (;;) try {
		const real = await fs.realpath(probe);
		return rest.length ? path.join(real, ...rest.toReversed()) : real;
	} catch {
		const parent = path.dirname(probe);
		if (parent === probe) return abs;
		rest.push(path.basename(probe));
		probe = parent;
	}
}
let cachedGatewayTmpDir;
function gatewayTmpDir() {
	if (cachedGatewayTmpDir === void 0) try {
		cachedGatewayTmpDir = path.resolve(resolvePreferredEnclawedTmpDir({ warn: () => {} }));
	} catch {
		cachedGatewayTmpDir = null;
	}
	return cachedGatewayTmpDir;
}
async function gitCleanHead(realPath) {
	const dir = path.dirname(realPath);
	const base = path.basename(realPath);
	const opts = {
		timeout: 5e3,
		windowsHide: true
	};
	try {
		await execFileAsync("git", [
			"-C",
			dir,
			"ls-files",
			"--error-unmatch",
			"--",
			base
		], opts);
		if ((await execFileAsync("git", [
			"-C",
			dir,
			"status",
			"--porcelain",
			"--",
			base
		], opts)).stdout.trim() !== "") return null;
		return (await execFileAsync("git", [
			"-C",
			dir,
			"rev-parse",
			"HEAD"
		], opts)).stdout.trim() || null;
	} catch {
		return null;
	}
}
let defaultStore = null;
function storeFor(policy) {
	const store = new HistoryStore({ limits: policy.history });
	const key = JSON.stringify([
		store.dir,
		policy.history.maxTotalBytes,
		policy.history.maxAgeDays
	]);
	if (defaultStore?.key !== key) defaultStore = {
		key,
		store
	};
	return defaultStore.store;
}
/**
* Classify every target of one call and keep the history that makes it
* reversible. The call is reversible only if every target is.
*/
async function prepareFsWriteHistory(params) {
	const { policy, tool } = params;
	const store = params.store ?? storeFor(policy);
	const tmpDir = params.gatewayTmpDir === void 0 ? gatewayTmpDir() : params.gatewayTmpDir;
	const scratchRoots = await Promise.all([...tmpDir ? [tmpDir] : [], ...policy.scratchPaths].map((p) => realpathOrNearest(p)));
	const workspaceRoot = params.fsRoot ? await realpathOrNearest(path.resolve(params.fsRoot)) : null;
	const results = [];
	for (const target of params.targets) results.push(params.sandbox ? await classifySandboxTarget(target, params.sandbox) : await classifyTarget(target));
	return {
		reversible: results.every((r) => r.reversible),
		targets: results
	};
	async function classifySandboxTarget(target, sandbox) {
		const base = {
			path: target.path,
			op: target.op
		};
		if (!target.absPath) return {
			...base,
			realPath: null,
			reversible: false,
			code: "unresolvable-path"
		};
		const query = {
			filePath: target.absPath,
			cwd: sandbox.root
		};
		let resolved;
		try {
			resolved = sandbox.files.resolvePath(query);
		} catch {
			return {
				...base,
				realPath: null,
				reversible: false,
				code: "outside-allowed-roots"
			};
		}
		const at = {
			...base,
			realPath: resolved.hostPath ?? resolved.containerPath,
			sandbox: {
				...sandbox.ref,
				containerPath: resolved.containerPath
			}
		};
		if (policy.history.noHistoryTools.has(tool)) return {
			...at,
			reversible: false,
			code: "no-history-tool"
		};
		const candidates = [
			target.absPath,
			resolved.containerPath,
			resolved.hostPath
		].filter((p) => typeof p === "string");
		if (policy.history.noHistoryPaths.some((entry) => candidates.some((p) => pathMatchesEntry(p, entry)))) return {
			...at,
			reversible: false,
			code: "no-history-path"
		};
		const meta = {
			path: target.path,
			realPath: at.realPath,
			op: target.op,
			tool,
			toolCallId: params.toolCallId ?? null,
			agentId: params.agentId ?? null,
			sandbox: {
				...at.sandbox,
				bridgePath: target.absPath,
				bridgeCwd: sandbox.root
			}
		};
		let st;
		try {
			st = await sandbox.files.stat(query);
		} catch {
			return {
				...at,
				reversible: false,
				code: "sandbox-read-failed"
			};
		}
		if (st === null) {
			try {
				await store.record({
					...meta,
					hash: null,
					size: 0
				});
			} catch {
				return {
					...at,
					reversible: false,
					code: "store-failed"
				};
			}
			return {
				...at,
				reversible: true,
				basis: "snapshot",
				snapshot: null,
				prior: "absent"
			};
		}
		if (st.type !== "file") return {
			...at,
			reversible: false,
			code: "special-file"
		};
		if (st.size > policy.history.maxFileBytes) return {
			...at,
			reversible: false,
			code: "over-size-cap"
		};
		let content;
		try {
			content = await sandbox.files.readFile(query);
		} catch {
			return {
				...at,
				reversible: false,
				code: "sandbox-read-failed"
			};
		}
		if (content.length > policy.history.maxFileBytes) return {
			...at,
			reversible: false,
			code: "over-size-cap"
		};
		const put = await store.put(content);
		if (!put.ok) return {
			...at,
			reversible: false,
			code: put.code
		};
		try {
			await store.record({
				...meta,
				hash: put.hash,
				size: content.length
			});
		} catch {
			return {
				...at,
				reversible: false,
				code: "store-failed"
			};
		}
		return {
			...at,
			reversible: true,
			basis: "snapshot",
			snapshot: put.hash,
			prior: "content"
		};
	}
	async function classifyTarget(target) {
		const base = {
			path: target.path,
			op: target.op
		};
		if (!target.absPath) return {
			...base,
			realPath: null,
			reversible: false,
			code: "unresolvable-path"
		};
		const realPath = await realpathOrNearest(target.absPath);
		const at = {
			...base,
			realPath
		};
		if (scratchRoots.some((root) => isInsideDir(root, realPath))) return {
			...at,
			reversible: true,
			basis: "scratch",
			snapshot: null,
			prior: "unrecorded"
		};
		if (!workspaceRoot || !isInsideDir(workspaceRoot, realPath)) return {
			...at,
			reversible: false,
			code: "outside-allowed-roots"
		};
		if (policy.history.noHistoryTools.has(tool)) return {
			...at,
			reversible: false,
			code: "no-history-tool"
		};
		if (policy.history.noHistoryPaths.some((entry) => pathMatchesEntry(target.absPath, entry) || pathMatchesEntry(realPath, entry))) return {
			...at,
			reversible: false,
			code: "no-history-path"
		};
		const meta = {
			path: target.path,
			realPath,
			op: target.op,
			tool,
			toolCallId: params.toolCallId ?? null,
			agentId: params.agentId ?? null
		};
		let st;
		try {
			st = await fs.lstat(realPath);
		} catch (err) {
			if (err.code === "ENOENT") {
				try {
					await store.record({
						...meta,
						hash: null,
						size: 0
					});
				} catch {
					return {
						...at,
						reversible: false,
						code: "store-failed"
					};
				}
				return {
					...at,
					reversible: true,
					basis: "snapshot",
					snapshot: null,
					prior: "absent"
				};
			}
			return {
				...at,
				reversible: false,
				code: "unreadable"
			};
		}
		if (!st.isFile()) return {
			...at,
			reversible: false,
			code: "special-file"
		};
		let failure = "unreadable";
		if (st.size > policy.history.maxFileBytes) failure = "over-size-cap";
		else {
			let content = null;
			try {
				content = await fs.readFile(realPath);
			} catch {
				failure = "unreadable";
			}
			if (content) if (content.length > policy.history.maxFileBytes) failure = "over-size-cap";
			else {
				const put = await store.put(content);
				if (put.ok) try {
					await store.record({
						...meta,
						hash: put.hash,
						size: content.length
					});
					return {
						...at,
						reversible: true,
						basis: "snapshot",
						snapshot: put.hash,
						prior: "content"
					};
				} catch {
					failure = "store-failed";
				}
				else failure = put.code;
			}
		}
		const gitHead = await gitCleanHead(realPath);
		if (gitHead) return {
			...at,
			reversible: true,
			basis: "git-clean",
			snapshot: null,
			prior: "unrecorded",
			gitHead
		};
		return {
			...at,
			reversible: false,
			code: failure
		};
	}
}
//#endregion
//#region src/enclawed/agent-tool-guard.ts
function auditAppend(type, actor, payload) {
	const runtime = getRuntime();
	if (!runtime) return;
	runtime.audit.append({
		type,
		actor: actor ?? "process",
		level: null,
		payload
	}).catch(() => {});
}
/**
* Enclaved flavor: refuse a tool call while the audit log cannot record it.
* Waits for pending records, so a decision just appended is known to be
* durable (or known to have failed) before the call runs. Open flavor: never
* blocks (the logger still reports the failure on stderr).
*/
async function checkAuditLogForToolCall() {
	const runtime = getRuntime();
	if (!runtime || runtime.flavor !== "enclaved") return { allowed: true };
	await runtime.audit.flush?.();
	const failure = runtime.audit.failure;
	if (failure) return {
		allowed: false,
		reason: `the audit log cannot be written (${failure.message}); refusing until it is fixed and enclawed restarts`
	};
	return { allowed: true };
}
/**
* Refuse a tool call while the hardware root is not CLEAN. Synchronous and
* O(1): only cached state is read.
*/
function checkHardwareRootForToolCall(toolName, ctx = {}) {
	let decision;
	if (hardwareRootPresent()) {
		const health = hardwareRootHealth();
		if (health.status === "CLEAN") return { allowed: true };
		decision = {
			allowed: false,
			code: health.status === "DIRTY" ? "hardware-dirty" : "hardware-unavailable",
			reason: `hardware root ${health.status}: ${health.reason}`
		};
	} else if (hardwareRootRequired()) decision = {
		allowed: false,
		code: "hardware-required-missing",
		reason: "ENCLAWEDER_ROOT=required but no Enclaweder is bound"
	};
	else return { allowed: true };
	auditAppend("tool.hardware.halt", ctx.agentId, {
		tool: toolName,
		toolCallId: ctx.toolCallId ?? null,
		sessionKey: ctx.sessionKey ?? null,
		code: decision.code,
		reason: decision.reason,
		hardwareRoot: hardwareRootInfo()
	});
	return decision;
}
const sessionApprovals = /* @__PURE__ */ new Set();
const MAX_SESSION_APPROVALS = 4096;
function sessionApprovalKey(toolName, ctx) {
	if (!ctx.sessionKey) return null;
	return JSON.stringify([
		ctx.agentId ?? "",
		ctx.sessionKey,
		toolName
	]);
}
/**
* Decide whether a tool call needs a person before it runs. `hookApproved`
* is true when a before_tool_call plugin already obtained a person's approval
* for this exact call, so the person is not asked twice. `fs` carries the
* targets of a file tool call; file writes are reversible only per target.
*/
async function planIrreversibleToolCall(toolName, ctx = {}, opts = {}) {
	const runtime = getRuntime();
	if (!runtime) {
		if (getFlavor() === "enclaved") return {
			kind: "refused",
			reason: "the enclaved flavor is active but the enclawed runtime is not bootstrapped"
		};
		return {
			kind: "proceed",
			code: "no-runtime"
		};
	}
	if (runtime.flavor !== "enclaved") return {
		kind: "proceed",
		code: "open-flavor"
	};
	let classification = classifyToolCall(toolName);
	let fsTargets = null;
	if (isFsWriteTool(toolName)) {
		const outcome = opts.fs?.targets ? await prepareFsWriteHistory({
			tool: toolName,
			targets: opts.fs.targets,
			fsRoot: opts.fs.fsRoot,
			sandbox: opts.fs.sandbox,
			policy: runtime.policy,
			toolCallId: ctx.toolCallId,
			agentId: ctx.agentId
		}) : null;
		fsTargets = outcome?.targets ?? null;
		if (outcome?.reversible && outcome.targets.length > 0) {
			classification = {
				capability: CAPABILITY.FS_WRITE_REV,
				reversible: true
			};
			auditAppend("tool.reversible.history", ctx.agentId, {
				tool: toolName,
				toolCallId: ctx.toolCallId ?? null,
				sessionKey: ctx.sessionKey ?? null,
				capability: classification.capability,
				targets: outcome.targets
			});
			return {
				kind: "proceed",
				code: "reversible-with-history",
				classification
			};
		}
	} else if (classification.reversible) return {
		kind: "proceed",
		code: "reversible",
		classification
	};
	const noHistory = fsTargets === null && isFsWriteTool(toolName) ? [{ code: opts.fs?.unresolved ?? "no-file-bridge" }] : (fsTargets ?? []).filter((t) => !t.reversible);
	let code = null;
	if (runtime.policy.preApprovedIrreversibleTools.has(toolName)) code = "pre-approved";
	else if (opts.hookApproved) code = "approved-by-hook-approval";
	else {
		const key = sessionApprovalKey(toolName, ctx);
		if (key && sessionApprovals.has(key)) code = "session-approved";
	}
	if (code) {
		recordDecision(toolName, ctx, classification, code, noHistory);
		return {
			kind: "proceed",
			code,
			classification
		};
	}
	auditAppend("tool.irreversible.request", ctx.agentId, {
		tool: toolName,
		toolCallId: ctx.toolCallId ?? null,
		sessionKey: ctx.sessionKey ?? null,
		capability: classification.capability,
		...noHistory.length > 0 ? { noHistory } : {}
	});
	return {
		kind: "approval-required",
		classification,
		title: `Approve irreversible action: ${toolName}`,
		description: `The agent wants to run "${toolName}" (capability ${classification.capability}), which cannot be undone. It runs only if you approve.`
	};
}
/**
* Record a person's answer to an approval request. Returns true only when
* the call may run.
*/
function resolveIrreversibleApproval(toolName, ctx, classification, result) {
	if (result === "allow-always") {
		const key = sessionApprovalKey(toolName, ctx);
		if (key) {
			if (sessionApprovals.size >= MAX_SESSION_APPROVALS) {
				const oldest = sessionApprovals.values().next().value;
				if (oldest !== void 0) sessionApprovals.delete(oldest);
			}
			sessionApprovals.add(key);
		}
	}
	if (result === "allow-once" || result === "allow-always") {
		recordDecision(toolName, ctx, classification, `approved:${result}`);
		return true;
	}
	recordDecision(toolName, ctx, classification, `denied:${result}`);
	return false;
}
function recordDecision(toolName, ctx, classification, decision, noHistory = []) {
	auditAppend("tool.irreversible.decision", ctx.agentId, {
		tool: toolName,
		toolCallId: ctx.toolCallId ?? null,
		sessionKey: ctx.sessionKey ?? null,
		capability: classification.capability,
		decision,
		...noHistory.length > 0 ? { noHistory } : {}
	});
}
/**
* An approved call refused at execution because it is not the call the
* person approved (replayed, expired, other arguments, or a target that
* changed since; see ./approval-binding.ts).
*/
function recordApprovalBindingRefusal(toolName, ctx, code, reason) {
	auditAppend("tool.approval.refused", ctx.agentId, {
		tool: toolName,
		toolCallId: ctx.toolCallId ?? null,
		sessionKey: ctx.sessionKey ?? null,
		code,
		reason
	});
}
function resetAgentToolGuardForTest() {
	sessionApprovals.clear();
}
//#endregion
export { resetAgentToolGuardForTest as a, recordApprovalBindingRefusal as i, checkHardwareRootForToolCall as n, resolveIrreversibleApproval as o, planIrreversibleToolCall as r, prepareFsWriteHistory as s, checkAuditLogForToolCall as t };
