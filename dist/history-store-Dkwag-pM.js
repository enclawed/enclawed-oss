import "./policy-DkHRIVB7.js";
import { _ as resolveStateDir } from "./paths-CdrhK-F7.js";
import path from "node:path";
import fs from "node:fs/promises";
import { createHash, randomBytes } from "node:crypto";
//#region src/enclawed/history-store.ts
const SNAPSHOT_HASH_RE = /^[0-9a-f]{64}$/;
var HistoryTamperedError = class extends Error {
	constructor(hash) {
		super(`snapshot ${hash} does not match its content hash; refusing to use it`);
		this.code = "tampered";
		this.name = "HistoryTamperedError";
	}
};
function resolveHistoryDir(env = process.env) {
	const explicit = env.ENCLAWED_HISTORY_DIR?.trim();
	return explicit ? path.resolve(explicit) : path.join(resolveStateDir(env), "history");
}
function sha256Hex(data) {
	return createHash("sha256").update(data).digest("hex");
}
const PRUNE_INTERVAL_MS = 600 * 1e3;
const UNREFERENCED_GRACE_MS = 60 * 1e3;
const pinnedSnapshots = /* @__PURE__ */ new Map();
function pinSnapshot(hash) {
	pinnedSnapshots.set(hash, (pinnedSnapshots.get(hash) ?? 0) + 1);
}
function unpinSnapshot(hash) {
	const n = pinnedSnapshots.get(hash) ?? 0;
	if (n <= 1) pinnedSnapshots.delete(hash);
	else pinnedSnapshots.set(hash, n - 1);
}
var HistoryStore = class {
	constructor(opts) {
		this.totalBytes = null;
		this.lastPrune = 0;
		this.dir = opts.dir ?? resolveHistoryDir();
		this.limits = opts.limits;
		this.now = opts.now ?? Date.now;
	}
	get objectsDir() {
		return path.join(this.dir, "objects");
	}
	get indexPath() {
		return path.join(this.dir, "index.jsonl");
	}
	objectPath(hash) {
		return path.join(this.objectsDir, hash);
	}
	async ensureDirs() {
		await fs.mkdir(this.objectsDir, {
			recursive: true,
			mode: 448
		});
	}
	async scanTotal() {
		let total = 0;
		let names = [];
		try {
			names = await fs.readdir(this.objectsDir);
		} catch {
			return 0;
		}
		for (const name of names) {
			if (!SNAPSHOT_HASH_RE.test(name)) continue;
			try {
				total += (await fs.stat(this.objectPath(name))).size;
			} catch {}
		}
		return total;
	}
	/** Bytes the store holds now. */
	async usedBytes() {
		if (this.totalBytes === null) this.totalBytes = await this.scanTotal();
		return this.totalBytes;
	}
	/** Store content under its hash, unless that would exceed the budget. */
	async put(content) {
		const hash = sha256Hex(content);
		try {
			await this.maybePrune();
			await this.ensureDirs();
			const target = this.objectPath(hash);
			try {
				await fs.access(target);
				pinSnapshot(hash);
				return {
					ok: true,
					hash,
					stored: false
				};
			} catch {}
			const used = await this.usedBytes();
			if (used + content.length > this.limits.maxTotalBytes) return {
				ok: false,
				code: "over-retention-budget"
			};
			const tmp = `${target}.${randomBytes(6).toString("hex")}.tmp`;
			await fs.writeFile(tmp, content, {
				mode: 384,
				flag: "wx"
			});
			await fs.rename(tmp, target);
			pinSnapshot(hash);
			this.totalBytes = used + content.length;
			return {
				ok: true,
				hash,
				stored: true
			};
		} catch (err) {
			return {
				ok: false,
				code: "store-failed",
				detail: String(err)
			};
		}
	}
	async record(entry) {
		const full = {
			v: 1,
			ts: this.now(),
			...entry
		};
		await this.ensureDirs();
		await fs.appendFile(this.indexPath, `${JSON.stringify(full)}\n`, { mode: 384 });
		if (full.hash !== null) unpinSnapshot(full.hash);
		return full;
	}
	async list(filterPath) {
		let raw = "";
		try {
			raw = await fs.readFile(this.indexPath, "utf8");
		} catch {
			return [];
		}
		const out = [];
		const wanted = filterPath ? path.resolve(filterPath) : null;
		for (const line of raw.split("\n")) {
			if (!line.trim()) continue;
			let entry;
			try {
				entry = JSON.parse(line);
			} catch {
				continue;
			}
			if (wanted && path.resolve(entry.path) !== wanted && path.resolve(entry.realPath) !== wanted) continue;
			out.push(entry);
		}
		return out;
	}
	/** The content of a snapshot, after checking it still hashes to its name. */
	async readVerified(hash) {
		if (!SNAPSHOT_HASH_RE.test(hash)) throw new TypeError(`not a snapshot hash: ${hash}`);
		const content = await fs.readFile(this.objectPath(hash));
		if (sha256Hex(content) !== hash) throw new HistoryTamperedError(hash);
		return content;
	}
	async maybePrune() {
		if (this.now() - this.lastPrune < PRUNE_INTERVAL_MS) return;
		await this.prune();
	}
	/** Drop entries older than maxAgeDays and the objects nothing references. */
	async prune() {
		this.lastPrune = this.now();
		const ageDays = Math.max(this.limits.maxAgeDays, 7);
		const cutoff = this.now() - ageDays * 24 * 60 * 60 * 1e3;
		const entries = await this.list();
		const kept = entries.filter((e) => e.ts >= cutoff);
		if (kept.length !== entries.length) {
			const tmp = `${this.indexPath}.${randomBytes(6).toString("hex")}.tmp`;
			await fs.writeFile(tmp, kept.map((e) => `${JSON.stringify(e)}\n`).join(""), { mode: 384 });
			await fs.rename(tmp, this.indexPath);
		}
		const referenced = new Set(kept.map((e) => e.hash).filter((h) => h !== null));
		let removedObjects = 0;
		let names = [];
		try {
			names = await fs.readdir(this.objectsDir);
		} catch {
			names = [];
		}
		for (const name of names) {
			if (!SNAPSHOT_HASH_RE.test(name) || referenced.has(name) || pinnedSnapshots.has(name)) continue;
			try {
				const st = await fs.stat(this.objectPath(name));
				if (this.now() - st.mtimeMs < UNREFERENCED_GRACE_MS) continue;
				await fs.rm(this.objectPath(name));
				removedObjects++;
			} catch {}
		}
		this.totalBytes = null;
		return {
			removedEntries: entries.length - kept.length,
			removedObjects
		};
	}
};
//#endregion
export { resolveHistoryDir as i, HistoryTamperedError as n, SNAPSHOT_HASH_RE as r, HistoryStore as t };
