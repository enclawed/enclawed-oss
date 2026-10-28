import { createReadStream } from "node:fs";
import path from "node:path";
import { open, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createInterface } from "node:readline";
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
	return "{" + Object.keys(obj).filter((k) => !PROTO_KEYS.has(k)).toSorted().map((k) => JSON.stringify(k) + ":" + canonicalize(obj[k])).join(",") + "}";
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
/**
* Sidecar holding the hash of the last record written.
*
* A hash chain proves that nothing was altered or inserted. It cannot prove
* that nothing was REMOVED: deleting the trailing records leaves a shorter
* chain that verifies perfectly, so an attacker need only truncate away the
* entries that recorded what they did. Measured on this implementation --
* deleting the last four of ten records returned {ok:true,count:6}.
*
* The fix is to remember, outside the log, what the head was. Verification
* then recomputes the head and compares; a chain that verifies internally but
* ends somewhere other than the recorded head has lost records.
*
* This is a speed bump, not a vault: an attacker with write access to both
* files can update the anchor too. It exists so that truncating the log alone
* is no longer sufficient and no longer silent, and so the anchor can later be
* sealed somewhere the log's own writer cannot reach.
*/
function headAnchorPath(logPath) {
	return `${logPath}.head`;
}
/** The default sink: a file beside the log. */
function fileHeadAnchor(logPath) {
	const file = headAnchorPath(logPath);
	return {
		id: "file",
		async write(hash) {
			await writeFile(file, `${hash}\n`, "utf8");
		},
		async read() {
			try {
				const raw = (await readFile(file, "utf8")).trim();
				return /^[0-9a-f]{64}$/.test(raw) ? raw : null;
			} catch {
				return null;
			}
		}
	};
}
/**
* Rotation, without breaking the chain.
*
* The log had none, and a production install reached 865 MB in five days --
* large enough that reading it whole threw ERR_STRING_TOO_LONG and the chain
* became unverifiable exactly when it mattered most.
*
* The obvious fix -- start a fresh file -- would break the property the log
* exists for, because a new chain starting at genesis is indistinguishable from
* one whose history was thrown away. So rotation SEALS the current file and the
* new one opens with a segment-start record whose prevHash is the sealed file's
* head. The chain therefore continues across files, and the seam is a link that
* can be checked rather than a gap that must be trusted.
*
* Nothing is ever deleted. Discarding old segments is precisely what an attacker
* would want, so retention is left as an explicit operator decision rather than
* something the writer does on its own.
*/
/** Head (last recordHash) of a sealed segment, without reading it whole. */
async function tailHead(file) {
	try {
		const { size } = await stat(file);
		if (size === 0) return null;
		const fh = await open(file, "r");
		try {
			const buf = Buffer.alloc(Math.min(8192, size));
			await fh.read(buf, 0, buf.length, Math.max(0, size - buf.length));
			const lines = buf.toString("utf8").split("\n").filter(Boolean);
			if (lines.length === 0) return null;
			return JSON.parse(lines[lines.length - 1]).recordHash;
		} finally {
			await fh.close();
		}
	} catch {
		return null;
	}
}
const SEGMENT_START_TYPE = "audit.segment.start";
/** `audit.jsonl` + seq 3 -> `audit.3.jsonl`. */
function segmentPath(logPath, seq) {
	const dir = path.dirname(logPath);
	const base = path.basename(logPath);
	const ext = path.extname(base);
	return path.join(dir, `${base.slice(0, base.length - ext.length)}.${seq}${ext}`);
}
/** Sealed segments oldest-first. Gaps are not silently skipped: see verifyHistory. */
async function listSegments(logPath) {
	const dir = path.dirname(logPath);
	const base = path.basename(logPath);
	const ext = path.extname(base);
	const prefix = `${base.slice(0, base.length - ext.length)}.`;
	let names;
	try {
		names = await readdir(dir);
	} catch {
		return [];
	}
	const out = [];
	for (const name of names) {
		if (!name.startsWith(prefix) || !name.endsWith(ext) || name === base) continue;
		const mid = name.slice(prefix.length, name.length - ext.length);
		if (!/^\d+$/.test(mid)) continue;
		out.push({
			seq: Number(mid),
			file: path.join(dir, name)
		});
	}
	return out.toSorted((a, b) => a.seq - b.seq);
}
/**
* If this record is a valid segment link, return it.
*
* The link must be self-consistent -- the head it names has to be the very
* prevHash it chains from -- so a forged header cannot claim to continue from
* one place while chaining from another.
*/
function segmentLink(rec) {
	if (rec.type !== "audit.segment.start" || typeof rec.payload !== "object" || rec.payload === null) return null;
	const p = rec.payload;
	if (typeof p.prevHead !== "string" || typeof p.prevSegment !== "string" || typeof p.seq !== "number" || p.prevHead !== rec.prevHash) return null;
	return {
		seq: p.seq,
		prevSegment: p.prevSegment,
		prevHead: p.prevHead
	};
}
var AuditLogger = class {
	constructor(opts) {
		this.opts = opts;
		this._lastHash = null;
		this._fh = null;
		this._writeQueue = Promise.resolve();
		this._size = 0;
		if (!opts.filePath) throw new Error("AuditLogger: filePath required");
		this.clock = opts.clock ?? (() => Date.now());
		this.anchor = opts.headAnchor ?? fileHeadAnchor(opts.filePath);
		this.maxBytes = opts.maxBytes ?? 64 * 1024 * 1024;
	}
	async _ensureOpen() {
		if (this._fh) return;
		this._fh = await open(this.opts.filePath, "a+");
		this._size = (await this._fh.stat()).size;
		if (this._lastHash === null) this._lastHash = await this._scanLastHash();
		if (this._size === 0) {
			const segs = await listSegments(this.opts.filePath);
			if (segs.length > 0) {
				const last = segs[segs.length - 1];
				const head = await tailHead(last.file);
				if (head !== null) {
					this._lastHash = head;
					await this._writeSegmentStart(last.seq, path.basename(last.file), head);
				}
			}
		}
	}
	async _writeSegmentStart(seq, prevSegment, prevHead) {
		const rec = buildRecord({
			prevHash: prevHead,
			type: SEGMENT_START_TYPE,
			actor: "audit-log",
			level: "INTERNAL",
			payload: {
				seq,
				prevSegment,
				prevHead
			},
			ts: this.clock()
		});
		const line = JSON.stringify(rec) + "\n";
		await this._fh.appendFile(line);
		this._size += Buffer.byteLength(line);
		this._lastHash = rec.recordHash;
		await this._writeHeadAnchor(rec.recordHash).catch(() => {});
	}
	/**
	* Seal the current segment and open a new one linked to it.
	*
	* Order matters: the file is renamed BEFORE the new one is opened, and the
	* link record is written immediately after. A crash anywhere in here leaves
	* either a sealed segment with no successor yet, or an empty successor --
	* both recoverable in _ensureOpen, and neither loses a record.
	*/
	async _rotate() {
		const segs = await listSegments(this.opts.filePath);
		const seq = segs.length > 0 ? segs[segs.length - 1].seq + 1 : 1;
		const sealed = segmentPath(this.opts.filePath, seq);
		const head = this._lastHash;
		await this._fh.close();
		this._fh = null;
		await rename(this.opts.filePath, sealed);
		this._fh = await open(this.opts.filePath, "a+");
		this._size = 0;
		await this._writeSegmentStart(seq, path.basename(sealed), head);
	}
	async _writeHeadAnchor(hash) {
		await this.anchor.write(hash);
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
			const probe = JSON.stringify(buildRecord({
				prevHash: this._lastHash,
				type: input.type,
				actor: input.actor,
				level: input.level,
				payload: input.payload,
				ts: this.clock()
			}));
			if (this._size > 0 && this._size + probe.length + 1 > this.maxBytes) await this._rotate();
			const record = buildRecord({
				prevHash: this._lastHash,
				type: input.type,
				actor: input.actor,
				level: input.level,
				payload: input.payload,
				ts: this.clock()
			});
			const line = JSON.stringify(record) + "\n";
			await this._fh.appendFile(line);
			this._size += Buffer.byteLength(line);
			this._lastHash = record.recordHash;
			await this._writeHeadAnchor(record.recordHash).catch(() => {});
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
/**
* Verify the hash chain, one record at a time.
*
* This streams rather than reading the file, and that is not an optimisation.
* Node caps a string at about 512MB, and this log has no rotation: a live
* install reached 810MB in under five days. Reading it whole threw
* ERR_STRING_TOO_LONG, which meant the chain became unverifiable exactly when
* it grew large enough to matter -- the failure mode a tamper-evident log can
* least afford, since "cannot verify" and "verifies fine" must never be the
* same observation from the outside.
*
* Verification is inherently sequential, so a line stream is also the natural
* shape: memory stays flat regardless of how far the log has grown.
*/
async function verifyChain(filePath, headAnchor) {
	const stream = createReadStream(filePath, { encoding: "utf8" });
	const lines = createInterface({
		input: stream,
		crlfDelay: Infinity
	});
	let prev = GENESIS_PREV_HASH;
	let continuesFrom;
	let i = 0;
	try {
		for await (const line of lines) {
			if (line.length === 0) continue;
			let rec;
			try {
				rec = JSON.parse(line);
			} catch {
				return {
					ok: false,
					count: i,
					brokenAt: i,
					reason: "invalid JSON"
				};
			}
			if (i === 0 && rec.prevHash !== GENESIS_PREV_HASH) {
				const link = segmentLink(rec);
				if (link) {
					prev = rec.prevHash;
					continuesFrom = link.prevSegment;
				}
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
			i++;
		}
		const sink = headAnchor ?? fileHeadAnchor(filePath);
		let expectedHead;
		let attested = "device";
		try {
			if (sink.readAttested) {
				const r = await sink.readAttested();
				expectedHead = r.head;
				attested = r.attested;
			} else expectedHead = await sink.read();
		} catch (err) {
			return {
				ok: false,
				count: i,
				brokenAt: i,
				reason: `head anchor (${sink.id}) could not be verified: ${err instanceof Error ? err.message : String(err)}`
			};
		}
		if (expectedHead !== null && expectedHead !== prev) return {
			ok: false,
			count: i,
			brokenAt: i,
			reason: `chain verifies but ends at a different record than the recorded head (expected ${expectedHead.slice(0, 12)}..., found ${prev.slice(0, 12)}...): records have been removed from the end`
		};
		return {
			ok: true,
			count: i,
			head: prev,
			anchor: expectedHead === null ? "absent" : attested === "offline" ? "matched-offline" : "matched",
			anchorId: sink.id,
			...continuesFrom ? { continuesFrom } : {}
		};
	} finally {
		lines.close();
		stream.close();
	}
}
/**
* Verify the whole history across every rotated segment.
*
* verifyChain checks one file, and a rotated file legitimately begins mid-chain,
* so on its own it cannot tell a genuine continuation from a fabricated one --
* an attacker could delete every earlier segment and forge a link header
* claiming to continue from a file that no longer exists. This walks the
* segments oldest-first and checks each seam against the file it names, so a
* missing or substituted segment is caught rather than assumed away.
*
* The anchor is checked once, at the end, against the newest head.
*/
async function verifyHistory(filePath, headAnchor) {
	const files = [...(await listSegments(filePath)).map((x) => x.file), filePath];
	const out = [];
	let total = 0;
	let expectPrev = null;
	for (const file of files) {
		const isLast = file === filePath;
		const r = await verifyChain(file, isLast ? headAnchor : NO_ANCHOR);
		if (!r.ok) return {
			ok: false,
			file,
			count: total + r.count,
			brokenAt: r.brokenAt,
			reason: r.reason
		};
		const first = await firstRecord(file);
		if (expectPrev === null) {
			if (first !== null && first.prevHash !== GENESIS_PREV_HASH) return {
				ok: false,
				file,
				count: total,
				brokenAt: null,
				reason: "the oldest segment does not start at genesis: earlier segments are missing"
			};
		} else if (first === null) return {
			ok: false,
			file,
			count: total,
			brokenAt: null,
			reason: "segment is empty; the chain has a gap"
		};
		else if (first.prevHash !== expectPrev) return {
			ok: false,
			file,
			count: total,
			brokenAt: null,
			reason: `segment starts from ${first.prevHash.slice(0, 12)}... but the previous one ends at ${expectPrev.slice(0, 12)}...: a segment has been removed or replaced`
		};
		out.push({
			file,
			count: r.count
		});
		total += r.count;
		expectPrev = r.head;
		if (isLast) return {
			ok: true,
			segments: out,
			count: total,
			head: r.head,
			anchor: r.anchor,
			anchorId: r.anchorId
		};
	}
	return {
		ok: false,
		file: filePath,
		count: total,
		brokenAt: null,
		reason: "no segments found"
	};
}
/** A sink that asserts nothing, for verifying sealed segments mid-history. */
const NO_ANCHOR = {
	id: "none",
	async write() {},
	async read() {
		return null;
	}
};
async function firstRecord(file) {
	const stream = createReadStream(file, { encoding: "utf8" });
	const lines = createInterface({
		input: stream,
		crlfDelay: Infinity
	});
	try {
		for await (const line of lines) {
			if (line.length === 0) continue;
			try {
				return JSON.parse(line);
			} catch {
				return null;
			}
		}
		return null;
	} finally {
		lines.close();
		stream.close();
	}
}
//#endregion
export { verifyChain as n, verifyHistory as r, AuditLogger as t };
