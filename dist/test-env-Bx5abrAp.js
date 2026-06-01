import { i as normalizeLowercaseStringOrEmpty, o as normalizeOptionalLowercaseString, r as lowercasePreservingWhitespace } from "./string-coerce-BUSzWgUA.js";
import "./env-Cb5sXvy0.js";
import { r as loadShellEnvFallback } from "./shell-env-BtVb9cHO.js";
import { t as getProviderEnvVars } from "./provider-env-vars-DV0ZZ1ed.js";
import "./failover-matches-DSKxz_I-.js";
import "./live-auth-keys-DZu9F6Ib.js";
import "./png-encode-BHp_Q3mb.js";
import { n as vi } from "./test.D1JkM1w4-D13rLkG2.js";
import { n as cleanupSessionStateForTest, o as withFetchPreconnect } from "./temp-home-2OCZzewy.js";
import "./state-dir-env-DlRot5Y3.js";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { EventEmitter } from "node:events";
import { createServer } from "node:http";
//#region src/test-utils/generation-live-test-helpers.ts
function maybeLoadShellEnvForGenerationProviders(providerIds) {
	const expectedKeys = [...new Set(providerIds.flatMap((providerId) => getProviderEnvVars(providerId)))];
	if (expectedKeys.length === 0) return;
	loadShellEnvFallback({
		enabled: true,
		env: process.env,
		expectedKeys,
		logger: { warn: (message) => console.warn(message) }
	});
}
//#endregion
//#region src/media-generation/live-test-helpers.ts
function redactLiveApiKey(value) {
	const trimmed = value?.trim();
	if (!trimmed) return "none";
	if (trimmed.length <= 12) return trimmed;
	return `${trimmed.slice(0, 8)}...${trimmed.slice(-4)}`;
}
function parseLiveCsvFilter(raw, options = {}) {
	const trimmed = raw?.trim();
	if (!trimmed || trimmed === "all") return null;
	const values = trimmed.split(",").map((entry) => options.lowercase === false ? entry.trim() : normalizeOptionalLowercaseString(entry)).filter((entry) => Boolean(entry));
	return values.length > 0 ? new Set(values) : null;
}
function parseProviderModelMap(raw) {
	const entries = /* @__PURE__ */ new Map();
	for (const token of raw?.split(",") ?? []) {
		const trimmed = token.trim();
		if (!trimmed) continue;
		const slash = trimmed.indexOf("/");
		if (slash <= 0 || slash === trimmed.length - 1) continue;
		const providerId = normalizeOptionalLowercaseString(trimmed.slice(0, slash));
		if (!providerId) continue;
		entries.set(providerId, trimmed);
	}
	return entries;
}
function resolveConfiguredLiveProviderModels(configured) {
	const resolved = /* @__PURE__ */ new Map();
	const add = (value) => {
		const trimmed = value?.trim();
		if (!trimmed) return;
		const slash = trimmed.indexOf("/");
		if (slash <= 0 || slash === trimmed.length - 1) return;
		const providerId = normalizeOptionalLowercaseString(trimmed.slice(0, slash));
		if (!providerId) return;
		resolved.set(providerId, trimmed);
	};
	if (typeof configured === "string") {
		add(configured);
		return resolved;
	}
	add(configured?.primary);
	for (const fallback of configured?.fallbacks ?? []) add(fallback);
	return resolved;
}
function resolveLiveAuthStore(params) {
	if (params.requireProfileKeys || !params.hasLiveKeys) return;
	return {
		version: 1,
		profiles: {}
	};
}
//#endregion
//#region src/music-generation/live-test-helpers.ts
const DEFAULT_LIVE_MUSIC_MODELS = {
	google: "google/lyria-3-clip-preview",
	minimax: "minimax/music-2.5+"
};
function resolveConfiguredLiveMusicModels(cfg) {
	return resolveConfiguredLiveProviderModels(cfg.agents?.defaults?.musicGenerationModel);
}
function resolveLiveMusicAuthStore(params) {
	return resolveLiveAuthStore(params);
}
//#endregion
//#region src/video-generation/live-test-helpers.ts
const DEFAULT_LIVE_VIDEO_MODELS = {
	alibaba: "alibaba/wan2.6-t2v",
	byteplus: "byteplus/seedance-1-0-lite-t2v-250428",
	fal: "fal/fal-ai/minimax/video-01-live",
	google: "google/veo-3.1-fast-generate-preview",
	minimax: "minimax/MiniMax-Hailuo-2.3",
	openai: "openai/sora-2",
	qwen: "qwen/wan2.6-t2v",
	runway: "runway/gen4.5",
	together: "together/Wan-AI/Wan2.2-T2V-A14B",
	vydra: "vydra/veo3",
	xai: "xai/grok-imagine-video"
};
const REMOTE_URL_VIDEO_TO_VIDEO_PROVIDERS = new Set([
	"alibaba",
	"google",
	"openai",
	"qwen",
	"xai"
]);
const BUFFER_BACKED_IMAGE_TO_VIDEO_UNSUPPORTED_PROVIDERS = new Set(["vydra"]);
function resolveLiveVideoResolution(params) {
	if (normalizeLowercaseStringOrEmpty(params.providerId) === "minimax") return "768P";
	return "480P";
}
function resolveConfiguredLiveVideoModels(cfg) {
	return resolveConfiguredLiveProviderModels(cfg.agents?.defaults?.videoGenerationModel);
}
function canRunBufferBackedVideoToVideoLiveLane(params) {
	const providerId = normalizeLowercaseStringOrEmpty(params.providerId);
	if (REMOTE_URL_VIDEO_TO_VIDEO_PROVIDERS.has(providerId)) return false;
	if (providerId !== "runway") return true;
	const slash = params.modelRef.indexOf("/");
	return (slash <= 0 || slash === params.modelRef.length - 1 ? params.modelRef.trim() : params.modelRef.slice(slash + 1).trim()) === "gen4_aleph";
}
function canRunBufferBackedImageToVideoLiveLane(params) {
	const providerId = normalizeLowercaseStringOrEmpty(params.providerId);
	if (BUFFER_BACKED_IMAGE_TO_VIDEO_UNSUPPORTED_PROVIDERS.has(providerId)) return false;
	return true;
}
function resolveLiveVideoAuthStore(params) {
	return resolveLiveAuthStore(params);
}
//#endregion
//#region src/test-utils/provider-usage-fetch.ts
function makeResponse(status, body) {
	const payload = typeof body === "string" ? body : JSON.stringify(body);
	return new Response(payload, {
		status,
		headers: typeof body === "string" ? void 0 : { "Content-Type": "application/json" }
	});
}
function toRequestUrl(input) {
	return typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
}
function createProviderUsageFetch(handler) {
	return withFetchPreconnect(vi.fn(async (input, init) => handler(toRequestUrl(input), init)));
}
//#endregion
//#region src/test-utils/mock-http-response.ts
function createMockServerResponse() {
	const headers = {};
	const res = {
		headersSent: false,
		statusCode: 200,
		setHeader: (key, value) => {
			headers[lowercasePreservingWhitespace(key)] = value;
			return res;
		},
		getHeader: (key) => headers[lowercasePreservingWhitespace(key)],
		end: (body) => {
			res.headersSent = true;
			res.body = body;
			return res;
		}
	};
	return res;
}
//#endregion
//#region src/test-utils/temp-dir.ts
async function withTempDir(prefix, run) {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
	try {
		return await run(dir);
	} finally {
		await fs.rm(dir, {
			recursive: true,
			force: true
		});
	}
}
//#endregion
//#region src/test-utils/frozen-time.ts
function useFrozenTime(at) {
	vi.useFakeTimers();
	vi.setSystemTime(at);
}
function useRealTime() {
	vi.useRealTimers();
}
//#endregion
//#region src/plugin-sdk/test-helpers/http-test-server.ts
async function withServer(handler, fn) {
	const server = createServer(handler);
	await new Promise((resolve) => {
		server.listen(0, "127.0.0.1", () => resolve());
	});
	const address = server.address();
	if (!address) throw new Error("missing server address");
	try {
		await fn(`http://127.0.0.1:${address.port}`);
	} finally {
		await new Promise((resolve) => server.close(() => resolve()));
	}
}
//#endregion
//#region src/plugin-sdk/test-helpers/mock-incoming-request.ts
function createMockIncomingRequest(chunks) {
	const req = new EventEmitter();
	req.destroyed = false;
	req.headers = {};
	req.destroy = () => {
		req.destroyed = true;
		return req;
	};
	Promise.resolve().then(() => {
		for (const chunk of chunks) {
			req.emit("data", Buffer.from(chunk, "utf-8"));
			if (req.destroyed) return;
		}
		req.emit("end");
	});
	return req;
}
//#endregion
//#region src/plugin-sdk/test-helpers/temp-home.ts
const SHARED_HOME_ROOTS = /* @__PURE__ */ new Map();
function snapshotEnv() {
	return {
		home: process.env.HOME,
		userProfile: process.env.USERPROFILE,
		homeDrive: process.env.HOMEDRIVE,
		homePath: process.env.HOMEPATH,
		enclawedHome: process.env.ENCLAWED_HOME,
		stateDir: process.env.ENCLAWED_STATE_DIR
	};
}
function restoreEnv(snapshot) {
	const restoreKey = (key, value) => {
		if (value === void 0) delete process.env[key];
		else process.env[key] = value;
	};
	restoreKey("HOME", snapshot.home);
	restoreKey("USERPROFILE", snapshot.userProfile);
	restoreKey("HOMEDRIVE", snapshot.homeDrive);
	restoreKey("HOMEPATH", snapshot.homePath);
	restoreKey("ENCLAWED_HOME", snapshot.enclawedHome);
	restoreKey("ENCLAWED_STATE_DIR", snapshot.stateDir);
}
function snapshotExtraEnv(keys) {
	const snapshot = {};
	for (const key of keys) snapshot[key] = process.env[key];
	return snapshot;
}
function restoreExtraEnv(snapshot) {
	for (const [key, value] of Object.entries(snapshot)) if (value === void 0) delete process.env[key];
	else process.env[key] = value;
}
function setTempHome(base) {
	process.env.HOME = base;
	process.env.USERPROFILE = base;
	delete process.env.ENCLAWED_HOME;
	process.env.ENCLAWED_STATE_DIR = path.join(base, ".enclawed");
	if (process.platform !== "win32") return;
	const match = base.match(/^([A-Za-z]:)(.*)$/);
	if (!match) return;
	process.env.HOMEDRIVE = match[1];
	process.env.HOMEPATH = match[2] || "\\";
}
async function allocateTempHomeBase(prefix) {
	let state = SHARED_HOME_ROOTS.get(prefix);
	if (!state) {
		state = {
			rootPromise: fs.mkdtemp(path.join(os.tmpdir(), prefix)),
			nextCaseId: 0
		};
		SHARED_HOME_ROOTS.set(prefix, state);
	}
	const root = await state.rootPromise;
	const base = path.join(root, `case-${state.nextCaseId++}`);
	await fs.mkdir(base, { recursive: true });
	return base;
}
async function withTempHome(fn, opts = {}) {
	const base = await allocateTempHomeBase(opts.prefix ?? "enclawed-test-home-");
	const snapshot = snapshotEnv();
	const envKeys = Object.keys(opts.env ?? {});
	for (const key of envKeys) if (key === "HOME" || key === "USERPROFILE" || key === "HOMEDRIVE" || key === "HOMEPATH") throw new Error(`withTempHome: use built-in home env (got ${key})`);
	const envSnapshot = snapshotExtraEnv(envKeys);
	setTempHome(base);
	await fs.mkdir(path.join(base, ".enclawed", "agents", "main", "sessions"), { recursive: true });
	if (opts.env) for (const [key, raw] of Object.entries(opts.env)) {
		const value = typeof raw === "function" ? raw(base) : raw;
		if (value === void 0) delete process.env[key];
		else process.env[key] = value;
	}
	try {
		return await fn(base);
	} finally {
		if (!opts.skipSessionCleanup) await cleanupSessionStateForTest().catch(() => void 0);
		restoreExtraEnv(envSnapshot);
		restoreEnv(snapshot);
		try {
			if (process.platform === "win32") await fs.rm(base, {
				recursive: true,
				force: true,
				maxRetries: 10,
				retryDelay: 50
			});
			else await fs.rm(base, {
				recursive: true,
				force: true
			});
		} catch {}
	}
}
//#endregion
export { maybeLoadShellEnvForGenerationProviders as S, resolveConfiguredLiveMusicModels as _, useRealTime as a, parseProviderModelMap as b, createProviderUsageFetch as c, canRunBufferBackedImageToVideoLiveLane as d, canRunBufferBackedVideoToVideoLiveLane as f, DEFAULT_LIVE_MUSIC_MODELS as g, resolveLiveVideoResolution as h, useFrozenTime as i, makeResponse as l, resolveLiveVideoAuthStore as m, createMockIncomingRequest as n, withTempDir as o, resolveConfiguredLiveVideoModels as p, withServer as r, createMockServerResponse as s, withTempHome as t, DEFAULT_LIVE_VIDEO_MODELS as u, resolveLiveMusicAuthStore as v, redactLiveApiKey as x, parseLiveCsvFilter as y };
