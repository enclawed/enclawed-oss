import { n as VERSION } from "./version-CeugVlbG.js";
import { n as resolveProviderIdForAuth } from "./provider-auth-aliases-BedcKmsr.js";
import { l as resolvePersistedAuthProfileOwnerAgentDir, n as ensureAuthProfileStore, o as loadAuthProfileStoreForSecretsRuntime, u as saveAuthProfileStore } from "./store-CFRep4YQ.js";
import { t as resolveEnclawedAgentDir } from "./agent-paths-CK1LyoiU.js";
import { t as resolveApiKeyForProfile } from "./oauth-pKeM9C4N.js";
import { t as log } from "./logger-DPoiSUrL.js";
import { i as resolveWindowsSpawnProgram, n as materializeWindowsSpawnProgram } from "./windows-spawn-d5_lMF47.js";
import "./provider-auth-HbARvoyU.js";
import "./agent-runtime-Cge46z04.js";
import "./agent-harness-runtime-D3wqySCl.js";
import { i as resolveCodexAppServerRuntimeOptions, t as codexAppServerStartOptionsKey } from "./config-COjeGYaA.js";
import { n as isRpcResponse } from "./protocol-B5MYjtGn.js";
import { fileURLToPath } from "node:url";
import { constants } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import fs$1, { access } from "node:fs/promises";
import { EventEmitter } from "node:events";
import { PassThrough, Writable } from "node:stream";
import WebSocket from "ws";
import { createInterface } from "node:readline";
//#region extensions/codex/src/app-server/transport-stdio.ts
const UNSAFE_ENVIRONMENT_KEYS = new Set([
	"__proto__",
	"constructor",
	"prototype"
]);
const DEFAULT_SPAWN_RUNTIME = {
	platform: process.platform,
	env: process.env,
	execPath: process.execPath
};
function resolveCodexAppServerSpawnInvocation(options, runtime = DEFAULT_SPAWN_RUNTIME) {
	if (options.commandSource === "managed") throw new Error("Managed Codex app-server start options must be resolved before spawn.");
	const resolved = materializeWindowsSpawnProgram(resolveWindowsSpawnProgram({
		command: options.command,
		platform: runtime.platform,
		env: runtime.env,
		execPath: runtime.execPath,
		packageName: "@openai/codex"
	}), options.args);
	return {
		command: resolved.command,
		args: resolved.argv,
		shell: resolved.shell,
		windowsHide: resolved.windowsHide
	};
}
function resolveCodexAppServerSpawnEnv(options, baseEnv = process.env, platform = process.platform) {
	const env = Object.create(null);
	copySafeEnvironmentEntries(env, baseEnv);
	copySafeEnvironmentEntries(env, options.env ?? {});
	const keysToClear = normalizedEnvironmentKeys(options.clearEnv ?? []);
	if (platform === "win32") {
		const lowerCaseKeysToClear = new Set(keysToClear.map((key) => key.toLowerCase()));
		for (const candidate of Object.keys(env)) if (lowerCaseKeysToClear.has(candidate.toLowerCase())) delete env[candidate];
	} else for (const key of keysToClear) delete env[key];
	return env;
}
function normalizedEnvironmentKeys(rawKeys) {
	const keys = [];
	for (const rawKey of rawKeys) {
		const key = rawKey.trim();
		if (key.length > 0) keys.push(key);
	}
	return keys;
}
function copySafeEnvironmentEntries(target, source) {
	for (const [key, value] of Object.entries(source)) {
		if (UNSAFE_ENVIRONMENT_KEYS.has(key)) continue;
		target[key] = value;
	}
}
function createStdioTransport(options) {
	const env = resolveCodexAppServerSpawnEnv(options);
	const invocation = resolveCodexAppServerSpawnInvocation(options, {
		platform: process.platform,
		env,
		execPath: process.execPath
	});
	return spawn(invocation.command, invocation.args, {
		env,
		detached: process.platform !== "win32",
		shell: invocation.shell,
		stdio: [
			"pipe",
			"pipe",
			"pipe"
		],
		windowsHide: invocation.windowsHide
	});
}
//#endregion
//#region extensions/codex/src/app-server/transport-websocket.ts
function createWebSocketTransport(options) {
	if (!options.url) throw new Error("codex app-server websocket transport requires plugins.entries.codex.config.appServer.url");
	const events = new EventEmitter();
	const stdout = new PassThrough();
	const stderr = new PassThrough();
	const headers = {
		...options.headers,
		...options.authToken ? { Authorization: `Bearer ${options.authToken}` } : {}
	};
	const socket = new WebSocket(options.url, { headers });
	const pendingFrames = [];
	let killed = false;
	const sendFrame = (frame) => {
		const trimmed = frame.trim();
		if (!trimmed) return;
		if (socket.readyState === WebSocket.OPEN) {
			socket.send(trimmed);
			return;
		}
		pendingFrames.push(trimmed);
	};
	socket.once("open", () => {
		for (const frame of pendingFrames.splice(0)) socket.send(frame);
	});
	socket.once("error", (error) => events.emit("error", error));
	socket.once("close", (code, reason) => {
		killed = true;
		events.emit("exit", code, reason.toString("utf8"));
	});
	socket.on("message", (data) => {
		const text = websocketFrameToText(data);
		stdout.write(text.endsWith("\n") ? text : `${text}\n`);
	});
	return {
		stdin: new Writable({ write(chunk, _encoding, callback) {
			for (const frame of chunk.toString("utf8").split("\n")) sendFrame(frame);
			callback();
		} }),
		stdout,
		stderr,
		get killed() {
			return killed;
		},
		kill: () => {
			killed = true;
			socket.close();
		},
		once: (event, listener) => events.once(event, listener)
	};
}
function websocketFrameToText(data) {
	if (typeof data === "string") return data;
	if (Buffer.isBuffer(data)) return data.toString("utf8");
	if (Array.isArray(data)) return Buffer.concat(data).toString("utf8");
	return Buffer.from(data).toString("utf8");
}
//#endregion
//#region extensions/codex/src/app-server/transport.ts
function closeCodexAppServerTransport(child, options = {}) {
	child.stdout.destroy?.();
	child.stderr.destroy?.();
	child.stdin.end?.();
	child.stdin.destroy?.();
	signalCodexAppServerTransport(child, "SIGTERM");
	const forceKillDelayMs = options.forceKillDelayMs ?? 1e3;
	const forceKill = setTimeout(() => {
		if (hasCodexAppServerTransportExited(child)) return;
		signalCodexAppServerTransport(child, "SIGKILL");
	}, Math.max(1, forceKillDelayMs));
	forceKill.unref?.();
	child.once("exit", () => clearTimeout(forceKill));
	child.unref?.();
	child.stdout.unref?.();
	child.stderr.unref?.();
	child.stdin.unref?.();
}
async function closeCodexAppServerTransportAndWait(child, options = {}) {
	if (!hasCodexAppServerTransportExited(child)) closeCodexAppServerTransport(child, options);
	return await waitForCodexAppServerTransportExit(child, options.exitTimeoutMs ?? 2e3);
}
function hasCodexAppServerTransportExited(child) {
	return child.exitCode !== null && child.exitCode !== void 0 ? true : child.signalCode !== null && child.signalCode !== void 0;
}
async function waitForCodexAppServerTransportExit(child, timeoutMs) {
	if (hasCodexAppServerTransportExited(child)) return true;
	return await new Promise((resolve) => {
		let settled = false;
		const onExit = () => {
			if (settled) return;
			settled = true;
			clearTimeout(timeout);
			resolve(true);
		};
		const timeout = setTimeout(() => {
			if (settled) return;
			settled = true;
			child.off?.("exit", onExit);
			resolve(false);
		}, Math.max(1, timeoutMs));
		timeout.unref?.();
		child.once("exit", onExit);
	});
}
function signalCodexAppServerTransport(child, signal) {
	if (child.pid && process.platform !== "win32") try {
		process.kill(-child.pid, signal);
		return;
	} catch {}
	child.kill?.(signal);
}
//#endregion
//#region extensions/codex/src/app-server/version.ts
const MIN_CODEX_APP_SERVER_VERSION = "0.125.0";
const MANAGED_CODEX_APP_SERVER_PACKAGE = "@openai/codex";
//#endregion
//#region extensions/codex/src/app-server/client.ts
const CODEX_APP_SERVER_PARSE_LOG_MAX = 500;
const CODEX_DYNAMIC_TOOL_SERVER_REQUEST_TIMEOUT_MS = 3e4;
var CodexAppServerRpcError = class extends Error {
	constructor(error, method) {
		super(error.message || `${method} failed`);
		this.name = "CodexAppServerRpcError";
		this.code = error.code;
		this.data = error.data;
	}
};
var CodexAppServerClient = class CodexAppServerClient {
	constructor(child) {
		this.pending = /* @__PURE__ */ new Map();
		this.requestHandlers = /* @__PURE__ */ new Set();
		this.notificationHandlers = /* @__PURE__ */ new Set();
		this.closeHandlers = /* @__PURE__ */ new Set();
		this.nextId = 1;
		this.initialized = false;
		this.closed = false;
		this.child = child;
		this.lines = createInterface({ input: child.stdout });
		this.lines.on("line", (line) => this.handleLine(line));
		child.stderr.on("data", (chunk) => {
			const text = chunk.toString("utf8").trim();
			if (text) log.debug(`codex app-server stderr: ${text}`);
		});
		child.once("error", (error) => this.closeWithError(error instanceof Error ? error : new Error(String(error))));
		child.once("exit", (code, signal) => {
			this.closeWithError(/* @__PURE__ */ new Error(`codex app-server exited: code=${formatExitValue(code)} signal=${formatExitValue(signal)}`));
		});
		child.stdin.on?.("error", (error) => this.closeWithError(error instanceof Error ? error : new Error(String(error))));
	}
	static start(options) {
		const defaults = resolveCodexAppServerRuntimeOptions().start;
		const startOptions = {
			...defaults,
			...options,
			headers: options?.headers ?? defaults.headers
		};
		if (startOptions.transport === "stdio" && startOptions.commandSource === "managed") throw new Error("Managed Codex app-server start options must be resolved before spawn.");
		if (startOptions.transport === "websocket") return new CodexAppServerClient(createWebSocketTransport(startOptions));
		return new CodexAppServerClient(createStdioTransport(startOptions));
	}
	static fromTransportForTests(child) {
		return new CodexAppServerClient(child);
	}
	async initialize() {
		if (this.initialized) return;
		assertSupportedCodexAppServerVersion(await this.request("initialize", {
			clientInfo: {
				name: "enclawed",
				title: "Enclawed",
				version: VERSION
			},
			capabilities: { experimentalApi: true }
		}));
		this.notify("initialized");
		this.initialized = true;
	}
	request(method, params, options) {
		options ??= {};
		if (this.closed) return Promise.reject(/* @__PURE__ */ new Error("codex app-server client is closed"));
		if (options.signal?.aborted) return Promise.reject(/* @__PURE__ */ new Error(`${method} aborted`));
		const id = this.nextId++;
		const message = {
			id,
			method,
			params
		};
		return new Promise((resolve, reject) => {
			let timeout;
			let cleanupAbort;
			const cleanup = () => {
				if (timeout) {
					clearTimeout(timeout);
					timeout = void 0;
				}
				cleanupAbort?.();
				cleanupAbort = void 0;
			};
			const rejectPending = (error) => {
				if (!this.pending.has(id)) return;
				this.pending.delete(id);
				cleanup();
				reject(error);
			};
			if (options.timeoutMs && Number.isFinite(options.timeoutMs) && options.timeoutMs > 0) {
				timeout = setTimeout(() => rejectPending(/* @__PURE__ */ new Error(`${method} timed out`)), Math.max(100, options.timeoutMs));
				timeout.unref?.();
			}
			if (options.signal) {
				const abortListener = () => rejectPending(/* @__PURE__ */ new Error(`${method} aborted`));
				options.signal.addEventListener("abort", abortListener, { once: true });
				cleanupAbort = () => options.signal?.removeEventListener("abort", abortListener);
			}
			this.pending.set(id, {
				method,
				resolve: (value) => {
					cleanup();
					resolve(value);
				},
				reject: (error) => {
					cleanup();
					reject(error);
				},
				cleanup
			});
			if (options.signal?.aborted) {
				rejectPending(/* @__PURE__ */ new Error(`${method} aborted`));
				return;
			}
			try {
				this.writeMessage(message);
			} catch (error) {
				rejectPending(error instanceof Error ? error : new Error(String(error)));
			}
		});
	}
	notify(method, params) {
		this.writeMessage({
			method,
			params
		});
	}
	addRequestHandler(handler) {
		this.requestHandlers.add(handler);
		return () => this.requestHandlers.delete(handler);
	}
	addNotificationHandler(handler) {
		this.notificationHandlers.add(handler);
		return () => this.notificationHandlers.delete(handler);
	}
	addCloseHandler(handler) {
		this.closeHandlers.add(handler);
		return () => this.closeHandlers.delete(handler);
	}
	close() {
		if (!this.markClosed(/* @__PURE__ */ new Error("codex app-server client is closed"))) return;
		closeCodexAppServerTransport(this.child);
	}
	async closeAndWait(options) {
		this.markClosed(/* @__PURE__ */ new Error("codex app-server client is closed"));
		await closeCodexAppServerTransportAndWait(this.child, options);
	}
	writeMessage(message) {
		if (this.closed) return;
		const id = "id" in message ? message.id : void 0;
		const method = "method" in message ? message.method : void 0;
		this.child.stdin.write(`${JSON.stringify(message)}\n`, (error) => {
			if (error) log.warn("codex app-server write failed", {
				error,
				id,
				method
			});
		});
	}
	handleLine(line) {
		const trimmed = line.trim();
		if (!trimmed) return;
		let parsed;
		try {
			parsed = JSON.parse(trimmed);
		} catch (error) {
			log.warn("failed to parse codex app-server message", {
				error,
				linePreview: redactCodexAppServerLinePreview(trimmed)
			});
			return;
		}
		if (!parsed || typeof parsed !== "object") return;
		const message = parsed;
		if (isRpcResponse(message)) {
			this.handleResponse(message);
			return;
		}
		if (!("method" in message)) return;
		if ("id" in message && message.id !== void 0) {
			this.handleServerRequest({
				id: message.id,
				method: message.method,
				params: message.params
			});
			return;
		}
		this.handleNotification({
			method: message.method,
			params: message.params
		});
	}
	handleResponse(response) {
		const pending = this.pending.get(response.id);
		if (!pending) return;
		this.pending.delete(response.id);
		if (response.error) {
			pending.reject(new CodexAppServerRpcError(response.error, pending.method));
			return;
		}
		pending.resolve(response.result);
	}
	async handleServerRequest(request) {
		try {
			const result = await this.runServerRequestHandlers(request);
			if (result !== void 0) {
				this.writeMessage({
					id: request.id,
					result
				});
				return;
			}
			this.writeMessage({
				id: request.id,
				result: defaultServerRequestResponse(request)
			});
		} catch (error) {
			this.writeMessage({
				id: request.id,
				error: { message: error instanceof Error ? error.message : String(error) }
			});
		}
	}
	async runServerRequestHandlers(request) {
		const timeoutResponse = timeoutServerRequestResponse(request);
		if (!timeoutResponse) return await this.runServerRequestHandlersWithoutTimeout(request);
		let timeout;
		try {
			return await Promise.race([this.runServerRequestHandlersWithoutTimeout(request), new Promise((resolve) => {
				timeout = setTimeout(() => {
					log.warn("codex app-server server request timed out", {
						id: request.id,
						method: request.method,
						timeoutMs: CODEX_DYNAMIC_TOOL_SERVER_REQUEST_TIMEOUT_MS
					});
					resolve(timeoutResponse);
				}, CODEX_DYNAMIC_TOOL_SERVER_REQUEST_TIMEOUT_MS);
				timeout.unref?.();
			})]);
		} finally {
			if (timeout) clearTimeout(timeout);
		}
	}
	async runServerRequestHandlersWithoutTimeout(request) {
		for (const handler of this.requestHandlers) {
			const result = await handler(request);
			if (result !== void 0) return result;
		}
	}
	handleNotification(notification) {
		for (const handler of this.notificationHandlers) Promise.resolve(handler(notification)).catch((error) => {
			log.warn("codex app-server notification handler failed", { error });
		});
	}
	closeWithError(error) {
		if (this.markClosed(error)) closeCodexAppServerTransport(this.child);
	}
	markClosed(error) {
		if (this.closed) return false;
		this.closed = true;
		this.lines.close();
		this.rejectPendingRequests(error);
		return true;
	}
	rejectPendingRequests(error) {
		for (const pending of this.pending.values()) {
			pending.cleanup();
			pending.reject(error);
		}
		this.pending.clear();
		for (const handler of this.closeHandlers) handler(this);
	}
};
function defaultServerRequestResponse(request) {
	if (request.method === "item/tool/call") return {
		contentItems: [{
			type: "inputText",
			text: "Enclawed did not register a handler for this app-server tool call."
		}],
		success: false
	};
	if (request.method === "item/commandExecution/requestApproval" || request.method === "item/fileChange/requestApproval") return { decision: "decline" };
	if (request.method === "item/permissions/requestApproval") return {
		permissions: {},
		scope: "turn"
	};
	if (isCodexAppServerApprovalRequest(request.method)) return {
		decision: "decline",
		reason: "Enclawed codex app-server bridge does not grant native approvals yet."
	};
	if (request.method === "item/tool/requestUserInput") return { answers: {} };
	if (request.method === "mcpServer/elicitation/request") return { action: "decline" };
	return {};
}
function timeoutServerRequestResponse(request) {
	if (request.method !== "item/tool/call") return;
	return {
		contentItems: [{
			type: "inputText",
			text: `Enclawed dynamic tool call timed out after ${CODEX_DYNAMIC_TOOL_SERVER_REQUEST_TIMEOUT_MS}ms before sending a response to Codex.`
		}],
		success: false
	};
}
function assertSupportedCodexAppServerVersion(response) {
	const detectedVersion = readCodexVersionFromUserAgent(response.userAgent);
	if (!detectedVersion) throw new Error(`Codex app-server ${MIN_CODEX_APP_SERVER_VERSION} or newer is required, but Enclawed could not determine the running Codex version. Update the configured Codex app-server binary, or remove custom command overrides to use the managed binary.`);
	if (compareVersions(detectedVersion, "0.125.0") < 0) throw new Error(`Codex app-server ${MIN_CODEX_APP_SERVER_VERSION} or newer is required, but detected ${detectedVersion}. Update the configured Codex app-server binary, or remove custom command overrides to use the managed binary.`);
}
function readCodexVersionFromUserAgent(userAgent) {
	return (userAgent?.match(/^[^/]+\/(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)(?:[\s(]|$)/))?.[1];
}
function compareVersions(left, right) {
	const leftVersion = parseVersionForComparison(left);
	const rightVersion = parseVersionForComparison(right);
	const leftParts = leftVersion.parts;
	const rightParts = rightVersion.parts;
	for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
		const leftPart = leftParts[index] ?? 0;
		const rightPart = rightParts[index] ?? 0;
		if (leftPart !== rightPart) return leftPart < rightPart ? -1 : 1;
	}
	if (leftVersion.unstableSuffix && !rightVersion.unstableSuffix) return -1;
	if (!leftVersion.unstableSuffix && rightVersion.unstableSuffix) return 1;
	return 0;
}
function parseVersionForComparison(version) {
	const hasBuildMetadata = version.includes("+");
	const [withoutBuild = version] = version.split("+", 1);
	const prereleaseIndex = withoutBuild.indexOf("-");
	return {
		parts: (prereleaseIndex >= 0 ? withoutBuild.slice(0, prereleaseIndex) : withoutBuild).split(".").map((part) => Number.parseInt(part, 10)).map((part) => Number.isFinite(part) ? part : 0),
		unstableSuffix: prereleaseIndex >= 0 || hasBuildMetadata
	};
}
function redactCodexAppServerLinePreview(value) {
	const redacted = value.replace(/\s+/g, " ").trim().replace(/(Bearer\s+)[A-Za-z0-9._~+/-]+/gi, "$1<redacted>").replace(/("(?:api_?key|authorization|token|access_token|refresh_token)"\s*:\s*")([^"]+)(")/gi, "$1<redacted>$3");
	return redacted.length > CODEX_APP_SERVER_PARSE_LOG_MAX ? `${redacted.slice(0, CODEX_APP_SERVER_PARSE_LOG_MAX)}...` : redacted;
}
const CODEX_APP_SERVER_APPROVAL_REQUEST_METHODS = new Set([
	"item/commandExecution/requestApproval",
	"item/fileChange/requestApproval",
	"item/permissions/requestApproval"
]);
function isCodexAppServerApprovalRequest(method) {
	return CODEX_APP_SERVER_APPROVAL_REQUEST_METHODS.has(method);
}
function formatExitValue(value) {
	if (value === null || value === void 0) return "null";
	if (typeof value === "string" || typeof value === "number") return String(value);
	return "unknown";
}
//#endregion
//#region extensions/codex/src/app-server/auth-bridge.ts
const CODEX_APP_SERVER_AUTH_PROVIDER = "openai-codex";
const OPENAI_CODEX_DEFAULT_PROFILE_ID = "openai-codex:default";
const CODEX_HOME_ENV_VAR = "CODEX_HOME";
const HOME_ENV_VAR = "HOME";
const CODEX_APP_SERVER_HOME_DIRNAME = "codex-home";
const CODEX_APP_SERVER_NATIVE_HOME_DIRNAME = "home";
const CODEX_APP_SERVER_API_KEY_ENV_VARS = ["CODEX_API_KEY", "OPENAI_API_KEY"];
const CODEX_APP_SERVER_ISOLATION_ENV_VARS = [CODEX_HOME_ENV_VAR, HOME_ENV_VAR];
async function bridgeCodexAppServerStartOptions(params) {
	if (params.startOptions.transport !== "stdio") return params.startOptions;
	const isolatedStartOptions = await withAgentCodexHomeEnvironment(params.startOptions, params.agentDir);
	return shouldClearOpenAiApiKeyForCodexAuthProfile({
		store: ensureAuthProfileStore(params.agentDir, { allowKeychainPrompt: false }),
		authProfileId: params.authProfileId
	}) ? withClearedEnvironmentVariables(isolatedStartOptions, CODEX_APP_SERVER_API_KEY_ENV_VARS) : isolatedStartOptions;
}
function resolveCodexAppServerHomeDir(agentDir) {
	return path.join(path.resolve(agentDir), CODEX_APP_SERVER_HOME_DIRNAME);
}
async function withAgentCodexHomeEnvironment(startOptions, agentDir) {
	const codexHome = startOptions.env?.[CODEX_HOME_ENV_VAR]?.trim() ? startOptions.env[CODEX_HOME_ENV_VAR] : resolveCodexAppServerHomeDir(agentDir);
	const nativeHome = startOptions.env?.[HOME_ENV_VAR]?.trim() ? startOptions.env[HOME_ENV_VAR] : path.join(codexHome, CODEX_APP_SERVER_NATIVE_HOME_DIRNAME);
	await fs$1.mkdir(codexHome, { recursive: true });
	await fs$1.mkdir(nativeHome, { recursive: true });
	const nextStartOptions = {
		...startOptions,
		env: {
			...startOptions.env,
			[CODEX_HOME_ENV_VAR]: codexHome,
			[HOME_ENV_VAR]: nativeHome
		}
	};
	const clearEnv = withoutClearedCodexIsolationEnv(startOptions.clearEnv);
	if (clearEnv) nextStartOptions.clearEnv = clearEnv;
	else delete nextStartOptions.clearEnv;
	return nextStartOptions;
}
function withoutClearedCodexIsolationEnv(clearEnv) {
	if (!clearEnv) return;
	const reserved = new Set(CODEX_APP_SERVER_ISOLATION_ENV_VARS);
	const filtered = clearEnv.filter((envVar) => !reserved.has(envVar.trim().toUpperCase()));
	return filtered.length === clearEnv.length ? clearEnv : filtered;
}
async function applyCodexAppServerAuthProfile(params) {
	const loginParams = await resolveCodexAppServerAuthProfileLoginParams({
		agentDir: params.agentDir,
		authProfileId: params.authProfileId
	});
	if (!loginParams) {
		if (params.startOptions?.transport !== "stdio") return;
		const env = resolveCodexAppServerSpawnEnv(params.startOptions, process.env);
		const fallbackLoginParams = await resolveCodexAppServerEnvApiKeyLoginParams({
			client: params.client,
			env
		});
		if (fallbackLoginParams) await params.client.request("account/login/start", fallbackLoginParams);
		return;
	}
	await params.client.request("account/login/start", loginParams);
}
function resolveCodexAppServerAuthProfileLoginParams(params) {
	return resolveCodexAppServerAuthProfileLoginParamsInternal(params);
}
async function refreshCodexAppServerAuthTokens(params) {
	const loginParams = await resolveCodexAppServerAuthProfileLoginParamsInternal({
		...params,
		forceOAuthRefresh: true
	});
	if (!loginParams || loginParams.type !== "chatgptAuthTokens") throw new Error("Codex app-server ChatGPT token refresh requires an OAuth auth profile.");
	return {
		accessToken: loginParams.accessToken,
		chatgptAccountId: loginParams.chatgptAccountId,
		chatgptPlanType: loginParams.chatgptPlanType ?? null
	};
}
async function resolveCodexAppServerAuthProfileLoginParamsInternal(params) {
	const profileId = params.authProfileId?.trim();
	if (!profileId) return;
	const credential = ensureAuthProfileStore(params.agentDir, { allowKeychainPrompt: false }).profiles[profileId];
	if (!credential) throw new Error(`Codex app-server auth profile "${profileId}" was not found.`);
	if (!isCodexAppServerAuthProvider(credential.provider)) throw new Error(`Codex app-server auth profile "${profileId}" must belong to provider "openai-codex" or a supported alias.`);
	const loginParams = await resolveLoginParamsForCredential(profileId, credential, {
		agentDir: params.agentDir,
		forceOAuthRefresh: params.forceOAuthRefresh === true
	});
	if (!loginParams) throw new Error(`Codex app-server auth profile "${profileId}" does not contain usable credentials.`);
	return loginParams;
}
async function resolveCodexAppServerEnvApiKeyLoginParams(params) {
	const apiKey = readFirstNonEmptyEnv(params.env, CODEX_APP_SERVER_API_KEY_ENV_VARS);
	if (!apiKey) return;
	const response = await params.client.request("account/read", { refreshToken: false });
	if (response.account || !response.requiresOpenaiAuth) return;
	return {
		type: "apiKey",
		apiKey
	};
}
async function resolveLoginParamsForCredential(profileId, credential, params) {
	if (credential.type === "api_key") {
		const apiKey = (await resolveApiKeyForProfile({
			store: ensureAuthProfileStore(params.agentDir, { allowKeychainPrompt: false }),
			profileId,
			agentDir: params.agentDir
		}))?.apiKey?.trim();
		return apiKey ? {
			type: "apiKey",
			apiKey
		} : void 0;
	}
	if (credential.type === "token") {
		const accessToken = (await resolveApiKeyForProfile({
			store: ensureAuthProfileStore(params.agentDir, { allowKeychainPrompt: false }),
			profileId,
			agentDir: params.agentDir
		}))?.apiKey?.trim();
		return accessToken ? buildChatgptAuthTokensParams(profileId, credential, accessToken) : void 0;
	}
	const resolvedCredential = await resolveOAuthCredentialForCodexAppServer(profileId, credential, {
		agentDir: params.agentDir,
		forceRefresh: params.forceOAuthRefresh
	});
	const accessToken = resolvedCredential.access?.trim();
	return accessToken ? buildChatgptAuthTokensParams(profileId, resolvedCredential, accessToken) : void 0;
}
async function resolveOAuthCredentialForCodexAppServer(profileId, credential, params) {
	const ownerAgentDir = resolvePersistedAuthProfileOwnerAgentDir({
		agentDir: params.agentDir,
		profileId
	});
	const store = ensureAuthProfileStore(ownerAgentDir, { allowKeychainPrompt: false });
	const ownerCredential = store.profiles[profileId];
	const credentialForOwner = ownerCredential?.type === "oauth" && isCodexAppServerAuthProvider(ownerCredential.provider) ? ownerCredential : credential;
	if (params.forceRefresh) {
		store.profiles[profileId] = {
			...credentialForOwner,
			expires: 0
		};
		saveAuthProfileStore(store, ownerAgentDir);
	}
	const resolved = await resolveApiKeyForProfile({
		store,
		profileId,
		agentDir: ownerAgentDir
	});
	const refreshed = loadAuthProfileStoreForSecretsRuntime(ownerAgentDir).profiles[profileId];
	const storedCredential = store.profiles[profileId];
	const candidate = refreshed?.type === "oauth" && isCodexAppServerAuthProvider(refreshed.provider) ? refreshed : storedCredential?.type === "oauth" && isCodexAppServerAuthProvider(storedCredential.provider) ? storedCredential : credential;
	return resolved?.apiKey ? {
		...candidate,
		access: resolved.apiKey
	} : candidate;
}
function isCodexAppServerAuthProvider(provider) {
	return resolveProviderIdForAuth(provider) === CODEX_APP_SERVER_AUTH_PROVIDER;
}
function shouldClearOpenAiApiKeyForCodexAuthProfile(params) {
	const profileId = params.authProfileId?.trim();
	return isCodexSubscriptionCredential(profileId ? params.store.profiles[profileId] : params.store.profiles[OPENAI_CODEX_DEFAULT_PROFILE_ID]);
}
function isCodexSubscriptionCredential(credential) {
	if (!credential || !isCodexAppServerAuthProvider(credential.provider)) return false;
	return credential.type === "oauth" || credential.type === "token";
}
function withClearedEnvironmentVariables(startOptions, envVars) {
	const clearEnv = startOptions.clearEnv ?? [];
	const missingEnvVars = envVars.filter((envVar) => !clearEnv.includes(envVar));
	if (missingEnvVars.length === 0) return startOptions;
	return {
		...startOptions,
		clearEnv: [...clearEnv, ...missingEnvVars]
	};
}
function readFirstNonEmptyEnv(env, keys) {
	for (const key of keys) {
		const value = env[key]?.trim();
		if (value) return value;
	}
}
function buildChatgptAuthTokensParams(profileId, credential, accessToken) {
	return {
		type: "chatgptAuthTokens",
		accessToken,
		chatgptAccountId: resolveChatgptAccountId(profileId, credential),
		chatgptPlanType: resolveChatgptPlanType(credential)
	};
}
function resolveChatgptPlanType(credential) {
	const record = credential;
	const planType = record.chatgptPlanType ?? record.planType;
	return typeof planType === "string" && planType.trim() ? planType.trim() : null;
}
function resolveChatgptAccountId(profileId, credential) {
	if ("accountId" in credential && typeof credential.accountId === "string") {
		const accountId = credential.accountId.trim();
		if (accountId) return accountId;
	}
	return credential.email?.trim() || profileId;
}
//#endregion
//#region extensions/codex/src/app-server/managed-binary.ts
const CODEX_PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
async function resolveManagedCodexAppServerStartOptions(startOptions, options = {}) {
	if (startOptions.transport !== "stdio" || startOptions.commandSource !== "managed") return startOptions;
	const platform = options.platform ?? process.platform;
	const paths = resolveManagedCodexAppServerPaths({
		platform,
		pluginRoot: options.pluginRoot
	});
	const pathExists = options.pathExists ?? commandPathExists;
	const commandPath = await findManagedCodexAppServerCommandPath({
		candidateCommandPaths: paths.candidateCommandPaths,
		pathExists,
		platform
	});
	return {
		...startOptions,
		command: commandPath,
		commandSource: "resolved-managed"
	};
}
function resolveManagedCodexAppServerPaths(params) {
	const platform = params.platform ?? process.platform;
	const candidateCommandPaths = resolveManagedCodexAppServerCommandCandidates(params.pluginRoot ?? CODEX_PLUGIN_ROOT, platform);
	return {
		commandPath: candidateCommandPaths[0] ?? "",
		candidateCommandPaths
	};
}
function resolveManagedCodexAppServerCommandCandidates(pluginRoot, platform) {
	const pathApi = pathForPlatform(platform);
	const commandName = platform === "win32" ? "codex.cmd" : "codex";
	const roots = [
		pluginRoot,
		pathApi.dirname(pluginRoot),
		pathApi.dirname(pathApi.dirname(pluginRoot)),
		isDistExtensionRoot(pluginRoot, platform) ? pathApi.dirname(pathApi.dirname(pathApi.dirname(pluginRoot))) : null
	].filter((root) => Boolean(root));
	return [...new Set(roots.map((root) => pathApi.join(root, "node_modules", ".bin", commandName)))];
}
function isDistExtensionRoot(pluginRoot, platform) {
	const pathApi = pathForPlatform(platform);
	const extensionsDir = pathApi.dirname(pluginRoot);
	const distDir = pathApi.dirname(extensionsDir);
	return pathApi.basename(extensionsDir) === "extensions" && (pathApi.basename(distDir) === "dist" || pathApi.basename(distDir) === "dist-runtime");
}
function pathForPlatform(platform) {
	return platform === "win32" ? path.win32 : path.posix;
}
async function findManagedCodexAppServerCommandPath(params) {
	for (const commandPath of params.candidateCommandPaths) if (await params.pathExists(commandPath, params.platform)) return commandPath;
	throw new Error([
		`Managed Codex app-server binary was not found for ${MANAGED_CODEX_APP_SERVER_PACKAGE}.`,
		"Reinstall or update Enclawed, or run pnpm install in a source checkout.",
		"Set plugins.entries.codex.config.appServer.command or ENCLAWED_CODEX_APP_SERVER_BIN to use a custom Codex binary."
	].join(" "));
}
async function commandPathExists(filePath, platform) {
	try {
		await access(filePath, platform === "win32" ? constants.F_OK : constants.X_OK);
		return true;
	} catch {
		return false;
	}
}
//#endregion
//#region extensions/codex/src/app-server/timeout.ts
async function withTimeout(promise, timeoutMs, timeoutMessage) {
	if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return await promise;
	let timeout;
	try {
		return await Promise.race([promise, new Promise((_, reject) => {
			timeout = setTimeout(() => reject(new Error(timeoutMessage)), Math.max(1, timeoutMs));
		})]);
	} finally {
		if (timeout) clearTimeout(timeout);
	}
}
//#endregion
//#region extensions/codex/src/app-server/shared-client.ts
const SHARED_CODEX_APP_SERVER_CLIENT_STATE = Symbol.for("enclawed.codexAppServerClientState");
function getSharedCodexAppServerClientState() {
	const globalState = globalThis;
	globalState[SHARED_CODEX_APP_SERVER_CLIENT_STATE] ??= {};
	return globalState[SHARED_CODEX_APP_SERVER_CLIENT_STATE];
}
async function getSharedCodexAppServerClient(options) {
	const state = getSharedCodexAppServerClientState();
	const agentDir = options?.agentDir ?? resolveEnclawedAgentDir();
	const startOptions = await bridgeCodexAppServerStartOptions({
		startOptions: await resolveManagedCodexAppServerStartOptions(options?.startOptions ?? resolveCodexAppServerRuntimeOptions().start),
		agentDir,
		authProfileId: options?.authProfileId
	});
	const key = codexAppServerStartOptionsKey(startOptions, {
		authProfileId: options?.authProfileId,
		agentDir
	});
	if (state.key && state.key !== key) clearSharedCodexAppServerClient();
	state.key = key;
	const sharedPromise = state.promise ?? (state.promise = (async () => {
		const client = CodexAppServerClient.start(startOptions);
		state.client = client;
		client.addCloseHandler(clearSharedClientIfCurrent);
		try {
			await client.initialize();
			await applyCodexAppServerAuthProfile({
				client,
				agentDir,
				authProfileId: options?.authProfileId,
				startOptions
			});
			return client;
		} catch (error) {
			client.close();
			throw error;
		}
	})());
	try {
		return await withTimeout(sharedPromise, options?.timeoutMs ?? 0, "codex app-server initialize timed out");
	} catch (error) {
		if (state.promise === sharedPromise && state.key === key) clearSharedCodexAppServerClient();
		throw error;
	}
}
async function createIsolatedCodexAppServerClient(options) {
	const agentDir = options?.agentDir ?? resolveEnclawedAgentDir();
	const startOptions = await bridgeCodexAppServerStartOptions({
		startOptions: await resolveManagedCodexAppServerStartOptions(options?.startOptions ?? resolveCodexAppServerRuntimeOptions().start),
		agentDir,
		authProfileId: options?.authProfileId
	});
	const client = CodexAppServerClient.start(startOptions);
	const initialize = client.initialize();
	try {
		await withTimeout(initialize, options?.timeoutMs ?? 0, "codex app-server initialize timed out");
		await applyCodexAppServerAuthProfile({
			client,
			agentDir,
			authProfileId: options?.authProfileId,
			startOptions
		});
		return client;
	} catch (error) {
		client.close();
		initialize.catch(() => void 0);
		throw error;
	}
}
function clearSharedCodexAppServerClient() {
	const state = getSharedCodexAppServerClientState();
	const client = state.client;
	state.client = void 0;
	state.promise = void 0;
	state.key = void 0;
	client?.close();
}
async function clearSharedCodexAppServerClientAndWait(options) {
	const state = getSharedCodexAppServerClientState();
	const client = state.client;
	state.client = void 0;
	state.promise = void 0;
	state.key = void 0;
	await client?.closeAndWait(options);
}
function clearSharedClientIfCurrent(client) {
	const state = getSharedCodexAppServerClientState();
	if (state.client !== client) return;
	state.client = void 0;
	state.promise = void 0;
	state.key = void 0;
}
//#endregion
export { withTimeout as a, isCodexAppServerApprovalRequest as c, getSharedCodexAppServerClient as i, clearSharedCodexAppServerClientAndWait as n, refreshCodexAppServerAuthTokens as o, createIsolatedCodexAppServerClient as r, CodexAppServerRpcError as s, clearSharedCodexAppServerClient as t };
