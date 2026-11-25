import { n as canonicalJson } from "./mcp-tool-pins-BEQBlsS1.js";
import path from "node:path";
import fs from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
//#region src/enclawed/approval-binding.ts
async function realpathNearest(abs) {
	let current = abs;
	const rest = [];
	for (;;) try {
		const real = await fs.realpath(current);
		return rest.length > 0 ? path.join(real, ...rest.toReversed()) : real;
	} catch {
		const parent = path.dirname(current);
		if (parent === current) return abs;
		rest.push(path.basename(current));
		current = parent;
	}
}
function kindOf(st) {
	if (st.isSymbolicLink()) return "symlink";
	if (st.isFile()) return "file";
	if (st.isDirectory()) return "dir";
	return "other";
}
function bornOf(st) {
	return st && st.birthtimeNs > 0n ? st.birthtimeNs.toString() : null;
}
/** What `absPath` designates on disk right now. */
async function resolveFsResource(absPath) {
	const abs = path.resolve(absPath);
	const st = await fs.lstat(abs).catch(() => null);
	const kind = st ? kindOf(st) : "missing";
	const linkTarget = kind === "symlink" ? await fs.readlink(abs).catch(() => null) : null;
	const target = st ? await fs.stat(abs, { bigint: true }).catch(() => null) : null;
	const parentAbs = path.dirname(abs);
	const parentSt = await fs.stat(parentAbs, { bigint: true }).catch(() => null);
	return Object.freeze({
		type: "fs",
		absPath: abs,
		kind,
		realPath: await realpathNearest(abs),
		linkTarget,
		dev: target ? Number(target.dev) : null,
		ino: target ? Number(target.ino) : null,
		nlink: target ? Number(target.nlink) : null,
		born: bornOf(target),
		parent: Object.freeze({
			realPath: await realpathNearest(parentAbs),
			dev: parentSt ? Number(parentSt.dev) : null,
			ino: parentSt ? Number(parentSt.ino) : null,
			born: bornOf(parentSt)
		})
	});
}
/** The canonical form of a URL target; null when it is not a URL. */
function resolveUrlResource(raw) {
	try {
		const u = new URL(raw);
		u.hash = "";
		return Object.freeze({
			type: "url",
			url: u.href
		});
	} catch {
		return null;
	}
}
/**
* A birth time decides only when both sides have one: a filesystem without btime, or an identity
* recorded before birth times were (a stored hold), falls back to (dev, ino) alone.
*/
function bornChanged(a, b) {
	return typeof a === "string" && typeof b === "string" && a !== b;
}
/** Why `now` is not the resource that was approved; null when it is the same. */
function describeResourceChange(approved, now) {
	if (approved.type !== now.type) return "the target is a different kind of resource";
	if (approved.type === "url" || now.type === "url") return approved.type === "url" && now.type === "url" && approved.url === now.url ? null : "the URL is not the one approved";
	const a = approved;
	const b = now;
	const where = JSON.stringify(a.absPath);
	if (a.absPath !== b.absPath) return `the target ${JSON.stringify(b.absPath)} is not the approved ${where}`;
	if (a.kind !== b.kind) return `${where} changed from ${a.kind} to ${b.kind}`;
	if (a.linkTarget !== b.linkTarget) return `the symlink ${where} now points elsewhere`;
	if (a.realPath !== b.realPath) return `${where} now resolves to ${JSON.stringify(b.realPath)}, not ${JSON.stringify(a.realPath)}`;
	if (a.dev !== b.dev || a.ino !== b.ino || bornChanged(a.born, b.born)) return `${where} was replaced by another file`;
	if (a.nlink !== b.nlink) return `the link count of ${where} changed (${a.nlink} to ${b.nlink})`;
	if (a.parent.realPath !== b.parent.realPath || a.parent.dev !== b.parent.dev || a.parent.ino !== b.parent.ino || bornChanged(a.parent.born, b.parent.born)) return `the directory holding ${where} was renamed or replaced`;
	return null;
}
/** SHA-256 (hex) of the canonical JSON of an action's arguments. */
function approvalArgsDigest(args) {
	return createHash("sha256").update(canonicalJson(args ?? null)).digest("hex");
}
const MAX_GRANTS = 4096;
/**
* The grants of one process. A grant is issued when a person is asked,
* marked approved when the person allows the action, and consumed exactly
* once, at execution, against the action as it is then.
*/
var ApprovalGrantLedger = class ApprovalGrantLedger {
	constructor(clock = () => Date.now()) {
		this.clock = clock;
		this.grants = /* @__PURE__ */ new Map();
	}
	/** The grants, for a ledger kept in a file between processes (see fromState). */
	exportState() {
		return [...this.grants.values()].map((s) => ({ ...s }));
	}
	/** A ledger with the grants exportState returned (malformed entries are dropped: fail closed). */
	static fromState(state, clock = () => Date.now()) {
		const l = new ApprovalGrantLedger(clock);
		for (const s of Array.isArray(state) ? state : []) {
			const g = s?.grant;
			if (g && typeof g.id === "string" && typeof g.tool === "string" && typeof g.argsDigest === "string" && Array.isArray(g.resources) && typeof g.issuedAtMs === "number" && typeof g.expiresAtMs === "number") {
				const st = s;
				l.grants.set(g.id, {
					grant: Object.freeze({
						...g,
						resources: Object.freeze([...g.resources])
					}),
					approved: st.approved === true,
					consumedAtMs: typeof st.consumedAtMs === "number" ? st.consumedAtMs : null
				});
			}
		}
		return l;
	}
	issue(subject, opts) {
		const now = this.clock();
		const grant = Object.freeze({
			id: randomUUID(),
			tool: subject.tool,
			argsDigest: approvalArgsDigest(subject.args),
			resources: Object.freeze([...subject.resources ?? []]),
			issuedAtMs: now,
			expiresAtMs: now + Math.max(0, opts.ttlMs)
		});
		this.prune(now);
		this.grants.set(grant.id, {
			grant,
			approved: false,
			consumedAtMs: null
		});
		return grant;
	}
	/** Record that a person allowed the action. Returns false for an unknown or expired grant. */
	approve(id) {
		const state = this.grants.get(id);
		if (!state || state.consumedAtMs !== null || this.clock() > state.grant.expiresAtMs) return false;
		state.approved = true;
		return true;
	}
	/** Drop a grant whose request was denied or abandoned. */
	revoke(id) {
		this.grants.delete(id);
	}
	/**
	* Use the grant for one execution of `current`. The grant is spent by the
	* first attempt, whatever its outcome: a refused attempt must be asked
	* about again.
	*/
	consume(id, current) {
		const state = this.grants.get(id);
		if (!state) return {
			ok: false,
			code: "unknown-grant",
			reason: "the approval is unknown"
		};
		if (state.consumedAtMs !== null) return {
			ok: false,
			code: "replayed",
			reason: "the approval was already used once"
		};
		const now = this.clock();
		state.consumedAtMs = now;
		const { grant } = state;
		if (now > grant.expiresAtMs) return {
			ok: false,
			code: "expired",
			reason: "the approval expired before the action ran"
		};
		if (!state.approved) return {
			ok: false,
			code: "not-approved",
			reason: "no person approved this action"
		};
		if (current.tool !== grant.tool) return {
			ok: false,
			code: "tool-mismatch",
			reason: `the approval was for ${JSON.stringify(grant.tool)}, not ${JSON.stringify(current.tool)}`
		};
		if (approvalArgsDigest(current.args) !== grant.argsDigest) return {
			ok: false,
			code: "args-mismatch",
			reason: "the action's arguments are not the ones approved"
		};
		const nowResources = current.resources ?? [];
		if (nowResources.length !== grant.resources.length) return {
			ok: false,
			code: "resource-changed",
			reason: "the action's targets are not the ones approved"
		};
		for (let i = 0; i < grant.resources.length; i += 1) {
			const change = describeResourceChange(grant.resources[i], nowResources[i]);
			if (change) return {
				ok: false,
				code: "resource-changed",
				reason: `${change} after it was approved`
			};
		}
		return {
			ok: true,
			grant
		};
	}
	prune(now) {
		for (const [id, state] of this.grants) if (now > state.grant.expiresAtMs) this.grants.delete(id);
		while (this.grants.size >= MAX_GRANTS) {
			const oldest = this.grants.keys().next().value;
			if (oldest === void 0) break;
			this.grants.delete(oldest);
		}
	}
};
//#endregion
export { resolveUrlResource as a, resolveFsResource as i, approvalArgsDigest as n, describeResourceChange as r, ApprovalGrantLedger as t };
