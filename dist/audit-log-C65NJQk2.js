import { open } from "node:fs/promises";
import { createHash } from "node:crypto";
//#region src/enclawed/audit-log.ts
const GENESIS_PREV_HASH = "0".repeat(64);
const PROTO_KEYS = new Set([
	"__proto__",
	"prototype",
	"constructor"
]);
const CONTROL_RE = /[\u0000-\u0008\u000A-\u001F\u007F]/g;
function sanitizeString(s) {
	return s.replace(CONTROL_RE, "�");
}
function deepSanitize(value, seen = /* @__PURE__ */ new WeakSet()) {
	if (typeof value === "string") return sanitizeString(value);
	if (value === null || typeof value !== "object") return value;
	if (seen.has(value)) return null;
	seen.add(value);
	if (Array.isArray(value)) return value.map((v) => deepSanitize(v, seen));
	const obj = value;
	const out = {};
	for (const k of Object.keys(obj)) {
		if (PROTO_KEYS.has(k)) continue;
		out[k] = deepSanitize(obj[k], seen);
	}
	return out;
}
function canonicalize(value) {
	if (value === null || typeof value !== "object") return JSON.stringify(value);
	if (Array.isArray(value)) return "[" + value.map(canonicalize).join(",") + "]";
	const obj = value;
	return "{" + Object.keys(obj).filter((k) => !PROTO_KEYS.has(k)).sort().map((k) => JSON.stringify(k) + ":" + canonicalize(obj[k])).join(",") + "}";
}
function hashRecord(prevHash, record) {
	const h = createHash("sha256");
	h.update(prevHash);
	h.update("|");
	h.update(canonicalize(record));
	return h.digest("hex");
}
function buildRecord(input) {
	const body = {
		ts: input.ts ?? Date.now(),
		type: typeof input.type === "string" ? sanitizeString(input.type) : input.type,
		actor: typeof input.actor === "string" ? sanitizeString(input.actor) : input.actor,
		level: typeof input.level === "string" ? sanitizeString(input.level) : input.level,
		payload: deepSanitize(input.payload)
	};
	const recordHash = hashRecord(input.prevHash, body);
	return {
		...body,
		prevHash: input.prevHash,
		recordHash
	};
}
var AuditLogger = class {
	constructor(opts) {
		this.opts = opts;
		this._lastHash = null;
		this._fh = null;
		this._writeQueue = Promise.resolve();
		if (!opts.filePath) throw new Error("AuditLogger: filePath required");
		this.clock = opts.clock ?? (() => Date.now());
	}
	async _ensureOpen() {
		if (this._fh) return;
		this._fh = await open(this.opts.filePath, "a+");
		if (this._lastHash === null) this._lastHash = await this._scanLastHash();
	}
	async _scanLastHash() {
		const fh = this._fh;
		const { size } = await fh.stat();
		if (size === 0) return GENESIS_PREV_HASH;
		const buf = Buffer.alloc(Math.min(8192, size));
		await fh.read(buf, 0, buf.length, Math.max(0, size - buf.length));
		const lines = buf.toString("utf8").split("\n").filter(Boolean);
		if (lines.length === 0) return GENESIS_PREV_HASH;
		try {
			return JSON.parse(lines[lines.length - 1]).recordHash;
		} catch {
			throw new Error("audit log tail is not valid JSONL");
		}
	}
	async append(input) {
		const next = this._writeQueue.then(async () => {
			await this._ensureOpen();
			const record = buildRecord({
				prevHash: this._lastHash,
				type: input.type,
				actor: input.actor,
				level: input.level,
				payload: input.payload,
				ts: this.clock()
			});
			await this._fh.appendFile(JSON.stringify(record) + "\n");
			this._lastHash = record.recordHash;
			return record;
		});
		this._writeQueue = next.catch(() => void 0);
		return next;
	}
	async close() {
		if (this._fh) {
			await this._fh.close();
			this._fh = null;
		}
	}
};
async function verifyChain(filePath) {
	const fh = await open(filePath, "r");
	try {
		const lines = (await fh.readFile("utf8")).split("\n").filter(Boolean);
		let prev = GENESIS_PREV_HASH;
		for (let i = 0; i < lines.length; i++) {
			let rec;
			try {
				rec = JSON.parse(lines[i]);
			} catch {
				return {
					ok: false,
					count: i,
					brokenAt: i,
					reason: "invalid JSON"
				};
			}
			if (rec.prevHash !== prev) return {
				ok: false,
				count: i,
				brokenAt: i,
				reason: "prevHash mismatch"
			};
			if (hashRecord(prev, {
				ts: rec.ts,
				type: rec.type,
				actor: rec.actor,
				level: rec.level,
				payload: rec.payload
			}) !== rec.recordHash) return {
				ok: false,
				count: i,
				brokenAt: i,
				reason: "recordHash mismatch"
			};
			prev = rec.recordHash;
		}
		return {
			ok: true,
			count: lines.length
		};
	} finally {
		await fh.close();
	}
}
//#endregion
export { verifyChain as n, AuditLogger as t };
