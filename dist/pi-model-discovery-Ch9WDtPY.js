import { s as normalizeOptionalString } from "./string-coerce-BUSzWgUA.js";
import { l as isRecord } from "./utils-BcQ7uNrT.js";
import { r as normalizeProviderId } from "./provider-id-BHVsNbpE.js";
import { r as getPluginRegistryState } from "./runtime-state-mFfbKS_T.js";
import { n as ensureAuthProfileStore } from "./store-B42uPB2x.js";
import { P as resolveProviderSyntheticAuthWithPlugin, _ as normalizeProviderResolvedModelWithPlugin, a as applyProviderResolvedTransportWithPlugin, i as applyProviderResolvedModelCompatWithPlugins } from "./provider-runtime-CXPD9sF4.js";
import { i as isDeniedModelProviderRef, o as restrictDeniedModelProviders } from "./model-provider-denylist-s_q-H32R.js";
import { g as resolveProviderEnvApiKeyCandidates } from "./model-auth-markers-C4tEv9Wn.js";
import { t as resolveEnvApiKey } from "./model-auth-env-DGyJmnDE.js";
import { i as normalizeModelCompat } from "./provider-model-compat-BoR1VWMB.js";
import fs from "node:fs";
import path from "node:path";
import { InMemoryModelsStore } from "@mariozechner/pi-ai";
import { ModelRegistry as PiModelRegistry, ModelRuntime } from "@mariozechner/pi-coding-agent";
//#region src/plugins/synthetic-auth.runtime.ts
const BUNDLED_SYNTHETIC_AUTH_PROVIDER_REFS = [
	"claude-cli",
	"ollama",
	"xai"
];
function uniqueProviderRefs(values) {
	const seen = /* @__PURE__ */ new Set();
	const next = [];
	for (const raw of values) {
		const trimmed = raw.trim();
		const normalized = normalizeProviderId(trimmed);
		if (!trimmed || seen.has(normalized)) continue;
		seen.add(normalized);
		next.push(trimmed);
	}
	return next;
}
function resolveRuntimeSyntheticAuthProviderRefs() {
	const registry = getPluginRegistryState()?.activeRegistry;
	if (registry) return uniqueProviderRefs([...(registry.providers ?? []).filter((entry) => "resolveSyntheticAuth" in entry.provider && typeof entry.provider.resolveSyntheticAuth === "function").map((entry) => entry.provider.id), ...(registry.cliBackends ?? []).filter((entry) => "resolveSyntheticAuth" in entry.backend && typeof entry.backend.resolveSyntheticAuth === "function").map((entry) => entry.backend.id)]);
	return uniqueProviderRefs(BUNDLED_SYNTHETIC_AUTH_PROVIDER_REFS);
}
//#endregion
//#region src/agents/pi-auth-credentials.ts
function convertAuthProfileCredentialToPi(cred) {
	if (cred.type === "api_key") {
		const key = normalizeOptionalString(cred.key) ?? "";
		if (!key) return null;
		return {
			type: "api_key",
			key
		};
	}
	if (cred.type === "token") {
		const token = normalizeOptionalString(cred.token) ?? "";
		if (!token) return null;
		if (typeof cred.expires === "number" && Number.isFinite(cred.expires) && Date.now() >= cred.expires) return null;
		return {
			type: "api_key",
			key: token
		};
	}
	if (cred.type === "oauth") {
		const access = normalizeOptionalString(cred.access) ?? "";
		const refresh = normalizeOptionalString(cred.refresh) ?? "";
		if (!access || !refresh || !Number.isFinite(cred.expires) || cred.expires <= 0) return null;
		return {
			type: "oauth",
			access,
			refresh,
			expires: cred.expires
		};
	}
	return null;
}
function resolvePiCredentialMapFromStore(store) {
	const credentials = {};
	for (const credential of Object.values(store.profiles)) {
		const provider = normalizeProviderId(credential.provider ?? "");
		if (!provider || credentials[provider]) continue;
		const converted = convertAuthProfileCredentialToPi(credential);
		if (converted) credentials[provider] = converted;
	}
	return credentials;
}
//#endregion
//#region src/agents/pi-credential-store.ts
/**
* The only credential source Enclawed gives pi.
*
* pi-coding-agent >= 0.80.8 resolves request auth through a pi-ai
* `CredentialStore` (`ModelRuntime.create({ credentials })`). When none is
* given it opens its own file store (`~/.pi/agent/auth.json`, or
* `<agentDir>/auth.json`) and may write OAuth refreshes there. Enclawed is the
* credential authority (auth profiles, SecretRefs, env policy, provider
* denylist), so every pi model runtime Enclawed creates gets this in-memory
* store seeded with exactly the credentials Enclawed resolved; nothing is read
* from or written to disk.
*
* pi-ai consults ambient sources (environment variables, AWS profiles, ADC
* files) only for a provider that has no stored credential, so Enclawed also
* seeds env-backed keys it accepts (see `addEnvBackedPiCredentials`), and the
* embedded runner always passes the run's resolved key explicitly.
*
* OAuth refreshes pi performs (`modify`) stay in memory for the lifetime of
* the store; Enclawed's own refresh path persists rotated tokens to its auth
* profiles.
*/
var EnclawedPiCredentialStore = class {
	constructor(initial = {}) {
		this.credentials = /* @__PURE__ */ new Map();
		this.chains = /* @__PURE__ */ new Map();
		for (const [providerId, credential] of Object.entries(initial)) this.credentials.set(providerId, { ...credential });
	}
	/** Serialize mutations per provider id, as the CredentialStore contract requires. */
	enqueue(providerId, task) {
		const next = (this.chains.get(providerId) ?? Promise.resolve()).then(task, task);
		this.chains.set(providerId, next.catch(() => void 0));
		return next;
	}
	async read(providerId, options) {
		options?.signal?.throwIfAborted();
		const credential = this.credentials.get(providerId);
		return credential ? { ...credential } : void 0;
	}
	async list(options) {
		options?.signal?.throwIfAborted();
		return [...this.credentials.entries()].map(([providerId, credential]) => ({
			providerId,
			type: credential.type
		})).toSorted((left, right) => left.providerId.localeCompare(right.providerId));
	}
	modify(providerId, fn, options) {
		options?.signal?.throwIfAborted();
		return this.enqueue(providerId, async () => {
			const current = this.credentials.get(providerId);
			const next = await fn(current ? { ...current } : void 0);
			if (next) this.credentials.set(providerId, { ...next });
			const stored = this.credentials.get(providerId);
			return stored ? { ...stored } : void 0;
		});
	}
	delete(providerId, options) {
		options?.signal?.throwIfAborted();
		return this.enqueue(providerId, async () => {
			this.credentials.delete(providerId);
		});
	}
	/**
	* Make `apiKey` the provider's credential for this run (the key Enclawed
	* resolved after profile selection or a runtime auth exchange). A stored
	* credential owns the provider in pi-ai, so ambient env is not consulted.
	*/
	setRuntimeApiKey(providerId, apiKey) {
		this.credentials.set(providerId, {
			type: "api_key",
			key: apiKey
		});
	}
	/** The provider's stored API key or OAuth access token, if any. */
	async getApiKey(providerId) {
		const credential = this.credentials.get(providerId);
		if (!credential) return;
		return credential.type === "api_key" ? credential.key : credential.access;
	}
};
//#endregion
//#region src/agents/pi-model-discovery.ts
function normalizeDiscoveredPiModel(value, agentDir) {
	if (!isRecord(value)) return value;
	if (typeof value.id !== "string" || typeof value.name !== "string" || typeof value.provider !== "string") return value;
	const model = value;
	const pluginNormalized = normalizeProviderResolvedModelWithPlugin({
		provider: model.provider,
		context: {
			provider: model.provider,
			modelId: model.id,
			model,
			agentDir
		}
	}) ?? model;
	const compatNormalized = applyProviderResolvedModelCompatWithPlugins({
		provider: model.provider,
		context: {
			provider: model.provider,
			modelId: model.id,
			model: pluginNormalized,
			agentDir
		}
	}) ?? pluginNormalized;
	const transportNormalized = applyProviderResolvedTransportWithPlugin({
		provider: model.provider,
		context: {
			provider: model.provider,
			modelId: model.id,
			model: compatNormalized,
			agentDir
		}
	}) ?? compatNormalized;
	if (!isRecord(transportNormalized) || typeof transportNormalized.id !== "string" || typeof transportNormalized.name !== "string" || typeof transportNormalized.provider !== "string" || typeof transportNormalized.api !== "string") return value;
	return normalizeModelCompat(transportNormalized);
}
function createEnclawedModelRegistry(modelRuntime, agentDir) {
	const registry = new PiModelRegistry(modelRuntime);
	const getAll = registry.getAll.bind(registry);
	const getAvailable = registry.getAvailable.bind(registry);
	const find = registry.find.bind(registry);
	registry.getAll = () => getAll().map((entry) => normalizeDiscoveredPiModel(entry, agentDir));
	registry.getAvailable = () => getAvailable().map((entry) => normalizeDiscoveredPiModel(entry, agentDir));
	registry.find = (provider, modelId) => normalizeDiscoveredPiModel(find(provider, modelId), agentDir);
	restrictDeniedModelProviders(registry);
	return registry;
}
function scrubLegacyStaticAuthJsonEntriesForDiscovery(pathname) {
	if (process.env.ENCLAWED_AUTH_STORE_READONLY === "1") return;
	if (!fs.existsSync(pathname)) return;
	let parsed;
	try {
		parsed = JSON.parse(fs.readFileSync(pathname, "utf8"));
	} catch {
		return;
	}
	if (!isRecord(parsed)) return;
	let changed = false;
	for (const [provider, value] of Object.entries(parsed)) {
		if (!isRecord(value)) continue;
		if (value.type !== "api_key") continue;
		delete parsed[provider];
		changed = true;
	}
	if (!changed) return;
	if (Object.keys(parsed).length === 0) {
		fs.rmSync(pathname, { force: true });
		return;
	}
	fs.writeFileSync(pathname, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
	fs.chmodSync(pathname, 384);
}
function addEnvBackedPiCredentials(credentials, env = process.env) {
	const next = { ...credentials };
	for (const provider of Object.keys(resolveProviderEnvApiKeyCandidates({ env }))) {
		if (next[provider] || isDeniedModelProviderRef({ provider })) continue;
		const resolved = resolveEnvApiKey(provider, env);
		if (!resolved?.apiKey) continue;
		next[provider] = {
			type: "api_key",
			key: resolved.apiKey
		};
	}
	return next;
}
function resolvePiCredentialsForDiscovery(agentDir) {
	const credentials = addEnvBackedPiCredentials(resolvePiCredentialMapFromStore(ensureAuthProfileStore(agentDir, { allowKeychainPrompt: false })));
	for (const provider of resolveRuntimeSyntheticAuthProviderRefs()) {
		if (credentials[provider]) continue;
		const apiKey = resolveProviderSyntheticAuthWithPlugin({
			provider,
			context: {
				config: void 0,
				provider,
				providerConfig: void 0
			}
		})?.apiKey?.trim();
		if (!apiKey) continue;
		credentials[provider] = {
			type: "api_key",
			key: apiKey
		};
	}
	return credentials;
}
/**
* Enclawed's credential store for pi, seeded with the credentials Enclawed
* resolved for discovery (auth profiles, accepted env keys, synthetic plugin
* auth). pi never opens its own auth.json.
*/
function discoverAuthStorage(agentDir) {
	const credentials = resolvePiCredentialsForDiscovery(agentDir);
	scrubLegacyStaticAuthJsonEntriesForDiscovery(path.join(agentDir, "auth.json"));
	return new EnclawedPiCredentialStore(credentials);
}
/**
* pi model runtime bound to Enclawed's sources only:
* - credentials: Enclawed's in-memory store (never `~/.pi/agent/auth.json`);
* - models: Enclawed's generated `<agentDir>/models.json` (never `~/.pi`);
* - catalog cache: in memory (no `models-store.json` written next to it);
* - no network catalog refresh (`allowModelNetwork` stays off).
*/
async function discoverModelRuntime(authStorage, agentDir) {
	return await ModelRuntime.create({
		credentials: authStorage,
		modelsPath: path.join(agentDir, "models.json"),
		modelsStore: new InMemoryModelsStore(),
		allowModelNetwork: false
	});
}
/** Enclawed-policy view over a pi model runtime (normalized models, denied providers removed). */
function createModelRegistryForRuntime(modelRuntime, agentDir) {
	return createEnclawedModelRegistry(modelRuntime, agentDir);
}
async function discoverModels(authStorage, agentDir) {
	return createEnclawedModelRegistry(await discoverModelRuntime(authStorage, agentDir), agentDir);
}
//#endregion
export { discoverAuthStorage as a, normalizeDiscoveredPiModel as c, EnclawedPiCredentialStore as d, createModelRegistryForRuntime as i, resolvePiCredentialsForDiscovery as l, PiModelRegistry as n, discoverModelRuntime as o, addEnvBackedPiCredentials as r, discoverModels as s, ModelRuntime as t, scrubLegacyStaticAuthJsonEntriesForDiscovery as u };
