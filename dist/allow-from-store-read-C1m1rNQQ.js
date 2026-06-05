import { i as normalizeLowercaseStringOrEmpty, s as normalizeOptionalString } from "./string-coerce-BUSzWgUA.js";
import { o as resolveRequiredHomeDir } from "./home-dir-yzjXRaUx.js";
import { _ as resolveStateDir, h as resolveOAuthDir } from "./paths-CDjhyzOH.js";
import "./account-id-BV5xNTUp.js";
import "./json-store-BSckwBZS.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
//#region src/pairing/allow-from-store-read.ts
const allowFromReadCache = /* @__PURE__ */ new Map();
function resolveCredentialsDir(env = process.env) {
	return resolveOAuthDir(env, resolveStateDir(env, () => resolveRequiredHomeDir(env, os.homedir)));
}
function safeChannelKey(channel) {
	const raw = normalizeLowercaseStringOrEmpty(String(channel));
	if (!raw) throw new Error("invalid pairing channel");
	const safe = raw.replace(/[\\/:*?"<>|]/g, "_").replace(/\.\./g, "_");
	if (!safe || safe === "_") throw new Error("invalid pairing channel");
	return safe;
}
function safeAccountKey(accountId) {
	const raw = normalizeLowercaseStringOrEmpty(accountId);
	if (!raw) throw new Error("invalid pairing account id");
	const safe = raw.replace(/[\\/:*?"<>|]/g, "_").replace(/\.\./g, "_");
	if (!safe || safe === "_") throw new Error("invalid pairing account id");
	return safe;
}
function resolveAllowFromPath(channel, env = process.env, accountId) {
	const base = safeChannelKey(channel);
	const normalizedAccountId = normalizeOptionalString(accountId) ?? "";
	if (!normalizedAccountId) return path.join(resolveCredentialsDir(env), `${base}-allowFrom.json`);
	return path.join(resolveCredentialsDir(env), `${base}-${safeAccountKey(normalizedAccountId)}-allowFrom.json`);
}
function dedupePreserveOrder(entries) {
	const seen = /* @__PURE__ */ new Set();
	const out = [];
	for (const entry of entries) {
		const normalized = normalizeOptionalString(entry) ?? "";
		if (!normalized || seen.has(normalized)) continue;
		seen.add(normalized);
		out.push(normalized);
	}
	return out;
}
function normalizeRawAllowFromList(store) {
	return dedupePreserveOrder((Array.isArray(store.allowFrom) ? store.allowFrom : []).map((entry) => normalizeOptionalString(entry) ?? "").filter(Boolean));
}
function cloneAllowFromCacheEntry(entry) {
	return {
		exists: entry.exists,
		mtimeMs: entry.mtimeMs,
		size: entry.size,
		entries: entry.entries.slice()
	};
}
function setAllowFromReadCache(filePath, entry) {
	allowFromReadCache.set(filePath, cloneAllowFromCacheEntry(entry));
}
function resolveAllowFromReadCacheHit(params) {
	const cached = allowFromReadCache.get(params.filePath);
	if (!cached) return null;
	if (cached.exists !== params.exists) return null;
	if (!params.exists) return cloneAllowFromCacheEntry(cached);
	if (cached.mtimeMs !== params.mtimeMs || cached.size !== params.size) return null;
	return cloneAllowFromCacheEntry(cached);
}
function resolveAllowFromReadCacheOrMissing(filePath, stat) {
	const cached = resolveAllowFromReadCacheHit({
		filePath,
		exists: Boolean(stat),
		mtimeMs: stat?.mtimeMs ?? null,
		size: stat?.size ?? null
	});
	if (cached) return {
		entries: cached.entries,
		exists: cached.exists
	};
	if (!stat) {
		setAllowFromReadCache(filePath, {
			exists: false,
			mtimeMs: null,
			size: null,
			entries: []
		});
		return {
			entries: [],
			exists: false
		};
	}
	return null;
}
function readAllowFromEntriesForPathSyncWithExists(filePath) {
	let stat = null;
	try {
		stat = fs.statSync(filePath);
	} catch (err) {
		if (err.code !== "ENOENT") return {
			entries: [],
			exists: false
		};
	}
	const cachedOrMissing = resolveAllowFromReadCacheOrMissing(filePath, stat);
	if (cachedOrMissing) return cachedOrMissing;
	if (!stat) return {
		entries: [],
		exists: false
	};
	let raw = "";
	try {
		raw = fs.readFileSync(filePath, "utf8");
	} catch (err) {
		if (err.code === "ENOENT") return {
			entries: [],
			exists: false
		};
		return {
			entries: [],
			exists: false
		};
	}
	try {
		const entries = normalizeRawAllowFromList(JSON.parse(raw));
		setAllowFromReadCache(filePath, {
			exists: true,
			mtimeMs: stat.mtimeMs,
			size: stat.size,
			entries
		});
		return {
			entries,
			exists: true
		};
	} catch {
		setAllowFromReadCache(filePath, {
			exists: true,
			mtimeMs: stat.mtimeMs,
			size: stat.size,
			entries: []
		});
		return {
			entries: [],
			exists: true
		};
	}
}
function shouldIncludeLegacyAllowFromEntries(normalizedAccountId) {
	return !normalizedAccountId || normalizedAccountId === "default";
}
function resolveAllowFromAccountId(accountId) {
	return normalizeLowercaseStringOrEmpty(accountId) || "default";
}
function resolveChannelAllowFromPath(channel, env = process.env, accountId) {
	return resolveAllowFromPath(channel, env, accountId);
}
function readChannelAllowFromStoreEntriesSync(channel, env = process.env, accountId) {
	const resolvedAccountId = resolveAllowFromAccountId(accountId);
	if (!shouldIncludeLegacyAllowFromEntries(resolvedAccountId)) return readAllowFromEntriesForPathSyncWithExists(resolveAllowFromPath(channel, env, resolvedAccountId)).entries;
	const scopedEntries = readAllowFromEntriesForPathSyncWithExists(resolveAllowFromPath(channel, env, resolvedAccountId)).entries;
	const legacyEntries = readAllowFromEntriesForPathSyncWithExists(resolveAllowFromPath(channel, env)).entries;
	return dedupePreserveOrder([...scopedEntries, ...legacyEntries]);
}
//#endregion
export { resolveChannelAllowFromPath as n, readChannelAllowFromStoreEntriesSync as t };
