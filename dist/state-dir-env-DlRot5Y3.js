import { i as normalizeLowercaseStringOrEmpty } from "./string-coerce-BUSzWgUA.js";
import { t as isTruthyEnvValue } from "./env-Cb5sXvy0.js";
import { _ as ssrf_exports, h as resolvePinnedHostnameWithPolicy, m as resolvePinnedHostname } from "./ssrf-DQDx1s1G.js";
import { i as afterEach, n as vi, o as beforeEach } from "./test.D1JkM1w4-D13rLkG2.js";
import { n as cleanupSessionStateForTest, o as withFetchPreconnect, r as captureEnv } from "./temp-home-2OCZzewy.js";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
//#region src/media-understanding/audio.test-helpers.ts
function resolveRequestUrl(input) {
	if (typeof input === "string") return input;
	if (input instanceof URL) return input.toString();
	return input.url;
}
function installPinnedHostnameTestHooks() {
	const resolvePinnedHostname$2 = resolvePinnedHostname;
	const resolvePinnedHostnameWithPolicy$2 = resolvePinnedHostnameWithPolicy;
	const lookupMock = vi.fn();
	let resolvePinnedHostnameSpy = null;
	let resolvePinnedHostnameWithPolicySpy = null;
	beforeEach(() => {
		lookupMock.mockResolvedValue([{
			address: "93.184.216.34",
			family: 4
		}]);
		resolvePinnedHostnameSpy = vi.spyOn(ssrf_exports, "resolvePinnedHostname").mockImplementation((hostname) => resolvePinnedHostname$2(hostname, lookupMock));
		resolvePinnedHostnameWithPolicySpy = vi.spyOn(ssrf_exports, "resolvePinnedHostnameWithPolicy").mockImplementation((hostname, params) => resolvePinnedHostnameWithPolicy$2(hostname, {
			...params,
			lookupFn: lookupMock
		}));
	});
	afterEach(() => {
		lookupMock.mockReset();
		resolvePinnedHostnameSpy?.mockRestore();
		resolvePinnedHostnameWithPolicySpy?.mockRestore();
		resolvePinnedHostnameSpy = null;
		resolvePinnedHostnameWithPolicySpy = null;
	});
}
function createAuthCaptureJsonFetch(responseBody) {
	let seenAuth = null;
	return {
		fetchFn: withFetchPreconnect(async (_input, init) => {
			seenAuth = new Headers(init?.headers).get("authorization");
			return new Response(JSON.stringify(responseBody), {
				status: 200,
				headers: { "content-type": "application/json" }
			});
		}),
		getAuthHeader: () => seenAuth
	};
}
function createRequestCaptureJsonFetch(responseBody) {
	let seenUrl = null;
	let seenInit;
	return {
		fetchFn: withFetchPreconnect(async (input, init) => {
			seenUrl = resolveRequestUrl(input);
			seenInit = init;
			return new Response(JSON.stringify(responseBody), {
				status: 200,
				headers: { "content-type": "application/json" }
			});
		}),
		getRequest: () => ({
			url: seenUrl,
			init: seenInit
		})
	};
}
//#endregion
//#region src/agents/live-test-helpers.ts
const LIVE_OK_PROMPT = "Reply with the word ok.";
function isLiveTestEnabled(extraEnvVars = [], env = process.env) {
	return [
		...extraEnvVars,
		"LIVE",
		"ENCLAWED_LIVE_TEST"
	].some((name) => isTruthyEnvValue(env[name]));
}
function isLiveProfileKeyModeEnabled(env = process.env) {
	return isTruthyEnvValue(env.ENCLAWED_LIVE_REQUIRE_PROFILE_KEYS);
}
function createSingleUserPromptMessage(content = LIVE_OK_PROMPT) {
	return [{
		role: "user",
		content,
		timestamp: Date.now()
	}];
}
function extractNonEmptyAssistantText(content) {
	return content.filter((block) => block.type === "text").map((block) => block.text?.trim() ?? "").filter(Boolean).join(" ");
}
//#endregion
//#region src/test-helpers/http.ts
function jsonResponse(body, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" }
	});
}
function requestUrl(input) {
	if (typeof input === "string") return input;
	if (input instanceof URL) return input.toString();
	return input.url;
}
function requestBodyText(body) {
	return typeof body === "string" ? body : "{}";
}
//#endregion
//#region src/test-helpers/ssrf.ts
function mockPinnedHostnameResolution(addresses = ["93.184.216.34"]) {
	const resolvePinnedHostname$1 = resolvePinnedHostname;
	const resolvePinnedHostnameWithPolicy$1 = resolvePinnedHostnameWithPolicy;
	const lookupFn = (async (hostname, options) => {
		const normalized = normalizeLowercaseStringOrEmpty(hostname).replace(/\.$/, "");
		const resolved = addresses.map((address) => ({
			address,
			family: address.includes(":") ? 6 : 4,
			hostname: normalized
		}));
		return options?.all === true ? resolved : resolved[0];
	});
	const pinned = vi.spyOn(ssrf_exports, "resolvePinnedHostname").mockImplementation((hostname) => resolvePinnedHostname$1(hostname, lookupFn));
	const pinnedWithPolicy = vi.spyOn(ssrf_exports, "resolvePinnedHostnameWithPolicy").mockImplementation((hostname, params) => resolvePinnedHostnameWithPolicy$1(hostname, {
		...params,
		lookupFn
	}));
	return { mockRestore: () => {
		pinned.mockRestore();
		pinnedWithPolicy.mockRestore();
	} };
}
//#endregion
//#region src/test-helpers/windows-cmd-shim.ts
async function createWindowsCmdShimFixture(params) {
	await fs.mkdir(path.dirname(params.scriptPath), { recursive: true });
	await fs.mkdir(path.dirname(params.shimPath), { recursive: true });
	await fs.writeFile(params.scriptPath, "module.exports = {};\n", "utf8");
	await fs.writeFile(params.shimPath, `@echo off\r\n${params.shimLine}\r\n`, "utf8");
}
//#endregion
//#region src/test-helpers/state-dir-env.ts
function snapshotStateDirEnv() {
	return captureEnv(["ENCLAWED_STATE_DIR"]);
}
function restoreStateDirEnv(snapshot) {
	snapshot.restore();
}
function setStateDirEnv(stateDir) {
	process.env.ENCLAWED_STATE_DIR = stateDir;
}
async function withStateDirEnv(prefix, fn) {
	const snapshot = snapshotStateDirEnv();
	const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
	const stateDir = path.join(tempRoot, "state");
	await fs.mkdir(stateDir, { recursive: true });
	setStateDirEnv(stateDir);
	try {
		return await fn({
			tempRoot,
			stateDir
		});
	} finally {
		await cleanupSessionStateForTest().catch(() => void 0);
		restoreStateDirEnv(snapshot);
		await fs.rm(tempRoot, {
			recursive: true,
			force: true
		});
	}
}
//#endregion
export { requestBodyText as a, extractNonEmptyAssistantText as c, createAuthCaptureJsonFetch as d, createRequestCaptureJsonFetch as f, jsonResponse as i, isLiveProfileKeyModeEnabled as l, createWindowsCmdShimFixture as n, requestUrl as o, installPinnedHostnameTestHooks as p, mockPinnedHostnameResolution as r, createSingleUserPromptMessage as s, withStateDirEnv as t, isLiveTestEnabled as u };
