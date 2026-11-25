import { a as normalizeNullableString, i as normalizeLowercaseStringOrEmpty } from "./string-coerce-BUSzWgUA.js";
import { n as asNullableRecord } from "./record-coerce-Dbgk4AB4.js";
import { a as matchSystemRunApprovalBinding, c as toSystemRunApprovalMismatchError, n as resolveSystemRunCommandRequest, o as missingSystemRunApprovalBinding, r as buildSystemRunApprovalBinding } from "./system-run-command-DfuxNz5p.js";
import { r as resolveSystemRunApprovalRuntimeContext } from "./system-run-approval-context-C5F6lzGx.js";
import { randomUUID } from "node:crypto";
//#region src/gateway/exec-approval-manager.ts
const RESOLVED_ENTRY_GRACE_MS = 15e3;
var ExecApprovalManager = class {
	constructor() {
		this.pending = /* @__PURE__ */ new Map();
	}
	create(request, timeoutMs, id) {
		const now = Date.now();
		return {
			id: id && id.trim().length > 0 ? id.trim() : randomUUID(),
			request,
			createdAtMs: now,
			expiresAtMs: now + timeoutMs
		};
	}
	/**
	* Register an approval record and return a promise that resolves when the decision is made.
	* This separates registration (synchronous) from waiting (async), allowing callers to
	* confirm registration before the decision is made.
	*/
	register(record, timeoutMs) {
		const existing = this.pending.get(record.id);
		if (existing) {
			if (existing.record.resolvedAtMs === void 0) return existing.promise;
			throw new Error(`approval id '${record.id}' already resolved`);
		}
		let resolvePromise;
		let rejectPromise;
		const promise = new Promise((resolve, reject) => {
			resolvePromise = resolve;
			rejectPromise = reject;
		});
		const entry = {
			record,
			resolve: resolvePromise,
			reject: rejectPromise,
			timer: null,
			promise
		};
		entry.timer = setTimeout(() => {
			this.expire(record.id);
		}, timeoutMs);
		this.pending.set(record.id, entry);
		return promise;
	}
	/**
	* @deprecated Use register() instead for explicit separation of registration and waiting.
	*/
	async waitForDecision(record, timeoutMs) {
		return this.register(record, timeoutMs);
	}
	resolve(recordId, decision, resolvedBy) {
		const pending = this.pending.get(recordId);
		if (!pending) return false;
		if (pending.record.resolvedAtMs !== void 0) return false;
		clearTimeout(pending.timer);
		pending.record.resolvedAtMs = Date.now();
		pending.record.decision = decision;
		pending.record.resolvedBy = resolvedBy ?? null;
		pending.resolve(decision);
		setTimeout(() => {
			if (this.pending.get(recordId) === pending) this.pending.delete(recordId);
		}, RESOLVED_ENTRY_GRACE_MS);
		return true;
	}
	expire(recordId, resolvedBy) {
		const pending = this.pending.get(recordId);
		if (!pending) return false;
		if (pending.record.resolvedAtMs !== void 0) return false;
		clearTimeout(pending.timer);
		pending.record.resolvedAtMs = Date.now();
		pending.record.decision = void 0;
		pending.record.resolvedBy = resolvedBy ?? null;
		pending.resolve(null);
		setTimeout(() => {
			if (this.pending.get(recordId) === pending) this.pending.delete(recordId);
		}, RESOLVED_ENTRY_GRACE_MS);
		return true;
	}
	getSnapshot(recordId) {
		return this.pending.get(recordId)?.record ?? null;
	}
	listPendingRecords() {
		return Array.from(this.pending.values()).map((entry) => entry.record).filter((record) => record.resolvedAtMs === void 0);
	}
	consumeAllowOnce(recordId) {
		const entry = this.pending.get(recordId);
		if (!entry) return false;
		const record = entry.record;
		if (record.decision !== "allow-once") return false;
		record.decision = void 0;
		record.consumedAtMs = Date.now();
		return true;
	}
	/**
	* Spend the timed-out fallback of a record once. A record whose request
	* timed out (no decision, no resolver) may authorize one askFallback run;
	* a record whose allow-once was already consumed looks the same apart
	* from `consumedAtMs`, and is refused.
	*/
	consumeTimedOutFallback(recordId) {
		const entry = this.pending.get(recordId);
		if (!entry) return false;
		const record = entry.record;
		if (record.resolvedAtMs === void 0 || record.decision !== void 0 || record.resolvedBy !== null || record.consumedAtMs !== void 0) return false;
		record.consumedAtMs = Date.now();
		return true;
	}
	/**
	* Wait for decision on an already-registered approval.
	* Returns the decision promise if the ID is pending, null otherwise.
	*/
	awaitDecision(recordId) {
		return this.pending.get(recordId)?.promise ?? null;
	}
	lookupPendingId(input) {
		const normalized = input.trim();
		if (!normalized) return { kind: "none" };
		const exact = this.pending.get(normalized);
		if (exact) return exact.record.resolvedAtMs === void 0 ? {
			kind: "exact",
			id: normalized
		} : { kind: "none" };
		const lowerPrefix = normalizeLowercaseStringOrEmpty(normalized);
		const matches = [];
		for (const [id, entry] of this.pending.entries()) {
			if (entry.record.resolvedAtMs !== void 0) continue;
			if (normalizeLowercaseStringOrEmpty(id).startsWith(lowerPrefix)) matches.push(id);
		}
		if (matches.length === 1) return {
			kind: "prefix",
			id: matches[0]
		};
		if (matches.length > 1) return {
			kind: "ambiguous",
			ids: matches
		};
		return { kind: "none" };
	}
};
//#endregion
//#region src/gateway/node-invoke-system-run-approval-errors.ts
function systemRunApprovalGuardError(params) {
	const details = params.details ? { ...params.details } : {};
	return {
		ok: false,
		message: params.message,
		details: {
			code: params.code,
			...details
		}
	};
}
function systemRunApprovalRequired(runId) {
	return systemRunApprovalGuardError({
		code: "APPROVAL_REQUIRED",
		message: "approval required",
		details: { runId }
	});
}
//#endregion
//#region src/gateway/node-invoke-system-run-approval-match.ts
function requestMismatch() {
	return {
		ok: false,
		code: "APPROVAL_REQUEST_MISMATCH",
		message: "approval id does not match request"
	};
}
function evaluateSystemRunApprovalMatch(params) {
	if (params.request.host !== "node") return requestMismatch();
	const actualBinding = buildSystemRunApprovalBinding({
		argv: params.argv,
		cwd: params.binding.cwd,
		agentId: params.binding.agentId,
		sessionKey: params.binding.sessionKey,
		env: params.binding.env
	});
	const expectedBinding = params.request.systemRunBinding;
	if (!expectedBinding) return missingSystemRunApprovalBinding({ actualEnvKeys: actualBinding.envKeys });
	return matchSystemRunApprovalBinding({
		expected: expectedBinding,
		actual: actualBinding.binding,
		actualEnvKeys: actualBinding.envKeys
	});
}
//#endregion
//#region src/gateway/node-invoke-system-run-approval.ts
function normalizeApprovalDecision(value) {
	const s = normalizeNullableString(value);
	return s === "allow-once" || s === "allow-always" ? s : null;
}
function clientHasApprovals(client) {
	const scopes = Array.isArray(client?.connect?.scopes) ? client?.connect?.scopes : [];
	return scopes.includes("operator.admin") || scopes.includes("operator.approvals");
}
function pickSystemRunParams(raw) {
	const next = {};
	for (const key of [
		"command",
		"rawCommand",
		"systemRunPlan",
		"cwd",
		"env",
		"timeoutMs",
		"needsScreenRecording",
		"agentId",
		"sessionKey",
		"runId",
		"suppressNotifyOnExit"
	]) if (key in raw) next[key] = raw[key];
	return next;
}
/**
* Gate `system.run` approval flags (`approved`, `approvalDecision`) behind a real
* `exec.approval.*` record. This prevents users with only `operator.write` from
* bypassing node-host approvals by injecting control fields into `node.invoke`.
*/
function sanitizeSystemRunParamsForForwarding(opts) {
	const obj = asNullableRecord(opts.rawParams);
	if (!obj) return {
		ok: true,
		params: opts.rawParams
	};
	const p = obj;
	const approved = p.approved === true;
	const requestedDecision = normalizeApprovalDecision(p.approvalDecision);
	const wantsApprovalOverride = approved || requestedDecision !== null;
	const next = pickSystemRunParams(obj);
	if (!wantsApprovalOverride) {
		const cmdTextResolution = resolveSystemRunCommandRequest({
			command: p.command,
			rawCommand: p.rawCommand
		});
		if (!cmdTextResolution.ok) return {
			ok: false,
			message: cmdTextResolution.message,
			details: cmdTextResolution.details
		};
		return {
			ok: true,
			params: next
		};
	}
	const runId = normalizeNullableString(p.runId);
	if (!runId) return systemRunApprovalGuardError({
		code: "MISSING_RUN_ID",
		message: "approval override requires params.runId"
	});
	const manager = opts.execApprovalManager;
	if (!manager) return systemRunApprovalGuardError({
		code: "APPROVALS_UNAVAILABLE",
		message: "exec approvals unavailable"
	});
	const snapshot = manager.getSnapshot(runId);
	if (!snapshot) return systemRunApprovalGuardError({
		code: "UNKNOWN_APPROVAL_ID",
		message: "unknown or expired approval id",
		details: { runId }
	});
	if ((typeof opts.nowMs === "number" ? opts.nowMs : Date.now()) > snapshot.expiresAtMs) return systemRunApprovalGuardError({
		code: "APPROVAL_EXPIRED",
		message: "approval expired",
		details: { runId }
	});
	const targetNodeId = normalizeNullableString(opts.nodeId);
	if (!targetNodeId) return systemRunApprovalGuardError({
		code: "MISSING_NODE_ID",
		message: "node.invoke requires nodeId",
		details: { runId }
	});
	const approvalNodeId = normalizeNullableString(snapshot.request.nodeId);
	if (!approvalNodeId) return systemRunApprovalGuardError({
		code: "APPROVAL_NODE_BINDING_MISSING",
		message: "approval id missing node binding",
		details: { runId }
	});
	if (approvalNodeId !== targetNodeId) return systemRunApprovalGuardError({
		code: "APPROVAL_NODE_MISMATCH",
		message: "approval id not valid for this node",
		details: { runId }
	});
	const snapshotDeviceId = snapshot.requestedByDeviceId ?? null;
	const clientDeviceId = opts.client?.connect?.device?.id ?? null;
	if (snapshotDeviceId) {
		if (snapshotDeviceId !== clientDeviceId) return systemRunApprovalGuardError({
			code: "APPROVAL_DEVICE_MISMATCH",
			message: "approval id not valid for this device",
			details: { runId }
		});
	} else if (snapshot.requestedByConnId && snapshot.requestedByConnId !== (opts.client?.connId ?? null)) return systemRunApprovalGuardError({
		code: "APPROVAL_CLIENT_MISMATCH",
		message: "approval id not valid for this client",
		details: { runId }
	});
	const runtimeContext = resolveSystemRunApprovalRuntimeContext({
		plan: snapshot.request.systemRunPlan ?? null,
		command: p.command,
		rawCommand: p.rawCommand,
		cwd: p.cwd,
		agentId: p.agentId,
		sessionKey: p.sessionKey
	});
	if (!runtimeContext.ok) return {
		ok: false,
		message: runtimeContext.message,
		details: runtimeContext.details
	};
	if (runtimeContext.plan) {
		next.command = [...runtimeContext.plan.argv];
		next.systemRunPlan = runtimeContext.plan;
		if (runtimeContext.commandText) next.rawCommand = runtimeContext.commandText;
		else delete next.rawCommand;
		if (runtimeContext.cwd) next.cwd = runtimeContext.cwd;
		else delete next.cwd;
		if (runtimeContext.agentId) next.agentId = runtimeContext.agentId;
		else delete next.agentId;
		if (runtimeContext.sessionKey) next.sessionKey = runtimeContext.sessionKey;
		else delete next.sessionKey;
	}
	const approvalMatch = evaluateSystemRunApprovalMatch({
		argv: runtimeContext.argv,
		request: snapshot.request,
		binding: {
			cwd: runtimeContext.cwd,
			agentId: runtimeContext.agentId,
			sessionKey: runtimeContext.sessionKey,
			env: p.env
		}
	});
	if (!approvalMatch.ok) return toSystemRunApprovalMismatchError({
		runId,
		match: approvalMatch
	});
	if (snapshot.decision === "allow-once") {
		if (typeof manager.consumeAllowOnce !== "function" || !manager.consumeAllowOnce(runId)) return systemRunApprovalRequired(runId);
		next.approved = true;
		next.approvalDecision = "allow-once";
		return {
			ok: true,
			params: next
		};
	}
	if (snapshot.decision === "allow-always") {
		next.approved = true;
		next.approvalDecision = "allow-always";
		return {
			ok: true,
			params: next
		};
	}
	if (snapshot.resolvedAtMs !== void 0 && snapshot.decision === void 0 && snapshot.resolvedBy === null && snapshot.consumedAtMs === void 0 && approved && requestedDecision === "allow-once" && clientHasApprovals(opts.client)) {
		if (typeof manager.consumeTimedOutFallback !== "function" || !manager.consumeTimedOutFallback(runId)) return systemRunApprovalRequired(runId);
		next.approved = true;
		next.approvalDecision = "allow-once";
		return {
			ok: true,
			params: next
		};
	}
	return systemRunApprovalRequired(runId);
}
//#endregion
export { ExecApprovalManager as n, sanitizeSystemRunParamsForForwarding as t };
