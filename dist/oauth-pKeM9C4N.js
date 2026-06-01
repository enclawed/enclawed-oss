import { i as formatErrorMessage } from "./errors-D8p6rxH8.js";
import { i as normalizeLowercaseStringOrEmpty } from "./string-coerce-BUSzWgUA.js";
import { i as coerceSecretRef } from "./types.secrets-BpVPfGSB.js";
import { i as resolveSecretRefString } from "./resolve-DJj4APwl.js";
import { a as loadConfig } from "./io-b4s6ivfp.js";
import { r as normalizeProviderId, t as findNormalizedProviderKey } from "./provider-id-JqYiEozY.js";
import "./config-DDWYoiuw.js";
import { i as withFileLock } from "./file-lock-Bkax43rt.js";
import "./file-lock-ypOQcNY5.js";
import { f as resolveOAuthRefreshLockPath, l as resolveAuthStorePath } from "./source-check-DLSm69AH.js";
import { D as OAUTH_REFRESH_CALL_TIMEOUT_MS, O as OAUTH_REFRESH_LOCK_OPTIONS, _ as readExternalCliBootstrapCredential, d as updateAuthProfileStoreWithLock, g as hasUsableOAuthCredential, h as areOAuthCredentialsEquivalent, k as log, m as ensureAuthStoreFile, n as ensureAuthProfileStore, o as loadAuthProfileStoreForSecretsRuntime, u as saveAuthProfileStore, v as shouldBootstrapFromExternalCliCredential, w as AUTH_STORE_LOCK_OPTIONS, x as resolveTokenExpiryState, y as shouldReplaceStoredOAuthCredential } from "./store-CFRep4YQ.js";
import { i as formatProviderAuthProfileApiKeyWithPlugin, n as buildProviderAuthDoctorHintWithPlugin, o as refreshProviderOAuthCredentialWithPlugin } from "./provider-runtime.runtime-uBxehieU.js";
import { n as resolveAuthProfileMetadata } from "./identity-TZiybbH7.js";
import { a as refreshChutesTokens } from "./chutes-oauth-DvXfCPBI.js";
import { t as assertNoOAuthSecretRefPolicyViolations } from "./policy-BvJ_IHtd.js";
import { n as listProfilesForProvider, t as dedupeProfileIds } from "./profiles-BxmkyPvG.js";
import { getOAuthApiKey, getOAuthProviders } from "@mariozechner/pi-ai/oauth";
//#region src/agents/auth-profiles/doctor.ts
/**
* Migration hints for deprecated/removed OAuth providers.
* Users with stale credentials should be guided to migrate.
*/
const DEPRECATED_PROVIDER_MIGRATION_HINTS = { "qwen-portal": "Qwen OAuth via portal.qwen.ai has been deprecated. Please migrate to Qwen Cloud Coding Plan. Run: enclawed onboard --auth-choice qwen-api-key (or qwen-api-key-cn for the China endpoint). Legacy modelstudio auth-choice ids still work." };
async function formatAuthDoctorHint(params) {
	const normalizedProvider = normalizeProviderId(params.provider);
	const migrationHint = DEPRECATED_PROVIDER_MIGRATION_HINTS[normalizedProvider];
	if (migrationHint) return migrationHint;
	const pluginHint = await buildProviderAuthDoctorHintWithPlugin({
		provider: normalizedProvider,
		context: {
			config: params.cfg,
			store: params.store,
			provider: normalizedProvider,
			profileId: params.profileId
		}
	});
	if (typeof pluginHint === "string" && pluginHint.trim()) return pluginHint;
	return "";
}
//#endregion
//#region src/agents/auth-profiles/effective-oauth.ts
function resolveEffectiveOAuthCredential(params) {
	const imported = readExternalCliBootstrapCredential({
		profileId: params.profileId,
		credential: params.credential
	});
	if (!imported) return params.credential;
	if (hasUsableOAuthCredential(params.credential)) {
		log.debug("resolved oauth credential from canonical local store", {
			profileId: params.profileId,
			provider: params.credential.provider,
			localExpires: params.credential.expires,
			externalExpires: imported.expires
		});
		return params.credential;
	}
	if (shouldBootstrapFromExternalCliCredential({
		existing: params.credential,
		imported
	})) {
		log.debug("resolved oauth credential from external cli bootstrap", {
			profileId: params.profileId,
			provider: imported.provider,
			localExpires: params.credential.expires,
			externalExpires: imported.expires
		});
		return imported;
	}
	return params.credential;
}
//#endregion
//#region src/agents/auth-profiles/repair.ts
function getProfileSuffix(profileId) {
	const idx = profileId.indexOf(":");
	if (idx < 0) return "";
	return profileId.slice(idx + 1);
}
function isEmailLike(value) {
	const trimmed = value.trim();
	if (!trimmed) return false;
	return trimmed.includes("@") && trimmed.includes(".");
}
function suggestOAuthProfileIdForLegacyDefault(params) {
	const providerKey = normalizeProviderId(params.provider);
	if (getProfileSuffix(params.legacyProfileId) !== "default") return null;
	const legacyCfg = params.cfg?.auth?.profiles?.[params.legacyProfileId];
	if (legacyCfg && normalizeProviderId(legacyCfg.provider) === providerKey && legacyCfg.mode !== "oauth") return null;
	const oauthProfiles = listProfilesForProvider(params.store, providerKey).filter((id) => params.store.profiles[id]?.type === "oauth");
	if (oauthProfiles.length === 0) return null;
	const configuredEmail = legacyCfg?.email?.trim();
	if (configuredEmail) {
		const byEmail = oauthProfiles.find((id) => {
			return resolveAuthProfileMetadata({
				cfg: params.cfg,
				store: params.store,
				profileId: id
			}).email === configuredEmail || id === `${providerKey}:${configuredEmail}`;
		});
		if (byEmail) return byEmail;
	}
	const lastGood = params.store.lastGood?.[providerKey] ?? params.store.lastGood?.[params.provider];
	if (lastGood && oauthProfiles.includes(lastGood)) return lastGood;
	const nonLegacy = oauthProfiles.filter((id) => id !== params.legacyProfileId);
	if (nonLegacy.length === 1) return nonLegacy[0] ?? null;
	const emailLike = nonLegacy.filter((id) => isEmailLike(getProfileSuffix(id)));
	if (emailLike.length === 1) return emailLike[0] ?? null;
	return null;
}
function repairOAuthProfileIdMismatch(params) {
	const legacyProfileId = params.legacyProfileId ?? `${normalizeProviderId(params.provider)}:default`;
	const legacyCfg = params.cfg.auth?.profiles?.[legacyProfileId];
	if (!legacyCfg) return {
		config: params.cfg,
		changes: [],
		migrated: false
	};
	if (legacyCfg.mode !== "oauth") return {
		config: params.cfg,
		changes: [],
		migrated: false
	};
	if (normalizeProviderId(legacyCfg.provider) !== normalizeProviderId(params.provider)) return {
		config: params.cfg,
		changes: [],
		migrated: false
	};
	const toProfileId = suggestOAuthProfileIdForLegacyDefault({
		cfg: params.cfg,
		store: params.store,
		provider: params.provider,
		legacyProfileId
	});
	if (!toProfileId || toProfileId === legacyProfileId) return {
		config: params.cfg,
		changes: [],
		migrated: false
	};
	const { email: toEmail, displayName: toDisplayName } = resolveAuthProfileMetadata({
		store: params.store,
		profileId: toProfileId
	});
	const { email: _legacyEmail, displayName: _legacyDisplayName, ...legacyCfgRest } = legacyCfg;
	const nextProfiles = { ...params.cfg.auth?.profiles };
	delete nextProfiles[legacyProfileId];
	nextProfiles[toProfileId] = {
		...legacyCfgRest,
		...toDisplayName ? { displayName: toDisplayName } : {},
		...toEmail ? { email: toEmail } : {}
	};
	const providerKey = normalizeProviderId(params.provider);
	const nextOrder = (() => {
		const order = params.cfg.auth?.order;
		if (!order) return;
		const resolvedKey = findNormalizedProviderKey(order, providerKey);
		if (!resolvedKey) return order;
		const existing = order[resolvedKey];
		if (!Array.isArray(existing)) return order;
		const deduped = dedupeProfileIds(existing.map((id) => id === legacyProfileId ? toProfileId : id).filter((id) => typeof id === "string" && id.trim().length > 0));
		return {
			...order,
			[resolvedKey]: deduped
		};
	})();
	return {
		config: {
			...params.cfg,
			auth: {
				...params.cfg.auth,
				profiles: nextProfiles,
				...nextOrder ? { order: nextOrder } : {}
			}
		},
		changes: [`Auth: migrate ${legacyProfileId} → ${toProfileId} (OAuth profile id)`],
		migrated: true,
		fromProfileId: legacyProfileId,
		toProfileId
	};
}
//#endregion
//#region src/agents/auth-profiles/oauth.ts
function listOAuthProviderIds() {
	if (typeof getOAuthProviders !== "function") return [];
	const providers = getOAuthProviders();
	if (!Array.isArray(providers)) return [];
	return providers.map((provider) => provider && typeof provider === "object" && "id" in provider && typeof provider.id === "string" ? provider.id : void 0).filter((providerId) => typeof providerId === "string");
}
const OAUTH_PROVIDER_IDS = new Set(listOAuthProviderIds());
const isOAuthProvider = (provider) => OAUTH_PROVIDER_IDS.has(provider);
const resolveOAuthProvider = (provider) => isOAuthProvider(provider) ? provider : null;
/** Bearer-token auth modes that are interchangeable (oauth tokens and raw tokens). */
const BEARER_AUTH_MODES = new Set(["oauth", "token"]);
const isCompatibleModeType = (mode, type) => {
	if (!mode || !type) return false;
	if (mode === type) return true;
	return BEARER_AUTH_MODES.has(mode) && BEARER_AUTH_MODES.has(type);
};
function isProfileConfigCompatible(params) {
	const profileConfig = params.cfg?.auth?.profiles?.[params.profileId];
	if (profileConfig && profileConfig.provider !== params.provider) return false;
	if (profileConfig && !isCompatibleModeType(profileConfig.mode, params.mode)) return false;
	return true;
}
async function buildOAuthApiKey(provider, credentials) {
	const formatted = await formatProviderAuthProfileApiKeyWithPlugin({
		provider,
		context: credentials
	});
	return typeof formatted === "string" && formatted.length > 0 ? formatted : credentials.access;
}
function buildApiKeyProfileResult(params) {
	return {
		apiKey: params.apiKey,
		provider: params.provider,
		email: params.email
	};
}
async function buildOAuthProfileResult(params) {
	return buildApiKeyProfileResult({
		apiKey: await buildOAuthApiKey(params.provider, params.credentials),
		provider: params.provider,
		email: params.email
	});
}
function extractErrorMessage(error) {
	return formatErrorMessage(error);
}
function isRefreshTokenReusedError(error) {
	const message = normalizeLowercaseStringOrEmpty(extractErrorMessage(error));
	return message.includes("refresh_token_reused") || message.includes("refresh token has already been used") || message.includes("already been used to generate a new access token");
}
function hasOAuthCredentialChanged(previous, current) {
	return previous.access !== current.access || previous.refresh !== current.refresh || previous.expires !== current.expires;
}
async function loadFreshStoredOAuthCredential(params) {
	const reloaded = loadAuthProfileStoreForSecretsRuntime(params.agentDir).profiles[params.profileId];
	if (reloaded?.type !== "oauth" || reloaded.provider !== params.provider || !hasUsableOAuthCredential(reloaded)) return null;
	if (params.requireChange && params.previous && !hasOAuthCredentialChanged(params.previous, reloaded)) return null;
	return reloaded;
}
function adoptNewerMainOAuthCredential(params) {
	if (!params.agentDir) return null;
	try {
		const mainCred = ensureAuthProfileStore(void 0).profiles[params.profileId];
		if (mainCred?.type === "oauth" && mainCred.provider === params.cred.provider && Number.isFinite(mainCred.expires) && (!Number.isFinite(params.cred.expires) || mainCred.expires > params.cred.expires) && isSafeToCopyOAuthIdentity(params.cred, mainCred)) {
			params.store.profiles[params.profileId] = { ...mainCred };
			saveAuthProfileStore(params.store, params.agentDir);
			log.info("adopted newer OAuth credentials from main agent", {
				profileId: params.profileId,
				agentDir: params.agentDir,
				expires: new Date(mainCred.expires).toISOString()
			});
			return mainCred;
		}
	} catch (err) {
		log.debug("adoptNewerMainOAuthCredential failed", {
			profileId: params.profileId,
			error: formatErrorMessage(err)
		});
	}
	return null;
}
const refreshQueues = /* @__PURE__ */ new Map();
function refreshQueueKey(provider, profileId) {
	return `${provider}\u0000${profileId}`;
}
/**
* Wrap an async call with a deadline after which the caller sees a
* timeout rejection and releases its locks. Used on the OAuth refresh
* critical section so the in-flight lock cannot outlive
* OAUTH_REFRESH_LOCK_OPTIONS.stale.
*
* LIMITATION: this does NOT cancel the underlying work. JavaScript
* promises are not cancellable and the pi-ai OAuth stack does not
* currently accept an AbortSignal. When the deadline fires the caller
* moves on and releases its file lock, but the original `fn()` promise
* keeps running in the background. That means a slow upstream refresh
* could still burn a refresh token well after we have given up on it,
* and a waiting peer that has now taken the lock may hit
* `refresh_token_reused`.
*
* The existing `isRefreshTokenReusedError` recovery path is the backstop
* for that residual case — it reloads from the main store and adopts if
* another agent's refresh has since landed. A fuller fix requires
* plumbing `AbortSignal` through the refresh stack into the HTTP
* client; tracked as a follow-up.
*/
async function withRefreshCallTimeout(label, timeoutMs, fn) {
	let timeoutHandle;
	try {
		return await new Promise((resolve, reject) => {
			timeoutHandle = setTimeout(() => {
				reject(/* @__PURE__ */ new Error(`OAuth refresh call "${label}" exceeded hard timeout (${timeoutMs}ms)`));
			}, timeoutMs);
			fn().then(resolve, reject);
		});
	} finally {
		if (timeoutHandle) clearTimeout(timeoutHandle);
	}
}
async function refreshOAuthTokenWithLock(params) {
	const key = refreshQueueKey(params.provider, params.profileId);
	const prev = refreshQueues.get(key) ?? Promise.resolve();
	let release;
	const gate = new Promise((r) => {
		release = r;
	});
	refreshQueues.set(key, gate);
	try {
		await prev;
		return await doRefreshOAuthTokenWithLock(params);
	} finally {
		release();
		if (refreshQueues.get(key) === gate) refreshQueues.delete(key);
	}
}
/**
* Mirror a refreshed OAuth credential back into the main-agent store so peer
* agents adopt it on their next `adoptNewerMainOAuthCredential` pass instead
* of racing to refresh the (now-single-used) refresh token.
*
* Identity binding (CWE-284): we require positive evidence the existing main
* credential and the refreshed credential belong to the same account before
* overwriting. If both sides expose `accountId` (strongest signal, Codex CLI)
* they must match; otherwise if both expose `email` they must match (case-
* insensitive, trimmed). Provider-only matches are not sufficient because
* nothing guarantees two agents with the same profileId are authenticated as
* the same user. This prevents a compromised sub-agent from poisoning the
* main store's credentials.
*
* Serialization: uses `updateAuthProfileStoreWithLock` so the read-modify-
* write takes the main-store lock and cannot race with other main-store
* writers (e.g. `updateAuthProfileStoreWithLock` in other flows, CLI-sync).
*
* Intentionally best-effort: a failure here must not fail the caller's
* refresh, since the credential has already been persisted to the agent's
* own store and returned to the requester.
*/
function normalizeAuthIdentityToken(value) {
	const trimmed = value?.trim();
	return trimmed ? trimmed : void 0;
}
function normalizeAuthEmailToken(value) {
	return normalizeAuthIdentityToken(value)?.toLowerCase();
}
/**
* Identity gate used for both directions of credential copy:
*   - mirror (sub-agent refresh -> main agent store)
*   - adopt (main agent store -> sub-agent store)
*
* Rule: allow the copy iff
*   1. no positive identity mismatch — if both sides expose the same
*      identity field (accountId or email), the values must match, AND
*   2. the incoming credential carries at least as much identity
*      evidence as the existing one — if existing has accountId/email,
*      incoming must carry the same field, AND
*   3. when both sides carry identity but in non-overlapping fields
*      (existing has only accountId, incoming has only email, or vice
*      versa) we cannot positively prove the same account and the copy
*      is refused.
*
* Accepts:
*   - matching accountId (positive match on strongest field)
*   - matching email when accountId is absent on both sides
*   - neither side carries identity (no evidence of mismatch)
*   - existing has no identity, incoming has identity (UPGRADE: adds
*     the marker without dropping anything)
*
* Refuses:
*   - mismatching accountId or email on a shared field (CWE-284 core)
*   - incoming drops an identity field present on existing (regression
*     that would later let a wrong-account peer pass this gate)
*   - non-overlapping fields (no comparable positive match)
*
* Design note: this is a single unified rule for both copy directions.
* The rule is deliberately one-sided because "existing" is whatever is
* about to be overwritten and "incoming" is the new data — the
* constraint is the same regardless of whether existing is main or sub.
*/
function isSafeToCopyOAuthIdentity(existing, incoming) {
	const aAcct = normalizeAuthIdentityToken(existing.accountId);
	const bAcct = normalizeAuthIdentityToken(incoming.accountId);
	const aEmail = normalizeAuthEmailToken(existing.email);
	const bEmail = normalizeAuthEmailToken(incoming.email);
	if (aAcct !== void 0 && bAcct !== void 0) return aAcct === bAcct;
	if (aEmail !== void 0 && bEmail !== void 0) return aEmail === bEmail;
	if (aAcct !== void 0 || aEmail !== void 0) return false;
	return true;
}
async function mirrorRefreshedCredentialIntoMainStore(params) {
	try {
		ensureAuthStoreFile(resolveAuthStorePath(void 0));
		await updateAuthProfileStoreWithLock({
			agentDir: void 0,
			updater: (store) => {
				const existing = store.profiles[params.profileId];
				if (existing && existing.type !== "oauth") return false;
				if (existing && existing.provider !== params.refreshed.provider) return false;
				if (existing && !isSafeToCopyOAuthIdentity(existing, params.refreshed)) {
					log.warn("refused to mirror OAuth credential: identity mismatch or regression", { profileId: params.profileId });
					return false;
				}
				if (existing && Number.isFinite(existing.expires) && Number.isFinite(params.refreshed.expires) && existing.expires >= params.refreshed.expires) return false;
				store.profiles[params.profileId] = { ...params.refreshed };
				log.debug("mirrored refreshed OAuth credential to main agent store", {
					profileId: params.profileId,
					expires: Number.isFinite(params.refreshed.expires) ? new Date(params.refreshed.expires).toISOString() : void 0
				});
				return true;
			}
		});
	} catch (err) {
		log.debug("mirrorRefreshedCredentialIntoMainStore failed", {
			profileId: params.profileId,
			error: formatErrorMessage(err)
		});
	}
}
async function doRefreshOAuthTokenWithLock(params) {
	const authPath = resolveAuthStorePath(params.agentDir);
	ensureAuthStoreFile(authPath);
	return await withFileLock(resolveOAuthRefreshLockPath(params.provider, params.profileId), OAUTH_REFRESH_LOCK_OPTIONS, async () => withFileLock(authPath, AUTH_STORE_LOCK_OPTIONS, async () => {
		const store = loadAuthProfileStoreForSecretsRuntime(params.agentDir);
		const cred = store.profiles[params.profileId];
		if (!cred || cred.type !== "oauth") return null;
		if (hasUsableOAuthCredential(cred)) return {
			apiKey: await buildOAuthApiKey(cred.provider, cred),
			newCredentials: cred
		};
		if (params.agentDir) try {
			const mainCred = loadAuthProfileStoreForSecretsRuntime(void 0).profiles[params.profileId];
			if (mainCred?.type === "oauth" && mainCred.provider === cred.provider && hasUsableOAuthCredential(mainCred) && isSafeToCopyOAuthIdentity(cred, mainCred)) {
				store.profiles[params.profileId] = { ...mainCred };
				saveAuthProfileStore(store, params.agentDir);
				log.info("adopted fresh OAuth credential from main store (under refresh lock)", {
					profileId: params.profileId,
					agentDir: params.agentDir,
					expires: new Date(mainCred.expires).toISOString()
				});
				return {
					apiKey: await buildOAuthApiKey(mainCred.provider, mainCred),
					newCredentials: mainCred
				};
			} else if (mainCred?.type === "oauth" && mainCred.provider === cred.provider && hasUsableOAuthCredential(mainCred) && !isSafeToCopyOAuthIdentity(cred, mainCred)) log.warn("refused to adopt fresh main-store OAuth credential: identity mismatch", {
				profileId: params.profileId,
				agentDir: params.agentDir
			});
		} catch (err) {
			log.debug("inside-lock main-store adoption failed; proceeding to refresh", {
				profileId: params.profileId,
				error: formatErrorMessage(err)
			});
		}
		const externallyManaged = readExternalCliBootstrapCredential({
			profileId: params.profileId,
			credential: cred
		});
		if (externallyManaged) {
			if (shouldReplaceStoredOAuthCredential(cred, externallyManaged) && !areOAuthCredentialsEquivalent(cred, externallyManaged)) {
				store.profiles[params.profileId] = externallyManaged;
				saveAuthProfileStore(store, params.agentDir);
			}
			if (hasUsableOAuthCredential(externallyManaged)) return {
				apiKey: await buildOAuthApiKey(externallyManaged.provider, externallyManaged),
				newCredentials: externallyManaged
			};
		}
		const pluginRefreshed = await withRefreshCallTimeout(`refreshProviderOAuthCredentialWithPlugin(${cred.provider})`, OAUTH_REFRESH_CALL_TIMEOUT_MS, () => refreshProviderOAuthCredentialWithPlugin({
			provider: cred.provider,
			context: cred
		}));
		if (pluginRefreshed) {
			const refreshedCredentials = {
				...cred,
				...pluginRefreshed,
				type: "oauth"
			};
			store.profiles[params.profileId] = refreshedCredentials;
			saveAuthProfileStore(store, params.agentDir);
			if (params.agentDir) {
				if (resolveAuthStorePath(void 0) !== authPath) await mirrorRefreshedCredentialIntoMainStore({
					profileId: params.profileId,
					refreshed: refreshedCredentials
				});
			}
			return {
				apiKey: await buildOAuthApiKey(cred.provider, refreshedCredentials),
				newCredentials: refreshedCredentials
			};
		}
		const oauthCreds = { [cred.provider]: cred };
		const result = cred.provider === "chutes" ? await (async () => {
			const newCredentials = await withRefreshCallTimeout(`refreshChutesTokens(${cred.provider})`, OAUTH_REFRESH_CALL_TIMEOUT_MS, () => refreshChutesTokens({ credential: cred }));
			return {
				apiKey: newCredentials.access,
				newCredentials
			};
		})() : await (async () => {
			const oauthProvider = resolveOAuthProvider(cred.provider);
			if (!oauthProvider) return null;
			if (typeof getOAuthApiKey !== "function") return null;
			return await withRefreshCallTimeout(`getOAuthApiKey(${oauthProvider})`, OAUTH_REFRESH_CALL_TIMEOUT_MS, () => getOAuthApiKey(oauthProvider, oauthCreds));
		})();
		if (!result) return null;
		const mergedCred = {
			...cred,
			...result.newCredentials,
			type: "oauth"
		};
		store.profiles[params.profileId] = mergedCred;
		saveAuthProfileStore(store, params.agentDir);
		if (params.agentDir) {
			if (resolveAuthStorePath(void 0) !== authPath) await mirrorRefreshedCredentialIntoMainStore({
				profileId: params.profileId,
				refreshed: mergedCred
			});
		}
		return result;
	}));
}
async function tryResolveOAuthProfile(params) {
	const { cfg, store, profileId } = params;
	const cred = store.profiles[profileId];
	if (!cred || cred.type !== "oauth") return null;
	if (!isProfileConfigCompatible({
		cfg,
		profileId,
		provider: cred.provider,
		mode: cred.type
	})) return null;
	const effectiveCred = resolveEffectiveOAuthCredential({
		profileId,
		credential: cred
	});
	if (hasUsableOAuthCredential(effectiveCred)) return await buildOAuthProfileResult({
		provider: effectiveCred.provider,
		credentials: effectiveCred,
		email: effectiveCred.email ?? cred.email
	});
	const refreshed = await refreshOAuthTokenWithLock({
		profileId,
		provider: cred.provider,
		agentDir: params.agentDir
	});
	if (!refreshed) return null;
	return buildApiKeyProfileResult({
		apiKey: refreshed.apiKey,
		provider: cred.provider,
		email: cred.email
	});
}
async function resolveProfileSecretString(params) {
	let resolvedValue = params.value?.trim();
	if (resolvedValue) {
		const inlineRef = coerceSecretRef(resolvedValue, params.refDefaults);
		if (inlineRef) try {
			resolvedValue = await resolveSecretRefString(inlineRef, {
				config: params.configForRefResolution,
				env: process.env,
				cache: params.cache
			});
		} catch (err) {
			log.debug(params.inlineFailureMessage, {
				profileId: params.profileId,
				provider: params.provider,
				error: formatErrorMessage(err)
			});
		}
	}
	const explicitRef = coerceSecretRef(params.valueRef, params.refDefaults);
	if (!resolvedValue && explicitRef) try {
		resolvedValue = await resolveSecretRefString(explicitRef, {
			config: params.configForRefResolution,
			env: process.env,
			cache: params.cache
		});
	} catch (err) {
		log.debug(params.refFailureMessage, {
			profileId: params.profileId,
			provider: params.provider,
			error: formatErrorMessage(err)
		});
	}
	return resolvedValue;
}
async function resolveApiKeyForProfile(params) {
	const { cfg, store, profileId } = params;
	const cred = store.profiles[profileId];
	if (!cred) return null;
	if (!isProfileConfigCompatible({
		cfg,
		profileId,
		provider: cred.provider,
		mode: cred.type,
		allowOAuthTokenCompatibility: true
	})) return null;
	const refResolveCache = {};
	const configForRefResolution = cfg ?? loadConfig();
	const refDefaults = configForRefResolution.secrets?.defaults;
	assertNoOAuthSecretRefPolicyViolations({
		store,
		cfg: configForRefResolution,
		profileIds: [profileId],
		context: `auth profile ${profileId}`
	});
	if (cred.type === "api_key") {
		const key = await resolveProfileSecretString({
			profileId,
			provider: cred.provider,
			value: cred.key,
			valueRef: cred.keyRef,
			refDefaults,
			configForRefResolution,
			cache: refResolveCache,
			inlineFailureMessage: "failed to resolve inline auth profile api_key ref",
			refFailureMessage: "failed to resolve auth profile api_key ref"
		});
		if (!key) return null;
		return buildApiKeyProfileResult({
			apiKey: key,
			provider: cred.provider,
			email: cred.email
		});
	}
	if (cred.type === "token") {
		const expiryState = resolveTokenExpiryState(cred.expires);
		if (expiryState === "expired" || expiryState === "invalid_expires") return null;
		const token = await resolveProfileSecretString({
			profileId,
			provider: cred.provider,
			value: cred.token,
			valueRef: cred.tokenRef,
			refDefaults,
			configForRefResolution,
			cache: refResolveCache,
			inlineFailureMessage: "failed to resolve inline auth profile token ref",
			refFailureMessage: "failed to resolve auth profile token ref"
		});
		if (!token) return null;
		return buildApiKeyProfileResult({
			apiKey: token,
			provider: cred.provider,
			email: cred.email
		});
	}
	const effectiveOAuthCred = resolveEffectiveOAuthCredential({
		profileId,
		credential: adoptNewerMainOAuthCredential({
			store,
			profileId,
			agentDir: params.agentDir,
			cred
		}) ?? cred
	});
	if (hasUsableOAuthCredential(effectiveOAuthCred)) return await buildOAuthProfileResult({
		provider: effectiveOAuthCred.provider,
		credentials: effectiveOAuthCred,
		email: effectiveOAuthCred.email
	});
	try {
		const result = await refreshOAuthTokenWithLock({
			profileId,
			provider: cred.provider,
			agentDir: params.agentDir
		});
		if (!result) return null;
		return buildApiKeyProfileResult({
			apiKey: result.apiKey,
			provider: cred.provider,
			email: cred.email
		});
	} catch (error) {
		const refreshedStore = loadAuthProfileStoreForSecretsRuntime(params.agentDir);
		const refreshed = refreshedStore.profiles[profileId];
		if (refreshed?.type === "oauth" && hasUsableOAuthCredential(refreshed)) return await buildOAuthProfileResult({
			provider: refreshed.provider,
			credentials: refreshed,
			email: refreshed.email ?? cred.email
		});
		if (isRefreshTokenReusedError(error) && refreshed?.type === "oauth" && refreshed.provider === cred.provider && hasOAuthCredentialChanged(cred, refreshed)) {
			const recovered = await loadFreshStoredOAuthCredential({
				profileId,
				agentDir: params.agentDir,
				provider: cred.provider,
				previous: cred,
				requireChange: true
			});
			if (recovered) return await buildOAuthProfileResult({
				provider: recovered.provider,
				credentials: recovered,
				email: recovered.email ?? cred.email
			});
			const retried = await refreshOAuthTokenWithLock({
				profileId,
				provider: cred.provider,
				agentDir: params.agentDir
			});
			if (retried) return buildApiKeyProfileResult({
				apiKey: retried.apiKey,
				provider: cred.provider,
				email: cred.email
			});
		}
		const fallbackProfileId = suggestOAuthProfileIdForLegacyDefault({
			cfg,
			store: refreshedStore,
			provider: cred.provider,
			legacyProfileId: profileId
		});
		if (fallbackProfileId && fallbackProfileId !== profileId) try {
			const fallbackResolved = await tryResolveOAuthProfile({
				cfg,
				store: refreshedStore,
				profileId: fallbackProfileId,
				agentDir: params.agentDir
			});
			if (fallbackResolved) return fallbackResolved;
		} catch {}
		if (params.agentDir) try {
			const mainCred = ensureAuthProfileStore(void 0).profiles[profileId];
			if (mainCred?.type === "oauth" && mainCred.provider === cred.provider && hasUsableOAuthCredential(mainCred) && isSafeToCopyOAuthIdentity(cred, mainCred)) {
				refreshedStore.profiles[profileId] = { ...mainCred };
				saveAuthProfileStore(refreshedStore, params.agentDir);
				log.info("inherited fresh OAuth credentials from main agent", {
					profileId,
					agentDir: params.agentDir,
					expires: new Date(mainCred.expires).toISOString()
				});
				return await buildOAuthProfileResult({
					provider: mainCred.provider,
					credentials: mainCred,
					email: mainCred.email
				});
			}
		} catch {}
		const message = extractErrorMessage(error);
		const hint = await formatAuthDoctorHint({
			cfg,
			store: refreshedStore,
			provider: cred.provider,
			profileId
		});
		throw new Error(`OAuth token refresh failed for ${cred.provider}: ${message}. Please try again or re-authenticate.` + (hint ? `\n\n${hint}` : ""), { cause: error });
	}
}
//#endregion
export { formatAuthDoctorHint as a, resolveEffectiveOAuthCredential as i, repairOAuthProfileIdMismatch as n, suggestOAuthProfileIdForLegacyDefault as r, resolveApiKeyForProfile as t };
