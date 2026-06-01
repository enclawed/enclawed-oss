import "./errors-D8p6rxH8.js";
import { s as normalizeOptionalString } from "./string-coerce-BUSzWgUA.js";
import { g as resolveUserPath } from "./utils-CrVQlOZJ.js";
import { t as createSubsystemLogger } from "./subsystem-DTyALtnK.js";
import { g as resolveOAuthPath } from "./paths-CDjhyzOH.js";
import { i as coerceSecretRef, l as normalizeSecretInputString } from "./types.secrets-BpVPfGSB.js";
import { i as withFileLock } from "./file-lock-Bkax43rt.js";
import "./file-lock-ypOQcNY5.js";
import { n as saveJsonFile, t as loadJsonFile } from "./json-file-TQeCs5hQ.js";
import { a as replaceRuntimeAuthProfileStoreSnapshots$1, d as resolveLegacyAuthStorePath, i as hasRuntimeAuthProfileStoreSnapshot, l as resolveAuthStorePath, n as clearRuntimeAuthProfileStoreSnapshots$1, o as setRuntimeAuthProfileStoreSnapshot, r as getRuntimeAuthProfileStoreSnapshot, s as resolveAuthStatePath } from "./source-check-DLSm69AH.js";
import { C as resolveExternalAuthProfilesWithPlugins } from "./provider-runtime-Bf8EdmFA.js";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
//#region src/agents/auth-profiles/constants.ts
const CLAUDE_CLI_PROFILE_ID = "anthropic:claude-cli";
const CODEX_CLI_PROFILE_ID = "openai-codex:codex-cli";
const OPENAI_CODEX_DEFAULT_PROFILE_ID = "openai-codex:default";
const MINIMAX_CLI_PROFILE_ID = "minimax-portal:minimax-cli";
const AUTH_STORE_LOCK_OPTIONS = {
	retries: {
		retries: 10,
		factor: 2,
		minTimeout: 100,
		maxTimeout: 1e4,
		randomize: true
	},
	stale: 3e4
};
const OAUTH_REFRESH_LOCK_OPTIONS = {
	retries: {
		retries: 10,
		factor: 2,
		minTimeout: 100,
		maxTimeout: 1e4,
		randomize: true
	},
	stale: 18e4
};
const OAUTH_REFRESH_CALL_TIMEOUT_MS = 12e4;
const EXTERNAL_CLI_SYNC_TTL_MS = 900 * 1e3;
const log$1 = createSubsystemLogger("agents/auth-profiles");
//#endregion
//#region src/agents/cli-credentials.ts
const log = createSubsystemLogger("agents/auth-profiles");
const CLAUDE_CLI_CREDENTIALS_RELATIVE_PATH = ".claude/.credentials.json";
const CODEX_CLI_AUTH_FILENAME = "auth.json";
const MINIMAX_CLI_CREDENTIALS_RELATIVE_PATH = ".minimax/oauth_creds.json";
const CLAUDE_CLI_KEYCHAIN_SERVICE = "Claude Code-credentials";
let claudeCliCache = null;
let codexCliCache = null;
let minimaxCliCache = null;
function resolveClaudeCliCredentialsPath(homeDir) {
	const baseDir = homeDir ?? resolveUserPath("~");
	return path.join(baseDir, CLAUDE_CLI_CREDENTIALS_RELATIVE_PATH);
}
function parseClaudeCliOauthCredential(claudeOauth) {
	if (!claudeOauth || typeof claudeOauth !== "object") return null;
	const accessToken = claudeOauth.accessToken;
	const refreshToken = claudeOauth.refreshToken;
	const expiresAt = claudeOauth.expiresAt;
	if (typeof accessToken !== "string" || !accessToken) return null;
	if (typeof expiresAt !== "number" || !Number.isFinite(expiresAt) || expiresAt <= 0) return null;
	if (typeof refreshToken === "string" && refreshToken) return {
		type: "oauth",
		provider: "anthropic",
		access: accessToken,
		refresh: refreshToken,
		expires: expiresAt
	};
	return {
		type: "token",
		provider: "anthropic",
		token: accessToken,
		expires: expiresAt
	};
}
function resolveCodexHomePath(codexHome) {
	const configured = codexHome ?? process.env.CODEX_HOME;
	const home = configured ? resolveUserPath(configured) : resolveUserPath("~/.codex");
	try {
		return fs.realpathSync.native(home);
	} catch {
		return home;
	}
}
function resolveMiniMaxCliCredentialsPath(homeDir) {
	const baseDir = homeDir ?? resolveUserPath("~");
	return path.join(baseDir, MINIMAX_CLI_CREDENTIALS_RELATIVE_PATH);
}
function readFileMtimeMs(filePath) {
	try {
		return fs.statSync(filePath).mtimeMs;
	} catch {
		return null;
	}
}
function readCachedCliCredential(options) {
	const { ttlMs, cache, cacheKey, read, setCache, readSourceFingerprint } = options;
	if (ttlMs <= 0) return read();
	const now = Date.now();
	const sourceFingerprint = readSourceFingerprint?.();
	if (cache && cache.cacheKey === cacheKey && cache.sourceFingerprint === sourceFingerprint && now - cache.readAt < ttlMs) return cache.value;
	const value = read();
	const cachedSourceFingerprint = readSourceFingerprint?.();
	if (!readSourceFingerprint || cachedSourceFingerprint === sourceFingerprint) setCache({
		value,
		readAt: now,
		cacheKey,
		sourceFingerprint: cachedSourceFingerprint
	});
	else setCache(null);
	return value;
}
function computeCodexKeychainAccount(codexHome) {
	return `cli|${createHash("sha256").update(codexHome).digest("hex").slice(0, 16)}`;
}
function resolveCodexKeychainParams(options) {
	return {
		platform: options?.platform ?? process.platform,
		execSyncImpl: options?.execSync ?? execSync,
		codexHome: resolveCodexHomePath(options?.codexHome)
	};
}
function decodeJwtExpiryMs(token) {
	const parts = token.split(".");
	if (parts.length < 2) return null;
	try {
		const payloadRaw = Buffer.from(parts[1], "base64url").toString("utf8");
		const payload = JSON.parse(payloadRaw);
		return typeof payload.exp === "number" && Number.isFinite(payload.exp) && payload.exp > 0 ? payload.exp * 1e3 : null;
	} catch {
		return null;
	}
}
function readCodexKeychainAuthRecord(options) {
	const { platform, execSyncImpl, codexHome } = resolveCodexKeychainParams(options);
	if (platform !== "darwin") return null;
	const account = computeCodexKeychainAccount(codexHome);
	try {
		const secret = execSyncImpl(`security find-generic-password -s "Codex Auth" -a "${account}" -w`, {
			encoding: "utf8",
			timeout: 5e3,
			stdio: [
				"pipe",
				"pipe",
				"pipe"
			]
		}).trim();
		return JSON.parse(secret);
	} catch {
		return null;
	}
}
function readCodexKeychainCredentials(options) {
	const parsed = readCodexKeychainAuthRecord(options);
	if (!parsed) return null;
	const tokens = parsed.tokens;
	try {
		const accessToken = tokens?.access_token;
		const refreshToken = tokens?.refresh_token;
		if (typeof accessToken !== "string" || !accessToken) return null;
		if (typeof refreshToken !== "string" || !refreshToken) return null;
		const lastRefreshRaw = parsed.last_refresh;
		const lastRefresh = typeof lastRefreshRaw === "string" || typeof lastRefreshRaw === "number" ? new Date(lastRefreshRaw).getTime() : Date.now();
		const fallbackExpiry = Number.isFinite(lastRefresh) ? lastRefresh + 3600 * 1e3 : Date.now() + 3600 * 1e3;
		const expires = decodeJwtExpiryMs(accessToken) ?? fallbackExpiry;
		const accountId = typeof tokens?.account_id === "string" ? tokens.account_id : void 0;
		log.info("read codex credentials from keychain", {
			source: "keychain",
			expires: new Date(expires).toISOString()
		});
		return {
			type: "oauth",
			provider: "openai-codex",
			access: accessToken,
			refresh: refreshToken,
			expires,
			accountId
		};
	} catch {
		return null;
	}
}
function readPortalCliOauthCredentials(credPath, provider) {
	const raw = loadJsonFile(credPath);
	if (!raw || typeof raw !== "object") return null;
	const data = raw;
	const accessToken = data.access_token;
	const refreshToken = data.refresh_token;
	const expiresAt = data.expiry_date;
	if (typeof accessToken !== "string" || !accessToken) return null;
	if (typeof refreshToken !== "string" || !refreshToken) return null;
	if (typeof expiresAt !== "number" || !Number.isFinite(expiresAt)) return null;
	return {
		type: "oauth",
		provider,
		access: accessToken,
		refresh: refreshToken,
		expires: expiresAt
	};
}
function readMiniMaxCliCredentials(options) {
	return readPortalCliOauthCredentials(resolveMiniMaxCliCredentialsPath(options?.homeDir), "minimax-portal");
}
function readClaudeCliKeychainCredentials(execSyncImpl = execSync) {
	try {
		const result = execSyncImpl(`security find-generic-password -s "${CLAUDE_CLI_KEYCHAIN_SERVICE}" -w`, {
			encoding: "utf8",
			timeout: 5e3,
			stdio: [
				"pipe",
				"pipe",
				"pipe"
			]
		});
		return parseClaudeCliOauthCredential(JSON.parse(result.trim())?.claudeAiOauth);
	} catch {
		return null;
	}
}
function readClaudeCliCredentials(options) {
	if ((options?.platform ?? process.platform) === "darwin" && options?.allowKeychainPrompt !== false) {
		const keychainCreds = readClaudeCliKeychainCredentials(options?.execSync);
		if (keychainCreds) {
			log.info("read anthropic credentials from claude cli keychain", { type: keychainCreds.type });
			return keychainCreds;
		}
	}
	const raw = loadJsonFile(resolveClaudeCliCredentialsPath(options?.homeDir));
	if (!raw || typeof raw !== "object") return null;
	return parseClaudeCliOauthCredential(raw.claudeAiOauth);
}
function readClaudeCliCredentialsCached(options) {
	return readCachedCliCredential({
		ttlMs: options?.ttlMs ?? 0,
		cache: claudeCliCache,
		cacheKey: resolveClaudeCliCredentialsPath(options?.homeDir),
		read: () => readClaudeCliCredentials({
			allowKeychainPrompt: options?.allowKeychainPrompt,
			platform: options?.platform,
			homeDir: options?.homeDir,
			execSync: options?.execSync
		}),
		setCache: (next) => {
			claudeCliCache = next;
		}
	});
}
function readCodexCliCredentials(options) {
	const keychain = readCodexKeychainCredentials({
		codexHome: options?.codexHome,
		platform: options?.platform,
		execSync: options?.execSync
	});
	if (keychain) return keychain;
	const authPath = path.join(resolveCodexHomePath(options?.codexHome), CODEX_CLI_AUTH_FILENAME);
	const raw = loadJsonFile(authPath);
	if (!raw || typeof raw !== "object") return null;
	const tokens = raw.tokens;
	if (!tokens || typeof tokens !== "object") return null;
	const accessToken = tokens.access_token;
	const refreshToken = tokens.refresh_token;
	if (typeof accessToken !== "string" || !accessToken) return null;
	if (typeof refreshToken !== "string" || !refreshToken) return null;
	let fallbackExpiry;
	try {
		fallbackExpiry = fs.statSync(authPath).mtimeMs + 3600 * 1e3;
	} catch {
		fallbackExpiry = Date.now() + 3600 * 1e3;
	}
	return {
		type: "oauth",
		provider: "openai-codex",
		access: accessToken,
		refresh: refreshToken,
		expires: decodeJwtExpiryMs(accessToken) ?? fallbackExpiry,
		accountId: typeof tokens.account_id === "string" ? tokens.account_id : void 0
	};
}
function readCodexCliCredentialsCached(options) {
	const authPath = path.join(resolveCodexHomePath(options?.codexHome), CODEX_CLI_AUTH_FILENAME);
	return readCachedCliCredential({
		ttlMs: options?.ttlMs ?? 0,
		cache: codexCliCache,
		cacheKey: `${options?.platform ?? process.platform}|${authPath}`,
		read: () => readCodexCliCredentials({
			codexHome: options?.codexHome,
			platform: options?.platform,
			execSync: options?.execSync
		}),
		setCache: (next) => {
			codexCliCache = next;
		},
		readSourceFingerprint: () => readFileMtimeMs(authPath)
	});
}
function readMiniMaxCliCredentialsCached(options) {
	const credPath = resolveMiniMaxCliCredentialsPath(options?.homeDir);
	return readCachedCliCredential({
		ttlMs: options?.ttlMs ?? 0,
		cache: minimaxCliCache,
		cacheKey: credPath,
		read: () => readMiniMaxCliCredentials({ homeDir: options?.homeDir }),
		setCache: (next) => {
			minimaxCliCache = next;
		},
		readSourceFingerprint: () => readFileMtimeMs(credPath)
	});
}
//#endregion
//#region src/agents/auth-profiles/credential-state.ts
function resolveTokenExpiryState(expires, now = Date.now()) {
	if (expires === void 0) return "missing";
	if (typeof expires !== "number") return "invalid_expires";
	if (!Number.isFinite(expires) || expires <= 0) return "invalid_expires";
	return now >= expires ? "expired" : "valid";
}
function hasConfiguredSecretRef(value) {
	return coerceSecretRef(value) !== null;
}
function hasConfiguredSecretString(value) {
	return normalizeSecretInputString(value) !== void 0;
}
function evaluateStoredCredentialEligibility(params) {
	const now = params.now ?? Date.now();
	const credential = params.credential;
	if (credential.type === "api_key") {
		const hasKey = hasConfiguredSecretString(credential.key);
		const hasKeyRef = hasConfiguredSecretRef(credential.keyRef);
		if (!hasKey && !hasKeyRef) return {
			eligible: false,
			reasonCode: "missing_credential"
		};
		return {
			eligible: true,
			reasonCode: "ok"
		};
	}
	if (credential.type === "token") {
		const hasToken = hasConfiguredSecretString(credential.token);
		const hasTokenRef = hasConfiguredSecretRef(credential.tokenRef);
		if (!hasToken && !hasTokenRef) return {
			eligible: false,
			reasonCode: "missing_credential"
		};
		const expiryState = resolveTokenExpiryState(credential.expires, now);
		if (expiryState === "invalid_expires") return {
			eligible: false,
			reasonCode: "invalid_expires"
		};
		if (expiryState === "expired") return {
			eligible: false,
			reasonCode: "expired"
		};
		return {
			eligible: true,
			reasonCode: "ok"
		};
	}
	if (normalizeSecretInputString(credential.access) === void 0 && normalizeSecretInputString(credential.refresh) === void 0) return {
		eligible: false,
		reasonCode: "missing_credential"
	};
	return {
		eligible: true,
		reasonCode: "ok"
	};
}
//#endregion
//#region src/agents/auth-profiles/external-cli-sync.ts
function areOAuthCredentialsEquivalent(a, b) {
	if (!a || a.type !== "oauth") return false;
	return a.provider === b.provider && a.access === b.access && a.refresh === b.refresh && a.expires === b.expires && a.email === b.email && a.enterpriseUrl === b.enterpriseUrl && a.projectId === b.projectId && a.accountId === b.accountId;
}
function hasNewerStoredOAuthCredential(existing, incoming) {
	return Boolean(existing && existing.provider === incoming.provider && Number.isFinite(existing.expires) && (!Number.isFinite(incoming.expires) || existing.expires > incoming.expires));
}
function shouldReplaceStoredOAuthCredential(existing, incoming) {
	if (!existing || existing.type !== "oauth") return true;
	if (areOAuthCredentialsEquivalent(existing, incoming)) return false;
	return !hasNewerStoredOAuthCredential(existing, incoming);
}
function hasUsableOAuthCredential(credential, now = Date.now()) {
	if (!credential || credential.type !== "oauth") return false;
	if (typeof credential.access !== "string" || credential.access.trim().length === 0) return false;
	return resolveTokenExpiryState(credential.expires, now) === "valid";
}
function shouldBootstrapFromExternalCliCredential(params) {
	const now = params.now ?? Date.now();
	if (hasUsableOAuthCredential(params.existing, now)) return false;
	return hasUsableOAuthCredential(params.imported, now);
}
const EXTERNAL_CLI_SYNC_PROVIDERS = [{
	profileId: MINIMAX_CLI_PROFILE_ID,
	provider: "minimax-portal",
	readCredentials: () => readMiniMaxCliCredentialsCached({ ttlMs: EXTERNAL_CLI_SYNC_TTL_MS })
}, {
	profileId: OPENAI_CODEX_DEFAULT_PROFILE_ID,
	provider: "openai-codex",
	readCredentials: () => readCodexCliCredentialsCached({ ttlMs: EXTERNAL_CLI_SYNC_TTL_MS })
}];
function resolveExternalCliSyncProvider(params) {
	const provider = EXTERNAL_CLI_SYNC_PROVIDERS.find((entry) => entry.profileId === params.profileId);
	if (!provider) return null;
	if (params.credential && provider.provider !== params.credential.provider) return null;
	return provider;
}
function readExternalCliBootstrapCredential(params) {
	const provider = resolveExternalCliSyncProvider(params);
	if (!provider) return null;
	return provider.readCredentials();
}
function resolveExternalCliAuthProfiles(store) {
	const profiles = [];
	const now = Date.now();
	for (const providerConfig of EXTERNAL_CLI_SYNC_PROVIDERS) {
		const creds = providerConfig.readCredentials();
		if (!creds) continue;
		const existing = store.profiles[providerConfig.profileId];
		const existingOAuth = existing?.type === "oauth" ? existing : void 0;
		if (!shouldBootstrapFromExternalCliCredential({
			existing: existingOAuth,
			imported: creds,
			now
		})) {
			if (existingOAuth) log$1.debug("kept usable local oauth over external cli bootstrap", {
				profileId: providerConfig.profileId,
				provider: providerConfig.provider,
				localExpires: existingOAuth.expires,
				externalExpires: creds.expires
			});
			continue;
		}
		log$1.debug("used external cli oauth bootstrap because local oauth was missing or unusable", {
			profileId: providerConfig.profileId,
			provider: providerConfig.provider,
			localExpires: existingOAuth?.expires,
			externalExpires: creds.expires
		});
		profiles.push({
			profileId: providerConfig.profileId,
			credential: creds
		});
	}
	return profiles;
}
//#endregion
//#region src/agents/auth-profiles/external-auth.ts
let resolveExternalAuthProfilesForRuntime;
function normalizeExternalAuthProfile(profile) {
	if (!profile?.profileId || !profile.credential) return null;
	return {
		...profile,
		persistence: profile.persistence ?? "runtime-only"
	};
}
function resolveExternalAuthProfileMap(params) {
	const env = params.env ?? process.env;
	const profiles = (resolveExternalAuthProfilesForRuntime ?? resolveExternalAuthProfilesWithPlugins)({
		env,
		context: {
			config: void 0,
			agentDir: params.agentDir,
			workspaceDir: void 0,
			env,
			store: params.store
		}
	});
	const resolved = /* @__PURE__ */ new Map();
	const cliProfiles = resolveExternalCliAuthProfiles?.(params.store) ?? [];
	for (const profile of cliProfiles) resolved.set(profile.profileId, {
		profileId: profile.profileId,
		credential: profile.credential,
		persistence: "runtime-only"
	});
	for (const rawProfile of profiles) {
		const profile = normalizeExternalAuthProfile(rawProfile);
		if (!profile) continue;
		resolved.set(profile.profileId, profile);
	}
	return resolved;
}
function oauthCredentialMatches(a, b) {
	return a.type === b.type && a.provider === b.provider && a.access === b.access && a.refresh === b.refresh && a.expires === b.expires && a.clientId === b.clientId && a.email === b.email && a.displayName === b.displayName && a.enterpriseUrl === b.enterpriseUrl && a.projectId === b.projectId && a.accountId === b.accountId;
}
function overlayExternalAuthProfiles(store, params) {
	const profiles = resolveExternalAuthProfileMap({
		store,
		agentDir: params?.agentDir,
		env: params?.env
	});
	if (profiles.size === 0) return store;
	const next = structuredClone(store);
	for (const [profileId, profile] of profiles) next.profiles[profileId] = profile.credential;
	return next;
}
function shouldPersistExternalAuthProfile(params) {
	const external = resolveExternalAuthProfileMap({
		store: params.store,
		agentDir: params.agentDir,
		env: params.env
	}).get(params.profileId);
	if (!external || external.persistence === "persisted") return true;
	return !oauthCredentialMatches(external.credential, params.credential);
}
//#endregion
//#region src/agents/auth-profiles/paths.ts
function ensureAuthStoreFile(pathname) {
	if (fs.existsSync(pathname)) return;
	saveJsonFile(pathname, {
		version: 1,
		profiles: {}
	});
}
//#endregion
//#region src/agents/auth-profiles/state.ts
function normalizeAuthProfileOrder(raw) {
	if (!raw || typeof raw !== "object") return;
	const normalized = Object.entries(raw).reduce((acc, [provider, value]) => {
		if (!Array.isArray(value)) return acc;
		const list = value.map((entry) => normalizeOptionalString(entry) ?? "").filter(Boolean);
		if (list.length > 0) acc[provider] = list;
		return acc;
	}, {});
	return Object.keys(normalized).length > 0 ? normalized : void 0;
}
function coerceAuthProfileState(raw) {
	if (!raw || typeof raw !== "object") return {};
	const record = raw;
	return {
		order: normalizeAuthProfileOrder(record.order),
		lastGood: record.lastGood && typeof record.lastGood === "object" ? record.lastGood : void 0,
		usageStats: record.usageStats && typeof record.usageStats === "object" ? record.usageStats : void 0
	};
}
function mergeAuthProfileState(base, override) {
	const mergeRecord = (left, right) => {
		if (!left && !right) return;
		if (!left) return { ...right };
		if (!right) return { ...left };
		return {
			...left,
			...right
		};
	};
	return {
		order: mergeRecord(base.order, override.order),
		lastGood: mergeRecord(base.lastGood, override.lastGood),
		usageStats: mergeRecord(base.usageStats, override.usageStats)
	};
}
function loadPersistedAuthProfileState(agentDir) {
	return coerceAuthProfileState(loadJsonFile(resolveAuthStatePath(agentDir)));
}
function buildPersistedAuthProfileState(store) {
	const state = coerceAuthProfileState(store);
	if (!state.order && !state.lastGood && !state.usageStats) return null;
	return {
		version: 1,
		...state.order ? { order: state.order } : {},
		...state.lastGood ? { lastGood: state.lastGood } : {},
		...state.usageStats ? { usageStats: state.usageStats } : {}
	};
}
function savePersistedAuthProfileState(store, agentDir) {
	const payload = buildPersistedAuthProfileState(store);
	const statePath = resolveAuthStatePath(agentDir);
	if (!payload) {
		try {
			fs.unlinkSync(statePath);
		} catch (error) {
			if (error?.code !== "ENOENT") throw error;
		}
		return null;
	}
	saveJsonFile(statePath, payload);
	return payload;
}
//#endregion
//#region src/agents/auth-profiles/persisted.ts
const AUTH_PROFILE_TYPES = new Set([
	"api_key",
	"oauth",
	"token"
]);
function normalizeSecretBackedField(params) {
	const value = params.entry[params.valueField];
	if (value == null || typeof value === "string") return;
	const ref = coerceSecretRef(value);
	if (ref && !coerceSecretRef(params.entry[params.refField])) params.entry[params.refField] = ref;
	delete params.entry[params.valueField];
}
function normalizeRawCredentialEntry(raw) {
	const entry = { ...raw };
	if (!("type" in entry) && typeof entry["mode"] === "string") entry["type"] = entry["mode"];
	if (!("key" in entry) && typeof entry["apiKey"] === "string") entry["key"] = entry["apiKey"];
	normalizeSecretBackedField({
		entry,
		valueField: "key",
		refField: "keyRef"
	});
	normalizeSecretBackedField({
		entry,
		valueField: "token",
		refField: "tokenRef"
	});
	return entry;
}
function parseCredentialEntry(raw, fallbackProvider) {
	if (!raw || typeof raw !== "object") return {
		ok: false,
		reason: "non_object"
	};
	const typed = normalizeRawCredentialEntry(raw);
	if (!AUTH_PROFILE_TYPES.has(typed.type)) return {
		ok: false,
		reason: "invalid_type"
	};
	const provider = typed.provider ?? fallbackProvider;
	if (typeof provider !== "string" || provider.trim().length === 0) return {
		ok: false,
		reason: "missing_provider"
	};
	return {
		ok: true,
		credential: {
			...typed,
			provider
		}
	};
}
function warnRejectedCredentialEntries(source, rejected) {
	if (rejected.length === 0) return;
	const reasons = rejected.reduce((acc, current) => {
		acc[current.reason] = (acc[current.reason] ?? 0) + 1;
		return acc;
	}, {});
	log$1.warn("ignored invalid auth profile entries during store load", {
		source,
		dropped: rejected.length,
		reasons,
		keys: rejected.slice(0, 10).map((entry) => entry.key)
	});
}
function coerceLegacyAuthStore(raw) {
	if (!raw || typeof raw !== "object") return null;
	const record = raw;
	if ("profiles" in record) return null;
	const entries = {};
	const rejected = [];
	for (const [key, value] of Object.entries(record)) {
		const parsed = parseCredentialEntry(value, key);
		if (!parsed.ok) {
			rejected.push({
				key,
				reason: parsed.reason
			});
			continue;
		}
		entries[key] = parsed.credential;
	}
	warnRejectedCredentialEntries("auth.json", rejected);
	return Object.keys(entries).length > 0 ? entries : null;
}
function coercePersistedAuthProfileStore(raw) {
	if (!raw || typeof raw !== "object") return null;
	const record = raw;
	if (!record.profiles || typeof record.profiles !== "object") return null;
	const profiles = record.profiles;
	const normalized = {};
	const rejected = [];
	for (const [key, value] of Object.entries(profiles)) {
		const parsed = parseCredentialEntry(value);
		if (!parsed.ok) {
			rejected.push({
				key,
				reason: parsed.reason
			});
			continue;
		}
		normalized[key] = parsed.credential;
	}
	warnRejectedCredentialEntries("auth-profiles.json", rejected);
	return {
		version: Number(record.version ?? 1),
		profiles: normalized,
		...coerceAuthProfileState(record)
	};
}
function mergeRecord(base, override) {
	if (!base && !override) return;
	if (!base) return { ...override };
	if (!override) return { ...base };
	return {
		...base,
		...override
	};
}
function mergeAuthProfileStores(base, override) {
	if (Object.keys(override.profiles).length === 0 && !override.order && !override.lastGood && !override.usageStats) return base;
	return {
		version: Math.max(base.version, override.version ?? base.version),
		profiles: {
			...base.profiles,
			...override.profiles
		},
		order: mergeRecord(base.order, override.order),
		lastGood: mergeRecord(base.lastGood, override.lastGood),
		usageStats: mergeRecord(base.usageStats, override.usageStats)
	};
}
function buildPersistedAuthProfileSecretsStore(store, shouldPersistProfile) {
	return {
		version: 1,
		profiles: Object.fromEntries(Object.entries(store.profiles).flatMap(([profileId, credential]) => {
			if (shouldPersistProfile && !shouldPersistProfile({
				profileId,
				credential
			})) return [];
			if (credential.type === "api_key" && credential.keyRef && credential.key !== void 0) {
				const sanitized = { ...credential };
				delete sanitized.key;
				return [[profileId, sanitized]];
			}
			if (credential.type === "token" && credential.tokenRef && credential.token !== void 0) {
				const sanitized = { ...credential };
				delete sanitized.token;
				return [[profileId, sanitized]];
			}
			return [[profileId, credential]];
		}))
	};
}
function applyLegacyAuthStore(store, legacy) {
	for (const [provider, cred] of Object.entries(legacy)) {
		const profileId = `${provider}:default`;
		const credentialProvider = cred.provider ?? provider;
		if (cred.type === "api_key") {
			store.profiles[profileId] = {
				type: "api_key",
				provider: credentialProvider,
				key: cred.key,
				...cred.email ? { email: cred.email } : {}
			};
			continue;
		}
		if (cred.type === "token") {
			store.profiles[profileId] = {
				type: "token",
				provider: credentialProvider,
				token: cred.token,
				...typeof cred.expires === "number" ? { expires: cred.expires } : {},
				...cred.email ? { email: cred.email } : {}
			};
			continue;
		}
		store.profiles[profileId] = {
			type: "oauth",
			provider: credentialProvider,
			access: cred.access,
			refresh: cred.refresh,
			expires: cred.expires,
			...cred.enterpriseUrl ? { enterpriseUrl: cred.enterpriseUrl } : {},
			...cred.projectId ? { projectId: cred.projectId } : {},
			...cred.accountId ? { accountId: cred.accountId } : {},
			...cred.email ? { email: cred.email } : {}
		};
	}
}
function mergeOAuthFileIntoStore(store) {
	const oauthRaw = loadJsonFile(resolveOAuthPath());
	if (!oauthRaw || typeof oauthRaw !== "object") return false;
	const oauthEntries = oauthRaw;
	let mutated = false;
	for (const [provider, creds] of Object.entries(oauthEntries)) {
		if (!creds || typeof creds !== "object") continue;
		const profileId = `${provider}:default`;
		if (store.profiles[profileId]) continue;
		store.profiles[profileId] = {
			type: "oauth",
			provider,
			...creds
		};
		mutated = true;
	}
	return mutated;
}
function loadPersistedAuthProfileStore(agentDir) {
	const raw = loadJsonFile(resolveAuthStorePath(agentDir));
	const store = coercePersistedAuthProfileStore(raw);
	if (!store) return null;
	return {
		...store,
		...mergeAuthProfileState(coerceAuthProfileState(raw), loadPersistedAuthProfileState(agentDir))
	};
}
function loadLegacyAuthProfileStore(agentDir) {
	return coerceLegacyAuthStore(loadJsonFile(resolveLegacyAuthStorePath(agentDir)));
}
//#endregion
//#region src/agents/auth-profiles/store.ts
const loadedAuthStoreCache = /* @__PURE__ */ new Map();
function cloneAuthProfileStore(store) {
	return structuredClone(store);
}
function resolveRuntimeAuthProfileStore(agentDir) {
	const mainKey = resolveAuthStorePath(void 0);
	const requestedKey = resolveAuthStorePath(agentDir);
	const mainStore = getRuntimeAuthProfileStoreSnapshot(void 0);
	const requestedStore = getRuntimeAuthProfileStoreSnapshot(agentDir);
	if (!agentDir || requestedKey === mainKey) {
		if (!mainStore) return null;
		return mainStore;
	}
	if (mainStore && requestedStore) return mergeAuthProfileStores(mainStore, requestedStore);
	if (requestedStore) return requestedStore;
	if (mainStore) return mainStore;
	return null;
}
function readAuthStoreMtimeMs(authPath) {
	try {
		return fs.statSync(authPath).mtimeMs;
	} catch {
		return null;
	}
}
function readCachedAuthProfileStore(params) {
	const cached = loadedAuthStoreCache.get(params.authPath);
	if (!cached || cached.authMtimeMs !== params.authMtimeMs || cached.stateMtimeMs !== params.stateMtimeMs) return null;
	if (Date.now() - cached.syncedAtMs >= 9e5) return null;
	return cloneAuthProfileStore(cached.store);
}
function writeCachedAuthProfileStore(params) {
	loadedAuthStoreCache.set(params.authPath, {
		authMtimeMs: params.authMtimeMs,
		stateMtimeMs: params.stateMtimeMs,
		syncedAtMs: Date.now(),
		store: cloneAuthProfileStore(params.store)
	});
}
async function updateAuthProfileStoreWithLock(params) {
	const authPath = resolveAuthStorePath(params.agentDir);
	ensureAuthStoreFile(authPath);
	try {
		return await withFileLock(authPath, AUTH_STORE_LOCK_OPTIONS, async () => {
			const store = loadAuthProfileStoreForAgent(params.agentDir);
			if (params.updater(store)) saveAuthProfileStore(store, params.agentDir);
			return store;
		});
	} catch {
		return null;
	}
}
function loadAuthProfileStore() {
	const asStore = loadPersistedAuthProfileStore();
	if (asStore) return overlayExternalAuthProfiles(asStore);
	const legacy = loadLegacyAuthProfileStore();
	if (legacy) {
		const store = {
			version: 1,
			profiles: {}
		};
		applyLegacyAuthStore(store, legacy);
		return overlayExternalAuthProfiles(store);
	}
	return overlayExternalAuthProfiles({
		version: 1,
		profiles: {}
	});
}
function loadAuthProfileStoreForAgent(agentDir, options) {
	const readOnly = options?.readOnly === true;
	const authPath = resolveAuthStorePath(agentDir);
	const statePath = resolveAuthStatePath(agentDir);
	const authMtimeMs = readAuthStoreMtimeMs(authPath);
	const stateMtimeMs = readAuthStoreMtimeMs(statePath);
	if (!readOnly) {
		const cached = readCachedAuthProfileStore({
			authPath,
			authMtimeMs,
			stateMtimeMs
		});
		if (cached) return cached;
	}
	const asStore = loadPersistedAuthProfileStore(agentDir);
	if (asStore) {
		if (!readOnly) writeCachedAuthProfileStore({
			authPath,
			authMtimeMs: readAuthStoreMtimeMs(authPath),
			stateMtimeMs: readAuthStoreMtimeMs(statePath),
			store: asStore
		});
		return asStore;
	}
	if (agentDir && !readOnly) {
		const mainStore = loadPersistedAuthProfileStore();
		if (mainStore && Object.keys(mainStore.profiles).length > 0) {
			saveJsonFile(authPath, buildPersistedAuthProfileSecretsStore(mainStore));
			log$1.info("inherited auth-profiles from main agent", { agentDir });
			const inherited = {
				version: mainStore.version,
				profiles: { ...mainStore.profiles }
			};
			writeCachedAuthProfileStore({
				authPath,
				authMtimeMs: readAuthStoreMtimeMs(authPath),
				stateMtimeMs: readAuthStoreMtimeMs(statePath),
				store: inherited
			});
			return inherited;
		}
	}
	const legacy = loadLegacyAuthProfileStore(agentDir);
	const store = {
		version: 1,
		profiles: {}
	};
	if (legacy) applyLegacyAuthStore(store, legacy);
	const mergedOAuth = mergeOAuthFileIntoStore(store);
	const forceReadOnly = process.env.ENCLAWED_AUTH_STORE_READONLY === "1";
	const shouldWrite = !readOnly && !forceReadOnly && (legacy !== null || mergedOAuth);
	if (shouldWrite) saveAuthProfileStore(store, agentDir);
	if (shouldWrite && legacy !== null) {
		const legacyPath = resolveLegacyAuthStorePath(agentDir);
		try {
			fs.unlinkSync(legacyPath);
		} catch (err) {
			if (err?.code !== "ENOENT") log$1.warn("failed to delete legacy auth.json after migration", {
				err,
				legacyPath
			});
		}
	}
	if (!readOnly) writeCachedAuthProfileStore({
		authPath,
		authMtimeMs: readAuthStoreMtimeMs(authPath),
		stateMtimeMs: readAuthStoreMtimeMs(statePath),
		store
	});
	return store;
}
function loadAuthProfileStoreForRuntime(agentDir, options) {
	const store = loadAuthProfileStoreForAgent(agentDir, options);
	const authPath = resolveAuthStorePath(agentDir);
	const mainAuthPath = resolveAuthStorePath();
	if (!agentDir || authPath === mainAuthPath) return overlayExternalAuthProfiles(store, { agentDir });
	return overlayExternalAuthProfiles(mergeAuthProfileStores(loadAuthProfileStoreForAgent(void 0, options), store), { agentDir });
}
function loadAuthProfileStoreForSecretsRuntime(agentDir) {
	return loadAuthProfileStoreForRuntime(agentDir, {
		readOnly: true,
		allowKeychainPrompt: false
	});
}
function ensureAuthProfileStore(agentDir, options) {
	const runtimeStore = resolveRuntimeAuthProfileStore(agentDir);
	if (runtimeStore) return overlayExternalAuthProfiles(runtimeStore, { agentDir });
	const store = loadAuthProfileStoreForAgent(agentDir, options);
	const authPath = resolveAuthStorePath(agentDir);
	const mainAuthPath = resolveAuthStorePath();
	if (!agentDir || authPath === mainAuthPath) return overlayExternalAuthProfiles(store, { agentDir });
	return overlayExternalAuthProfiles(mergeAuthProfileStores(loadAuthProfileStoreForAgent(void 0, options), store), { agentDir });
}
function ensureAuthProfileStoreForLocalUpdate(agentDir) {
	const store = loadAuthProfileStoreForAgent(agentDir, { syncExternalCli: false });
	const authPath = resolveAuthStorePath(agentDir);
	const mainAuthPath = resolveAuthStorePath();
	if (!agentDir || authPath === mainAuthPath) return store;
	return mergeAuthProfileStores(loadAuthProfileStoreForAgent(void 0, {
		readOnly: true,
		syncExternalCli: false
	}), store);
}
function replaceRuntimeAuthProfileStoreSnapshots(entries) {
	replaceRuntimeAuthProfileStoreSnapshots$1(entries);
}
function clearRuntimeAuthProfileStoreSnapshots() {
	clearRuntimeAuthProfileStoreSnapshots$1();
	loadedAuthStoreCache.clear();
}
function saveAuthProfileStore(store, agentDir, options) {
	const authPath = resolveAuthStorePath(agentDir);
	const statePath = resolveAuthStatePath(agentDir);
	saveJsonFile(authPath, buildPersistedAuthProfileSecretsStore(store, ({ profileId, credential }) => {
		if (credential.type !== "oauth") return true;
		if (options?.filterExternalAuthProfiles === false) return true;
		return shouldPersistExternalAuthProfile({
			store,
			profileId,
			credential,
			agentDir
		});
	}));
	savePersistedAuthProfileState(store, agentDir);
	const runtimeStore = cloneAuthProfileStore(store);
	writeCachedAuthProfileStore({
		authPath,
		authMtimeMs: readAuthStoreMtimeMs(authPath),
		stateMtimeMs: readAuthStoreMtimeMs(statePath),
		store: runtimeStore
	});
	if (hasRuntimeAuthProfileStoreSnapshot(agentDir)) setRuntimeAuthProfileStoreSnapshot(runtimeStore, agentDir);
}
/**
* Loads the auth profile store for an agent without overlaying external CLI
* profiles. Used by tests and migration paths that need the raw persisted view.
*/
function loadAuthProfileStoreWithoutExternalProfiles(agentDir) {
	const options = {
		readOnly: true,
		allowKeychainPrompt: false
	};
	const store = loadAuthProfileStoreForAgent(agentDir, options);
	const authPath = resolveAuthStorePath(agentDir);
	const mainAuthPath = resolveAuthStorePath();
	if (!agentDir || authPath === mainAuthPath) return store;
	return mergeAuthProfileStores(loadAuthProfileStoreForAgent(void 0, options), store);
}
/**
* If a profileId is persisted under the requested agent's auth store
* specifically (not the main store), returns that agentDir. Otherwise returns
* undefined. Used by callers that need to know which agent owns an OAuth
* profile before mutating it.
*/
function resolvePersistedAuthProfileOwnerAgentDir(params) {
	if (!params.agentDir) return;
	const requestedStore = loadPersistedAuthProfileStore(params.agentDir);
	if (resolveAuthStorePath(params.agentDir) === resolveAuthStorePath()) return;
	const mainStore = loadPersistedAuthProfileStore();
	if (requestedStore?.profiles[params.profileId]) return mainStore?.profiles[params.profileId] ? void 0 : params.agentDir;
	return mainStore?.profiles[params.profileId] ? void 0 : params.agentDir;
}
//#endregion
export { readCodexCliCredentialsCached as C, OAUTH_REFRESH_CALL_TIMEOUT_MS as D, CODEX_CLI_PROFILE_ID as E, OAUTH_REFRESH_LOCK_OPTIONS as O, readClaudeCliCredentialsCached as S, CLAUDE_CLI_PROFILE_ID as T, readExternalCliBootstrapCredential as _, loadAuthProfileStoreForRuntime as a, evaluateStoredCredentialEligibility as b, replaceRuntimeAuthProfileStoreSnapshots as c, updateAuthProfileStoreWithLock as d, coercePersistedAuthProfileStore as f, hasUsableOAuthCredential as g, areOAuthCredentialsEquivalent as h, loadAuthProfileStore as i, log$1 as k, resolvePersistedAuthProfileOwnerAgentDir as l, ensureAuthStoreFile as m, ensureAuthProfileStore as n, loadAuthProfileStoreForSecretsRuntime as o, loadPersistedAuthProfileStore as p, ensureAuthProfileStoreForLocalUpdate as r, loadAuthProfileStoreWithoutExternalProfiles as s, clearRuntimeAuthProfileStoreSnapshots as t, saveAuthProfileStore as u, shouldBootstrapFromExternalCliCredential as v, AUTH_STORE_LOCK_OPTIONS as w, resolveTokenExpiryState as x, shouldReplaceStoredOAuthCredential as y };
