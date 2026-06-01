import { n as scan } from "./dlp-scanner-D1fAx4SR.js";
import { r as setRuntime, t as clearRuntime } from "./runtime-Dt7e6nAN.js";
import { n as verifyChain, t as AuditLogger } from "./audit-log-C65NJQk2.js";
import { a as defaultOpenPolicy, c as makeLabel, r as createPolicy, s as format } from "./policy-wE3FfoUy.js";
import { a as EgressDeniedError, i as verifyManifestSignature, n as generateEd25519KeyPair, o as installEgressGuard, r as signManifest, t as bootstrapEnclawed } from "./bootstrap-Dqtpjdcp.js";
import { n as HttpJsonRpcTransport, r as QClearedMcpClient } from "./src-0s-kk9FK.js";
import { r as registerServer } from "./server-registry-Dfft0BAM.js";
import { r as loadGoogleWorkspaceBridge, t as GOOGLE_WORKSPACE_ENDPOINTS } from "./src-BUQBQP-m.js";
import { n as loadImapSmtpBridge, t as IMAP_SMTP_TOOLS } from "./src-B0dG0KVO.js";
import { n as loadCalDavBridge, t as CALDAV_TOOLS } from "./src-CUP9KysN.js";
import { n as loadCardDavBridge, t as CARDDAV_TOOLS } from "./src-Cr8qfexz.js";
import { randomUUID } from "node:crypto";
//#region src/enclawed/skill-capabilities.ts
const CAPABILITY = Object.freeze({
	NET_EGRESS: "net.egress",
	FS_READ: "fs.read",
	FS_WRITE_REV: "fs.write.rev",
	FS_WRITE_IRREV: "fs.write.irrev",
	TOOL_INVOKE: "tool.invoke",
	SPAWN_PROC: "spawn.proc",
	PUBLISH: "publish",
	PAY: "pay",
	MUTATE_SCHEMA: "mutate.schema"
});
const ALL_CAPABILITIES = Object.freeze([
	CAPABILITY.NET_EGRESS,
	CAPABILITY.FS_READ,
	CAPABILITY.FS_WRITE_REV,
	CAPABILITY.FS_WRITE_IRREV,
	CAPABILITY.TOOL_INVOKE,
	CAPABILITY.SPAWN_PROC,
	CAPABILITY.PUBLISH,
	CAPABILITY.PAY,
	CAPABILITY.MUTATE_SCHEMA
]);
const CAP_SET = new Set(ALL_CAPABILITIES);
function isCapabilityToken(value) {
	return typeof value === "string" && CAP_SET.has(value);
}
const REVERSIBLE = new Set([CAPABILITY.FS_READ, CAPABILITY.FS_WRITE_REV]);
function isReversible(cap) {
	return REVERSIBLE.has(cap);
}
function isIrreversible(cap) {
	return !REVERSIBLE.has(cap);
}
function makeCall(input) {
	if (!isCapabilityToken(input.cap)) throw new TypeError(`unknown capability: ${String(input.cap)}`);
	if (typeof input.target !== "string" || input.target.length === 0) throw new TypeError("capability target must be a non-empty string");
	return Object.freeze({
		cap: input.cap,
		target: input.target,
		args: input.args ? Object.freeze({ ...input.args }) : void 0
	});
}
function projectionKey(call) {
	return JSON.stringify([call.cap, call.target]);
}
//#endregion
//#region src/enclawed/skill-manifest.ts
const VERIFICATION = Object.freeze({
	UNVERIFIED: "unverified",
	DECLARED: "declared",
	TESTED: "tested",
	FORMAL: "formal"
});
Object.freeze({
	unverified: 0,
	declared: 1,
	tested: 2,
	formal: 3
});
//#endregion
//#region src/enclawed/skill-gate.ts
var TransactionBuffer = class {
	constructor() {
		this.entries = [];
	}
	record(entry) {
		this.entries.push(entry);
	}
	async rollbackAll() {
		while (this.entries.length > 0) {
			const e = this.entries.pop();
			if (!e) break;
			try {
				await e.rollback();
			} catch {}
		}
	}
	size() {
		return this.entries.length;
	}
};
var SkillGate = class {
	constructor(opts) {
		this.active = /* @__PURE__ */ new Map();
		this.declaredKeys = /* @__PURE__ */ new Map();
		this.audit = opts.audit;
		this.broker = opts.broker;
		this.txn = opts.txn ?? new TransactionBuffer();
	}
	loadSkill(manifest) {
		this.active.set(manifest.id, manifest);
		const keys = /* @__PURE__ */ new Set();
		for (const c of manifest.caps) keys.add(c);
		this.declaredKeys.set(manifest.id, keys);
	}
	unloadAll() {
		this.active.clear();
		this.declaredKeys.clear();
	}
	isLoaded(skillId) {
		return this.active.has(skillId);
	}
	async dispatch(input) {
		const manifest = this.active.get(input.skillId);
		if (!manifest) return this.denied(input.call, "skill not loaded");
		const declared = this.declaredKeys.get(input.skillId);
		const requestId = randomUUID();
		if (isReversible(input.call.cap)) return this.executeReversible(requestId, manifest, input);
		const v = manifest.verification;
		const inDeclared = declared.has(input.call.cap);
		if (v === VERIFICATION.UNVERIFIED) return this.executeIrreversibleViaBroker(requestId, manifest, input);
		if ((v === VERIFICATION.DECLARED || v === VERIFICATION.TESTED || v === VERIFICATION.FORMAL) && inDeclared) return this.executeIrreversibleDirect(requestId, manifest, input);
		return this.executeIrreversibleViaBroker(requestId, manifest, input);
	}
	async executeReversible(requestId, manifest, input) {
		await this.audit.append({
			type: "reversible.request",
			actor: input.skillId,
			level: format(manifest.label),
			payload: {
				requestId,
				call: callPayload(input.call),
				projection: projectionKey(input.call)
			}
		});
		try {
			const res = await input.execute(input.call);
			if (res.ok) {
				if (input.rollback) this.txn.record({
					requestId,
					call: input.call,
					rollback: input.rollback
				});
				await this.audit.append({
					type: "reversible.executed",
					actor: input.skillId,
					level: format(manifest.label),
					payload: {
						requestId,
						call: callPayload(input.call),
						projection: projectionKey(input.call),
						ok: true
					}
				});
				return {
					kind: "executed",
					requestId,
					call: input.call
				};
			}
			await this.audit.append({
				type: "reversible.error",
				actor: input.skillId,
				level: format(manifest.label),
				payload: {
					requestId,
					call: callPayload(input.call),
					reason: res.reason
				}
			});
			return {
				kind: "error",
				requestId,
				call: input.call,
				reason: res.reason
			};
		} catch (err) {
			const reason = err.message;
			await this.audit.append({
				type: "reversible.error",
				actor: input.skillId,
				level: format(manifest.label),
				payload: {
					requestId,
					call: callPayload(input.call),
					reason
				}
			});
			return {
				kind: "error",
				requestId,
				call: input.call,
				reason
			};
		}
	}
	async executeIrreversibleViaBroker(requestId, manifest, input) {
		await this.audit.append({
			type: "irreversible.request",
			actor: input.skillId,
			level: format(manifest.label),
			payload: {
				requestId,
				call: callPayload(input.call),
				projection: projectionKey(input.call)
			}
		});
		const brokerReq = Object.freeze({
			requestId,
			call: input.call,
			skillId: input.skillId,
			ts: Date.now()
		});
		const decision = await this.broker.decide(brokerReq);
		await this.audit.append({
			type: "irreversible.decision",
			actor: input.skillId,
			level: format(manifest.label),
			payload: {
				requestId,
				call: callPayload(input.call),
				decision: decision.decision,
				broker: this.broker.id,
				reason: decision.reason ?? null
			}
		});
		if (decision.decision === "deny") return {
			kind: "denied",
			requestId,
			call: input.call,
			reason: decision.reason ?? "denied"
		};
		return this.runIrreversible(requestId, manifest, input);
	}
	async executeIrreversibleDirect(requestId, manifest, input) {
		await this.audit.append({
			type: "irreversible.request",
			actor: input.skillId,
			level: format(manifest.label),
			payload: {
				requestId,
				call: callPayload(input.call),
				projection: projectionKey(input.call),
				path: "verified-declared"
			}
		});
		await this.audit.append({
			type: "irreversible.decision",
			actor: input.skillId,
			level: format(manifest.label),
			payload: {
				requestId,
				call: callPayload(input.call),
				decision: "approve",
				broker: "verification:" + manifest.verification,
				reason: "covered by manifest caps at verification level " + manifest.verification
			}
		});
		return this.runIrreversible(requestId, manifest, input);
	}
	async runIrreversible(requestId, manifest, input) {
		try {
			const res = await input.execute(input.call);
			if (res.ok) {
				await this.audit.append({
					type: "irreversible.executed",
					actor: input.skillId,
					level: format(manifest.label),
					payload: {
						requestId,
						call: callPayload(input.call),
						projection: projectionKey(input.call),
						ok: true
					}
				});
				return {
					kind: "executed",
					requestId,
					call: input.call
				};
			}
			await this.audit.append({
				type: "irreversible.error",
				actor: input.skillId,
				level: format(manifest.label),
				payload: {
					requestId,
					call: callPayload(input.call),
					reason: res.reason,
					ok: false
				}
			});
			return {
				kind: "error",
				requestId,
				call: input.call,
				reason: res.reason
			};
		} catch (err) {
			const reason = err.message;
			await this.audit.append({
				type: "irreversible.error",
				actor: input.skillId,
				level: format(manifest.label),
				payload: {
					requestId,
					call: callPayload(input.call),
					reason,
					ok: false
				}
			});
			return {
				kind: "error",
				requestId,
				call: input.call,
				reason
			};
		}
	}
	async denied(call, reason) {
		const requestId = randomUUID();
		await this.audit.append({
			type: "irreversible.decision",
			actor: "gate",
			level: null,
			payload: {
				requestId,
				call: callPayload(call),
				decision: "deny",
				broker: "gate",
				reason
			}
		});
		return {
			kind: "denied",
			requestId,
			call,
			reason
		};
	}
	txnBuffer() {
		return this.txn;
	}
	classify(call) {
		return isIrreversible(call.cap) ? "irreversible" : "reversible";
	}
};
function callPayload(call) {
	return {
		cap: call.cap,
		target: call.target,
		args: call.args ?? null
	};
}
//#endregion
export { AuditLogger, CALDAV_TOOLS, CAPABILITY, CARDDAV_TOOLS, EgressDeniedError, GOOGLE_WORKSPACE_ENDPOINTS, HttpJsonRpcTransport, IMAP_SMTP_TOOLS, QClearedMcpClient, SkillGate, VERIFICATION, bootstrapEnclawed, clearRuntime, createPolicy, defaultOpenPolicy, scan as dlpScan, generateEd25519KeyPair, installEgressGuard, loadCalDavBridge, loadCardDavBridge, loadGoogleWorkspaceBridge, loadImapSmtpBridge, makeCall, makeLabel, registerServer, setRuntime, signManifest, verifyChain, verifyManifestSignature };
