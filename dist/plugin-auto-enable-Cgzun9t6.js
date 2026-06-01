import { o as normalizeOptionalLowercaseString, s as normalizeOptionalString } from "./string-coerce-BUSzWgUA.js";
import { f as resolveConfigDir, g as resolveUserPath, l as isRecord } from "./utils-CrVQlOZJ.js";
import { r as normalizeChatChannelId } from "./ids-DIOx3XOb.js";
import { s as normalizeStringEntries } from "./string-normalization-QLwZvaSN.js";
import { n as discoverEnclawedPlugins, r as resolvePluginCacheInputs } from "./discovery-DIELPEbp.js";
import { t as findBundledPluginMetadataById } from "./bundled-plugin-metadata-bzcf9tlC.js";
import { t as getCachedPluginJitiLoader } from "./jiti-loader-cache-B3dId7bg.js";
import { n as resolveManifestContractOwnerPluginId, t as loadPluginManifestRegistry } from "./manifest-registry-DwVSF2gb.js";
import { t as isBlockedObjectKey } from "./prototype-keys-DHl-z4Wt.js";
import { r as normalizeProviderId } from "./provider-id-JqYiEozY.js";
import { s as getChatChannelMeta } from "./registry-DWJO7iQk.js";
import { r as withBundledPluginVitestCompat } from "./bundled-compat-CeMubMJc.js";
import { a as normalizePluginsConfig, s as resolveEffectivePluginActivationState } from "./config-state-BmxTP58e.js";
import { n as createPluginIdScopeSet, t as isChannelConfigured } from "./channel-configured-B7jOcEsJ.js";
import { n as listPotentialConfiguredChannelIds, t as hasPotentialConfiguredChannels } from "./config-presence-DVdP6ht-.js";
import { t as buildPluginApi } from "./api-builder-BPyyi3ei.js";
import { n as listSetupProviderIds, t as listSetupCliBackendIds } from "./setup-descriptors-tKq-9ov4.js";
import { t as ensurePluginAllowlisted } from "./plugins-allowlist-BwZvYbAe.js";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";
//#region src/agents/harness-runtimes.ts
function collectConfiguredAgentHarnessRuntimes(config, env) {
	const runtimes = /* @__PURE__ */ new Set();
	const pushRuntime = (value) => {
		if (typeof value !== "string") return;
		const normalized = normalizeOptionalLowercaseString(value);
		if (!normalized || normalized === "auto" || normalized === "pi") return;
		runtimes.add(normalized);
	};
	pushRuntime(config.agents?.defaults?.embeddedHarness?.runtime);
	if (Array.isArray(config.agents?.list)) for (const agent of config.agents.list) {
		if (!isRecord(agent)) continue;
		pushRuntime(agent.embeddedHarness?.runtime);
	}
	pushRuntime(env.ENCLAWED_AGENT_RUNTIME);
	return [...runtimes].toSorted((left, right) => left.localeCompare(right));
}
//#endregion
//#region src/plugins/manifest-owner-policy.ts
function isBundledManifestOwner(plugin) {
	return plugin.origin === "bundled";
}
function hasExplicitManifestOwnerTrust(params) {
	return params.normalizedConfig.allow.includes(params.plugin.id) || params.normalizedConfig.entries[params.plugin.id]?.enabled === true;
}
function passesManifestOwnerBasePolicy(params) {
	if (!params.normalizedConfig.enabled) return false;
	if (params.normalizedConfig.deny.includes(params.plugin.id)) return false;
	if (params.normalizedConfig.entries[params.plugin.id]?.enabled === false && params.allowExplicitlyDisabled !== true) return false;
	if (params.normalizedConfig.allow.length > 0 && !params.normalizedConfig.allow.includes(params.plugin.id)) return false;
	return true;
}
function isActivatedManifestOwner(params) {
	return resolveEffectivePluginActivationState({
		id: params.plugin.id,
		origin: params.plugin.origin,
		config: params.normalizedConfig,
		rootConfig: params.rootConfig,
		enabledByDefault: params.plugin.enabledByDefault
	}).activated;
}
//#endregion
//#region src/plugins/providers.ts
function withBundledProviderVitestCompat(params) {
	return withBundledPluginVitestCompat(params);
}
function resolveBundledProviderCompatPluginIds(params) {
	const onlyPluginIdSet = createPluginIdScopeSet(params.onlyPluginIds);
	return loadPluginManifestRegistry({
		config: params.config,
		workspaceDir: params.workspaceDir,
		env: params.env
	}).plugins.filter((plugin) => plugin.origin === "bundled" && plugin.providers.length > 0 && (!onlyPluginIdSet || onlyPluginIdSet.has(plugin.id))).map((plugin) => plugin.id).toSorted((left, right) => left.localeCompare(right));
}
function resolveEnabledProviderPluginIds(params) {
	const onlyPluginIdSet = createPluginIdScopeSet(params.onlyPluginIds);
	const registry = loadPluginManifestRegistry({
		config: params.config,
		workspaceDir: params.workspaceDir,
		env: params.env
	});
	const normalizedConfig = normalizePluginsConfig(params.config?.plugins);
	return registry.plugins.filter((plugin) => plugin.providers.length > 0 && (!onlyPluginIdSet || onlyPluginIdSet.has(plugin.id)) && resolveEffectivePluginActivationState({
		id: plugin.id,
		origin: plugin.origin,
		config: normalizedConfig,
		rootConfig: params.config,
		enabledByDefault: plugin.enabledByDefault
	}).activated).map((plugin) => plugin.id).toSorted((left, right) => left.localeCompare(right));
}
function resolveDiscoveredProviderPluginIds(params) {
	const onlyPluginIdSet = createPluginIdScopeSet(params.onlyPluginIds);
	const registry = loadPluginManifestRegistry({
		config: params.config,
		workspaceDir: params.workspaceDir,
		env: params.env
	});
	const shouldFilterUntrustedWorkspacePlugins = params.includeUntrustedWorkspacePlugins === false;
	const normalizedConfig = normalizePluginsConfig(params.config?.plugins);
	return registry.plugins.filter((plugin) => {
		if (!(plugin.providers.length > 0 && (!onlyPluginIdSet || onlyPluginIdSet.has(plugin.id)))) return false;
		return isProviderPluginEligibleForSetupDiscovery({
			plugin,
			shouldFilterUntrustedWorkspacePlugins,
			normalizedConfig,
			rootConfig: params.config
		});
	}).map((plugin) => plugin.id).toSorted((left, right) => left.localeCompare(right));
}
function isProviderPluginEligibleForSetupDiscovery(params) {
	if (!params.shouldFilterUntrustedWorkspacePlugins || params.plugin.origin !== "workspace") return true;
	if (!passesManifestOwnerBasePolicy({
		plugin: params.plugin,
		normalizedConfig: params.normalizedConfig
	})) return false;
	return isActivatedManifestOwner({
		plugin: params.plugin,
		normalizedConfig: params.normalizedConfig,
		rootConfig: params.rootConfig
	});
}
function resolveDiscoverableProviderOwnerPluginIds(params) {
	if (params.pluginIds.length === 0) return [];
	const pluginIdSet = new Set(params.pluginIds);
	const registry = loadPluginManifestRegistry({
		config: params.config,
		workspaceDir: params.workspaceDir,
		env: params.env
	});
	const shouldFilterUntrustedWorkspacePlugins = params.includeUntrustedWorkspacePlugins === false;
	const normalizedConfig = normalizePluginsConfig(params.config?.plugins);
	return registry.plugins.filter((plugin) => pluginIdSet.has(plugin.id) && isProviderPluginEligibleForSetupDiscovery({
		plugin,
		shouldFilterUntrustedWorkspacePlugins,
		normalizedConfig,
		rootConfig: params.config
	})).map((plugin) => plugin.id).toSorted((left, right) => left.localeCompare(right));
}
function isProviderPluginEligibleForRuntimeOwnerActivation(params) {
	if (!passesManifestOwnerBasePolicy({
		plugin: params.plugin,
		normalizedConfig: params.normalizedConfig
	})) return false;
	if (params.plugin.origin !== "workspace") return true;
	return isActivatedManifestOwner({
		plugin: params.plugin,
		normalizedConfig: params.normalizedConfig,
		rootConfig: params.rootConfig
	});
}
function resolveActivatableProviderOwnerPluginIds(params) {
	if (params.pluginIds.length === 0) return [];
	const pluginIdSet = new Set(params.pluginIds);
	const registry = loadPluginManifestRegistry({
		config: params.config,
		workspaceDir: params.workspaceDir,
		env: params.env
	});
	const normalizedConfig = normalizePluginsConfig(params.config?.plugins);
	return registry.plugins.filter((plugin) => pluginIdSet.has(plugin.id) && isProviderPluginEligibleForRuntimeOwnerActivation({
		plugin,
		normalizedConfig,
		rootConfig: params.config
	})).map((plugin) => plugin.id).toSorted((left, right) => left.localeCompare(right));
}
function resolveManifestRegistry(params) {
	return params.manifestRegistry ?? loadPluginManifestRegistry({
		config: params.config,
		workspaceDir: params.workspaceDir,
		env: params.env
	});
}
function stripModelProfileSuffix(value) {
	const trimmed = value.trim();
	const at = trimmed.indexOf("@");
	return at <= 0 ? trimmed : trimmed.slice(0, at).trim();
}
function splitExplicitModelRef(rawModel) {
	const trimmed = rawModel.trim();
	if (!trimmed) return null;
	const slash = trimmed.indexOf("/");
	if (slash === -1) {
		const modelId = stripModelProfileSuffix(trimmed);
		return modelId ? { modelId } : null;
	}
	const provider = normalizeProviderId(trimmed.slice(0, slash));
	const modelId = stripModelProfileSuffix(trimmed.slice(slash + 1));
	if (!provider || !modelId) return null;
	return {
		provider,
		modelId
	};
}
function resolveModelSupportMatchKind(plugin, modelId) {
	const patterns = plugin.modelSupport?.modelPatterns ?? [];
	for (const patternSource of patterns) try {
		if (new RegExp(patternSource, "u").test(modelId)) return "pattern";
	} catch {
		continue;
	}
	const prefixes = plugin.modelSupport?.modelPrefixes ?? [];
	for (const prefix of prefixes) if (modelId.startsWith(prefix)) return "prefix";
}
function dedupeSortedPluginIds(values) {
	return [...new Set(values)].toSorted((left, right) => left.localeCompare(right));
}
function resolvePreferredManifestPluginIds(registry, matchedPluginIds) {
	if (matchedPluginIds.length === 0) return;
	const uniquePluginIds = dedupeSortedPluginIds(matchedPluginIds);
	if (uniquePluginIds.length <= 1) return uniquePluginIds;
	const nonBundledPluginIds = uniquePluginIds.filter((pluginId) => {
		return registry.plugins.find((entry) => entry.id === pluginId)?.origin !== "bundled";
	});
	if (nonBundledPluginIds.length === 1) return nonBundledPluginIds;
	if (nonBundledPluginIds.length > 1) return;
}
function resolveOwningPluginIdsForProvider(params) {
	const normalizedProvider = normalizeProviderId(params.provider);
	if (!normalizedProvider) return;
	const pluginIds = resolveManifestRegistry(params).plugins.filter((plugin) => plugin.providers.some((providerId) => normalizeProviderId(providerId) === normalizedProvider) || plugin.cliBackends.some((backendId) => normalizeProviderId(backendId) === normalizedProvider)).map((plugin) => plugin.id);
	return pluginIds.length > 0 ? pluginIds : void 0;
}
function resolveOwningPluginIdsForModelRef(params) {
	const parsed = splitExplicitModelRef(params.model);
	if (!parsed) return;
	if (parsed.provider) return resolveOwningPluginIdsForProvider({
		provider: parsed.provider,
		config: params.config,
		workspaceDir: params.workspaceDir,
		env: params.env,
		manifestRegistry: params.manifestRegistry
	});
	const registry = resolveManifestRegistry(params);
	const preferredPatternPluginIds = resolvePreferredManifestPluginIds(registry, registry.plugins.filter((plugin) => resolveModelSupportMatchKind(plugin, parsed.modelId) === "pattern").map((plugin) => plugin.id));
	if (preferredPatternPluginIds) return preferredPatternPluginIds;
	return resolvePreferredManifestPluginIds(registry, registry.plugins.filter((plugin) => resolveModelSupportMatchKind(plugin, parsed.modelId) === "prefix").map((plugin) => plugin.id));
}
function resolveOwningPluginIdsForModelRefs(params) {
	const registry = resolveManifestRegistry(params);
	return dedupeSortedPluginIds(params.models.flatMap((model) => resolveOwningPluginIdsForModelRef({
		model,
		config: params.config,
		workspaceDir: params.workspaceDir,
		env: params.env,
		manifestRegistry: registry
	}) ?? []));
}
function resolveCatalogHookProviderPluginIds(params) {
	const registry = loadPluginManifestRegistry({
		config: params.config,
		workspaceDir: params.workspaceDir,
		env: params.env
	});
	const normalizedConfig = normalizePluginsConfig(params.config?.plugins);
	const enabledProviderPluginIds = registry.plugins.filter((plugin) => plugin.providers.length > 0 && resolveEffectivePluginActivationState({
		id: plugin.id,
		origin: plugin.origin,
		config: normalizedConfig,
		rootConfig: params.config,
		enabledByDefault: plugin.enabledByDefault
	}).activated).map((plugin) => plugin.id);
	const bundledCompatPluginIds = resolveBundledProviderCompatPluginIds(params);
	return [...new Set([...enabledProviderPluginIds, ...bundledCompatPluginIds])].toSorted((left, right) => left.localeCompare(right));
}
//#endregion
//#region src/plugins/config-contracts.ts
function normalizePathPattern(pathPattern) {
	return pathPattern.split(".").map((segment) => segment.trim()).filter(Boolean);
}
function appendPathSegment(path, segment) {
	if (!path) return segment;
	return /^\d+$/.test(segment) ? `${path}[${segment}]` : `${path}.${segment}`;
}
function collectPluginConfigContractMatches(params) {
	const pattern = normalizePathPattern(params.pathPattern);
	if (pattern.length === 0) return [];
	let states = [{
		segments: [],
		value: params.root
	}];
	for (const segment of pattern) {
		const nextStates = [];
		for (const state of states) {
			if (segment === "*") {
				if (Array.isArray(state.value)) {
					for (const [index, value] of state.value.entries()) nextStates.push({
						segments: [...state.segments, String(index)],
						value
					});
					continue;
				}
				if (isRecord(state.value)) for (const [key, value] of Object.entries(state.value)) nextStates.push({
					segments: [...state.segments, key],
					value
				});
				continue;
			}
			if (Array.isArray(state.value)) {
				const index = Number.parseInt(segment, 10);
				if (Number.isInteger(index) && index >= 0 && index < state.value.length) nextStates.push({
					segments: [...state.segments, segment],
					value: state.value[index]
				});
				continue;
			}
			if (!isRecord(state.value) || !Object.prototype.hasOwnProperty.call(state.value, segment)) continue;
			nextStates.push({
				segments: [...state.segments, segment],
				value: state.value[segment]
			});
		}
		states = nextStates;
		if (states.length === 0) break;
	}
	return states.map((state) => ({
		path: state.segments.reduce(appendPathSegment, ""),
		value: state.value
	}));
}
function resolvePluginConfigContractsById(params) {
	const matches = /* @__PURE__ */ new Map();
	const pluginIds = [...new Set(params.pluginIds.map((pluginId) => pluginId.trim()).filter(Boolean))];
	if (pluginIds.length === 0) return matches;
	const resolvedPluginIds = /* @__PURE__ */ new Set();
	const registry = loadPluginManifestRegistry({
		config: params.config,
		workspaceDir: params.workspaceDir,
		env: params.env,
		cache: params.cache
	});
	for (const plugin of registry.plugins) {
		if (!pluginIds.includes(plugin.id)) continue;
		resolvedPluginIds.add(plugin.id);
		if (!plugin.configContracts) continue;
		matches.set(plugin.id, {
			origin: plugin.origin,
			configContracts: plugin.configContracts
		});
	}
	if (params.fallbackToBundledMetadata ?? true) for (const pluginId of pluginIds) {
		if (matches.has(pluginId) || resolvedPluginIds.has(pluginId)) continue;
		const bundled = findBundledPluginMetadataById(pluginId);
		if (!bundled?.manifest.configContracts) continue;
		matches.set(pluginId, {
			origin: "bundled",
			configContracts: bundled.manifest.configContracts
		});
	}
	return matches;
}
//#endregion
//#region src/plugins/setup-registry.ts
const SETUP_API_EXTENSIONS = [
	".js",
	".mjs",
	".cjs",
	".ts",
	".mts",
	".cts"
];
const CURRENT_MODULE_PATH = fileURLToPath(import.meta.url);
const RUNNING_FROM_BUILT_ARTIFACT = CURRENT_MODULE_PATH.includes(`${path.sep}dist${path.sep}`) || CURRENT_MODULE_PATH.includes(`${path.sep}dist-runtime${path.sep}`);
const EMPTY_RUNTIME = {};
const NOOP_LOGGER = {
	info() {},
	warn() {},
	error() {}
};
const MAX_SETUP_LOOKUP_CACHE_ENTRIES = 128;
const jitiLoaders = /* @__PURE__ */ new Map();
const setupRegistryCache = /* @__PURE__ */ new Map();
const setupProviderCache = /* @__PURE__ */ new Map();
const setupCliBackendCache = /* @__PURE__ */ new Map();
let setupLookupCacheEntryCap = MAX_SETUP_LOOKUP_CACHE_ENTRIES;
function getJiti(modulePath) {
	return getCachedPluginJitiLoader({
		cache: jitiLoaders,
		modulePath,
		importerUrl: import.meta.url
	});
}
function getCachedSetupValue(cache, key) {
	if (!cache.has(key)) return { hit: false };
	const cached = cache.get(key);
	cache.delete(key);
	cache.set(key, cached);
	return {
		hit: true,
		value: cached
	};
}
function setCachedSetupValue(cache, key, value) {
	if (cache.has(key)) cache.delete(key);
	cache.set(key, value);
	while (cache.size > setupLookupCacheEntryCap) {
		const oldestKey = cache.keys().next().value;
		if (typeof oldestKey !== "string") break;
		cache.delete(oldestKey);
	}
}
function buildSetupRegistryCacheKey(params) {
	const { roots, loadPaths } = resolvePluginCacheInputs({
		workspaceDir: params.workspaceDir,
		env: params.env
	});
	return JSON.stringify({
		roots,
		loadPaths,
		pluginIds: params.pluginIds ? [...new Set(params.pluginIds)].toSorted() : null
	});
}
function buildSetupProviderCacheKey(params) {
	return JSON.stringify({
		provider: normalizeProviderId(params.provider),
		registry: buildSetupRegistryCacheKey(params)
	});
}
function buildSetupCliBackendCacheKey(params) {
	return JSON.stringify({
		backend: normalizeProviderId(params.backend),
		registry: buildSetupRegistryCacheKey(params)
	});
}
function resolveSetupApiPath(rootDir) {
	const orderedExtensions = RUNNING_FROM_BUILT_ARTIFACT ? SETUP_API_EXTENSIONS : [...SETUP_API_EXTENSIONS.slice(3), ...SETUP_API_EXTENSIONS.slice(0, 3)];
	const findSetupApi = (candidateRootDir) => {
		for (const extension of orderedExtensions) {
			const candidate = path.join(candidateRootDir, `setup-api${extension}`);
			if (fs.existsSync(candidate)) return candidate;
		}
		return null;
	};
	const direct = findSetupApi(rootDir);
	if (direct) return direct;
	const bundledExtensionDir = path.basename(rootDir);
	const repoRootCandidates = [path.resolve(path.dirname(CURRENT_MODULE_PATH), "..", ".."), process.cwd()];
	for (const repoRoot of repoRootCandidates) {
		const sourceExtensionRoot = path.join(repoRoot, "extensions", bundledExtensionDir);
		if (sourceExtensionRoot === rootDir) continue;
		const sourceFallback = findSetupApi(sourceExtensionRoot);
		if (sourceFallback) return sourceFallback;
	}
	return null;
}
function collectConfiguredPluginEntryIds$1(config) {
	const entries = config.plugins?.entries;
	if (!entries || typeof entries !== "object") return [];
	return Object.keys(entries).map((pluginId) => pluginId.trim()).filter(Boolean).toSorted();
}
function resolveRelevantSetupMigrationPluginIds(params) {
	const ids = new Set(collectConfiguredPluginEntryIds$1(params.config));
	const registry = loadPluginManifestRegistry({
		workspaceDir: params.workspaceDir,
		env: params.env,
		cache: true
	});
	for (const plugin of registry.plugins) {
		const paths = plugin.configContracts?.compatibilityMigrationPaths;
		if (!paths?.length) continue;
		if (paths.some((pathPattern) => collectPluginConfigContractMatches({
			root: params.config,
			pathPattern
		}).length > 0)) ids.add(plugin.id);
	}
	return [...ids].toSorted();
}
function resolveRegister(mod) {
	if (typeof mod === "function") return { register: mod };
	if (mod && typeof mod === "object" && typeof mod.register === "function") return {
		definition: mod,
		register: mod.register.bind(mod)
	};
	return {};
}
function ignoreAsyncSetupRegisterResult(result) {
	if (!result || typeof result.then !== "function") return;
	Promise.resolve(result).catch(() => void 0);
}
function matchesProvider(provider, providerId) {
	const normalized = normalizeProviderId(providerId);
	if (normalizeProviderId(provider.id) === normalized) return true;
	return [...provider.aliases ?? [], ...provider.hookAliases ?? []].some((alias) => normalizeProviderId(alias) === normalized);
}
function loadSetupManifestRegistry(params) {
	const env = params?.env ?? process.env;
	const discovery = discoverEnclawedPlugins({
		workspaceDir: params?.workspaceDir,
		env,
		cache: true
	});
	return loadPluginManifestRegistry({
		workspaceDir: params?.workspaceDir,
		env,
		cache: true,
		candidates: discovery.candidates,
		diagnostics: discovery.diagnostics
	});
}
function findUniqueSetupManifestOwner(params) {
	const matches = params.registry.plugins.filter((entry) => params.listIds(entry).some((id) => normalizeProviderId(id) === params.normalizedId));
	if (matches.length === 0) return;
	return matches.length === 1 ? matches[0] : void 0;
}
function resolvePluginSetupRegistry(params) {
	const env = params?.env ?? process.env;
	const cacheKey = buildSetupRegistryCacheKey({
		workspaceDir: params?.workspaceDir,
		env,
		pluginIds: params?.pluginIds
	});
	const cached = getCachedSetupValue(setupRegistryCache, cacheKey);
	if (cached.hit) return cached.value;
	const selectedPluginIds = params?.pluginIds ? new Set(params.pluginIds.map((pluginId) => pluginId.trim()).filter(Boolean)) : null;
	if (selectedPluginIds && selectedPluginIds.size === 0) {
		const empty = {
			providers: [],
			cliBackends: [],
			configMigrations: [],
			autoEnableProbes: []
		};
		setCachedSetupValue(setupRegistryCache, cacheKey, empty);
		return empty;
	}
	const providers = [];
	const cliBackends = [];
	const configMigrations = [];
	const autoEnableProbes = [];
	const providerKeys = /* @__PURE__ */ new Set();
	const cliBackendKeys = /* @__PURE__ */ new Set();
	const manifestRegistry = loadSetupManifestRegistry({
		workspaceDir: params?.workspaceDir,
		env
	});
	for (const record of manifestRegistry.plugins) {
		if (selectedPluginIds && !selectedPluginIds.has(record.id)) continue;
		const setupSource = record.setupSource ?? resolveSetupApiPath(record.rootDir);
		if (!setupSource) continue;
		let mod;
		try {
			mod = getJiti(setupSource)(setupSource);
		} catch {
			continue;
		}
		const resolved = resolveRegister(mod.default ?? mod);
		if (!resolved.register) continue;
		if (resolved.definition?.id && resolved.definition.id !== record.id) continue;
		const api = buildPluginApi({
			id: record.id,
			name: record.name ?? record.id,
			version: record.version,
			description: record.description,
			source: setupSource,
			rootDir: record.rootDir,
			registrationMode: "setup-only",
			config: {},
			runtime: EMPTY_RUNTIME,
			logger: NOOP_LOGGER,
			resolvePath: (input) => input,
			handlers: {
				registerProvider(provider) {
					const key = `${record.id}:${normalizeProviderId(provider.id)}`;
					if (providerKeys.has(key)) return;
					providerKeys.add(key);
					providers.push({
						pluginId: record.id,
						provider
					});
				},
				registerCliBackend(backend) {
					const key = `${record.id}:${normalizeProviderId(backend.id)}`;
					if (cliBackendKeys.has(key)) return;
					cliBackendKeys.add(key);
					cliBackends.push({
						pluginId: record.id,
						backend
					});
				},
				registerConfigMigration(migrate) {
					configMigrations.push({
						pluginId: record.id,
						migrate
					});
				},
				registerAutoEnableProbe(probe) {
					autoEnableProbes.push({
						pluginId: record.id,
						probe
					});
				}
			}
		});
		try {
			const result = resolved.register(api);
			if (result && typeof result.then === "function") ignoreAsyncSetupRegisterResult(result);
		} catch {
			continue;
		}
	}
	const registry = {
		providers,
		cliBackends,
		configMigrations,
		autoEnableProbes
	};
	setCachedSetupValue(setupRegistryCache, cacheKey, registry);
	return registry;
}
function resolvePluginSetupProvider(params) {
	const cacheKey = buildSetupProviderCacheKey(params);
	const cached = getCachedSetupValue(setupProviderCache, cacheKey);
	if (cached.hit) return cached.value ?? void 0;
	const env = params.env ?? process.env;
	const normalizedProvider = normalizeProviderId(params.provider);
	const record = findUniqueSetupManifestOwner({
		registry: loadSetupManifestRegistry({
			workspaceDir: params.workspaceDir,
			env
		}),
		normalizedId: normalizedProvider,
		listIds: listSetupProviderIds
	});
	if (!record) {
		setCachedSetupValue(setupProviderCache, cacheKey, null);
		return;
	}
	const setupSource = record.setupSource ?? resolveSetupApiPath(record.rootDir);
	if (!setupSource) {
		setCachedSetupValue(setupProviderCache, cacheKey, null);
		return;
	}
	let mod;
	try {
		mod = getJiti(setupSource)(setupSource);
	} catch {
		setCachedSetupValue(setupProviderCache, cacheKey, null);
		return;
	}
	const resolved = resolveRegister(mod.default ?? mod);
	if (!resolved.register) {
		setCachedSetupValue(setupProviderCache, cacheKey, null);
		return;
	}
	if (resolved.definition?.id && resolved.definition.id !== record.id) {
		setCachedSetupValue(setupProviderCache, cacheKey, null);
		return;
	}
	let matchedProvider;
	const localProviderKeys = /* @__PURE__ */ new Set();
	const api = buildPluginApi({
		id: record.id,
		name: record.name ?? record.id,
		version: record.version,
		description: record.description,
		source: setupSource,
		rootDir: record.rootDir,
		registrationMode: "setup-only",
		config: {},
		runtime: EMPTY_RUNTIME,
		logger: NOOP_LOGGER,
		resolvePath: (input) => input,
		handlers: {
			registerProvider(provider) {
				const key = normalizeProviderId(provider.id);
				if (localProviderKeys.has(key)) return;
				localProviderKeys.add(key);
				if (matchesProvider(provider, normalizedProvider)) matchedProvider = provider;
			},
			registerConfigMigration() {},
			registerAutoEnableProbe() {}
		}
	});
	try {
		const result = resolved.register(api);
		if (result && typeof result.then === "function") ignoreAsyncSetupRegisterResult(result);
	} catch {
		setCachedSetupValue(setupProviderCache, cacheKey, null);
		return;
	}
	setCachedSetupValue(setupProviderCache, cacheKey, matchedProvider ?? null);
	return matchedProvider;
}
function resolvePluginSetupCliBackend(params) {
	const cacheKey = buildSetupCliBackendCacheKey(params);
	const cached = getCachedSetupValue(setupCliBackendCache, cacheKey);
	if (cached.hit) return cached.value ?? void 0;
	const normalized = normalizeProviderId(params.backend);
	const env = params.env ?? process.env;
	const record = findUniqueSetupManifestOwner({
		registry: loadSetupManifestRegistry({
			workspaceDir: params.workspaceDir,
			env
		}),
		normalizedId: normalized,
		listIds: listSetupCliBackendIds
	});
	if (!record) {
		setCachedSetupValue(setupCliBackendCache, cacheKey, null);
		return;
	}
	const setupSource = record.setupSource ?? resolveSetupApiPath(record.rootDir);
	if (!setupSource) {
		setCachedSetupValue(setupCliBackendCache, cacheKey, null);
		return;
	}
	let mod;
	try {
		mod = getJiti(setupSource)(setupSource);
	} catch {
		setCachedSetupValue(setupCliBackendCache, cacheKey, null);
		return;
	}
	const resolved = resolveRegister(mod.default ?? mod);
	if (!resolved.register) {
		setCachedSetupValue(setupCliBackendCache, cacheKey, null);
		return;
	}
	if (resolved.definition?.id && resolved.definition.id !== record.id) {
		setCachedSetupValue(setupCliBackendCache, cacheKey, null);
		return;
	}
	let matchedBackend;
	const localBackendKeys = /* @__PURE__ */ new Set();
	const api = buildPluginApi({
		id: record.id,
		name: record.name ?? record.id,
		version: record.version,
		description: record.description,
		source: setupSource,
		rootDir: record.rootDir,
		registrationMode: "setup-only",
		config: {},
		runtime: EMPTY_RUNTIME,
		logger: NOOP_LOGGER,
		resolvePath: (input) => input,
		handlers: {
			registerProvider() {},
			registerConfigMigration() {},
			registerAutoEnableProbe() {},
			registerCliBackend(backend) {
				const key = normalizeProviderId(backend.id);
				if (localBackendKeys.has(key)) return;
				localBackendKeys.add(key);
				if (key === normalized) matchedBackend = backend;
			}
		}
	});
	try {
		const result = resolved.register(api);
		if (result && typeof result.then === "function") ignoreAsyncSetupRegisterResult(result);
	} catch {
		setCachedSetupValue(setupCliBackendCache, cacheKey, null);
		return;
	}
	const resolvedEntry = matchedBackend ? {
		pluginId: record.id,
		backend: matchedBackend
	} : null;
	setCachedSetupValue(setupCliBackendCache, cacheKey, resolvedEntry);
	return resolvedEntry ?? void 0;
}
function runPluginSetupConfigMigrations(params) {
	let next = params.config;
	const changes = [];
	const pluginIds = resolveRelevantSetupMigrationPluginIds(params);
	if (pluginIds.length === 0) return {
		config: next,
		changes
	};
	for (const entry of resolvePluginSetupRegistry({
		workspaceDir: params.workspaceDir,
		env: params.env,
		pluginIds
	}).configMigrations) {
		const migration = entry.migrate(next);
		if (!migration || migration.changes.length === 0) continue;
		next = migration.config;
		changes.push(...migration.changes);
	}
	return {
		config: next,
		changes
	};
}
function resolvePluginSetupAutoEnableReasons(params) {
	const env = params.env ?? process.env;
	const reasons = [];
	const seen = /* @__PURE__ */ new Set();
	for (const entry of resolvePluginSetupRegistry({
		workspaceDir: params.workspaceDir,
		env,
		pluginIds: params.pluginIds
	}).autoEnableProbes) {
		const raw = entry.probe({
			config: params.config,
			env
		});
		const values = Array.isArray(raw) ? raw : raw ? [raw] : [];
		for (const reason of values) {
			const normalized = reason.trim();
			if (!normalized) continue;
			const key = `${entry.pluginId}:${normalized}`;
			if (seen.has(key)) continue;
			seen.add(key);
			reasons.push({
				pluginId: entry.pluginId,
				reason: normalized
			});
		}
	}
	return reasons;
}
//#endregion
//#region src/config/plugin-auto-enable.prefer-over.ts
const ENV_CATALOG_PATHS = ["ENCLAWED_PLUGIN_CATALOG_PATHS", "ENCLAWED_MPM_CATALOG_PATHS"];
function splitEnvPaths(value) {
	const trimmed = normalizeOptionalString(value) ?? "";
	if (!trimmed) return [];
	return normalizeStringEntries(trimmed.split(/[;,]/g).flatMap((chunk) => chunk.split(path.delimiter)));
}
function resolveExternalCatalogPaths(env) {
	for (const key of ENV_CATALOG_PATHS) {
		const raw = normalizeOptionalString(env[key]);
		if (raw) return splitEnvPaths(raw);
	}
	const configDir = resolveConfigDir(env);
	return [
		path.join(configDir, "mpm", "plugins.json"),
		path.join(configDir, "mpm", "catalog.json"),
		path.join(configDir, "plugins", "catalog.json")
	];
}
function parseExternalCatalogChannelEntries(raw) {
	const list = (() => {
		if (Array.isArray(raw)) return raw;
		if (!isRecord(raw)) return [];
		const entries = raw.entries ?? raw.packages ?? raw.plugins;
		return Array.isArray(entries) ? entries : [];
	})();
	const channels = [];
	for (const entry of list) {
		if (!isRecord(entry) || !isRecord(entry.enclawed) || !isRecord(entry.enclawed.channel)) continue;
		const channel = entry.enclawed.channel;
		const id = normalizeOptionalString(channel.id) ?? "";
		if (!id) continue;
		const preferOver = Array.isArray(channel.preferOver) ? channel.preferOver.filter((value) => typeof value === "string") : [];
		channels.push({
			id,
			preferOver
		});
	}
	return channels;
}
function resolveExternalCatalogPreferOver(channelId, env) {
	for (const rawPath of resolveExternalCatalogPaths(env)) {
		const resolved = resolveUserPath(rawPath, env);
		if (!fs.existsSync(resolved)) continue;
		try {
			const channel = parseExternalCatalogChannelEntries(JSON.parse(fs.readFileSync(resolved, "utf-8"))).find((entry) => entry.id === channelId);
			if (channel) return channel.preferOver;
		} catch {}
	}
	return [];
}
function resolveBuiltInChannelPreferOver(channelId) {
	const builtInChannelId = normalizeChatChannelId(channelId);
	if (!builtInChannelId) return [];
	return getChatChannelMeta(builtInChannelId).preferOver ?? [];
}
function resolvePreferredOverIds(candidate, env, registry) {
	const channelId = candidate.kind === "channel-configured" ? candidate.channelId : candidate.pluginId;
	const installedPlugin = registry.plugins.find((record) => record.id === candidate.pluginId);
	const manifestChannelPreferOver = installedPlugin?.channelConfigs?.[channelId]?.preferOver;
	if (manifestChannelPreferOver?.length) return [...manifestChannelPreferOver];
	const installedChannelMeta = installedPlugin?.channelCatalogMeta;
	if (installedChannelMeta?.preferOver?.length) return [...installedChannelMeta.preferOver];
	const builtInChannelPreferOver = resolveBuiltInChannelPreferOver(channelId);
	if (builtInChannelPreferOver.length) return [...builtInChannelPreferOver];
	return resolveExternalCatalogPreferOver(channelId, env);
}
function getPluginAutoEnableCandidateCacheKey(candidate) {
	return `${candidate.pluginId}:${candidate.kind === "channel-configured" ? candidate.channelId : candidate.pluginId}`;
}
function shouldSkipPreferredPluginAutoEnable(params) {
	const getPreferredOverIds = (candidate) => {
		const cacheKey = getPluginAutoEnableCandidateCacheKey(candidate);
		const cached = params.preferOverCache.get(cacheKey);
		if (cached) return cached;
		const resolved = resolvePreferredOverIds(candidate, params.env, params.registry);
		params.preferOverCache.set(cacheKey, resolved);
		return resolved;
	};
	for (const other of params.configured) {
		if (other.pluginId === params.entry.pluginId) continue;
		if (params.isPluginDenied(params.config, other.pluginId) || params.isPluginExplicitlyDisabled(params.config, other.pluginId)) continue;
		if (getPreferredOverIds(other).includes(params.entry.pluginId)) return true;
	}
	return false;
}
//#endregion
//#region src/config/plugin-auto-enable.shared.ts
const EMPTY_PLUGIN_MANIFEST_REGISTRY = {
	plugins: [],
	diagnostics: []
};
function resolveAutoEnableProviderPluginIds(registry) {
	const entries = /* @__PURE__ */ new Map();
	for (const plugin of registry.plugins) for (const providerId of plugin.autoEnableWhenConfiguredProviders ?? []) if (!entries.has(providerId)) entries.set(providerId, plugin.id);
	return Object.fromEntries(entries);
}
function collectModelRefs(cfg) {
	const refs = [];
	const pushModelRef = (value) => {
		if (typeof value === "string" && value.trim()) refs.push(value.trim());
	};
	const collectFromAgent = (agent) => {
		if (!agent) return;
		const model = agent.model;
		if (typeof model === "string") pushModelRef(model);
		else if (isRecord(model)) {
			pushModelRef(model.primary);
			const fallbacks = model.fallbacks;
			if (Array.isArray(fallbacks)) for (const entry of fallbacks) pushModelRef(entry);
		}
		const models = agent.models;
		if (isRecord(models)) for (const key of Object.keys(models)) pushModelRef(key);
	};
	collectFromAgent(cfg.agents?.defaults);
	const list = cfg.agents?.list;
	if (Array.isArray(list)) {
		for (const entry of list) if (isRecord(entry)) collectFromAgent(entry);
	}
	return refs;
}
function extractProviderFromModelRef(value) {
	const trimmed = value.trim();
	const slash = trimmed.indexOf("/");
	if (slash <= 0) return null;
	return normalizeProviderId(trimmed.slice(0, slash));
}
function hasConfiguredEmbeddedHarnessRuntime(cfg, env) {
	return collectConfiguredAgentHarnessRuntimes(cfg, env).length > 0;
}
function resolveAgentHarnessOwnerPluginIds(registry, runtime) {
	const normalizedRuntime = normalizeOptionalLowercaseString(runtime);
	if (!normalizedRuntime) return [];
	return registry.plugins.filter((plugin) => (plugin.activation?.onAgentHarnesses ?? []).some((entry) => normalizeOptionalLowercaseString(entry) === normalizedRuntime)).map((plugin) => plugin.id).toSorted((left, right) => left.localeCompare(right));
}
function isProviderConfigured(cfg, providerId) {
	const normalized = normalizeProviderId(providerId);
	const profiles = cfg.auth?.profiles;
	if (profiles && typeof profiles === "object") for (const profile of Object.values(profiles)) {
		if (!isRecord(profile)) continue;
		if (normalizeProviderId(profile.provider ?? "") === normalized) return true;
	}
	const providerConfig = cfg.models?.providers;
	if (providerConfig && typeof providerConfig === "object") {
		for (const key of Object.keys(providerConfig)) if (normalizeProviderId(key) === normalized) return true;
	}
	for (const ref of collectModelRefs(cfg)) {
		const provider = extractProviderFromModelRef(ref);
		if (provider && provider === normalized) return true;
	}
	return false;
}
function hasPluginOwnedWebSearchConfig(cfg, pluginId) {
	const pluginConfig = cfg.plugins?.entries?.[pluginId]?.config;
	return isRecord(pluginConfig) && isRecord(pluginConfig.webSearch);
}
function hasPluginOwnedWebFetchConfig(cfg, pluginId) {
	const pluginConfig = cfg.plugins?.entries?.[pluginId]?.config;
	return isRecord(pluginConfig) && isRecord(pluginConfig.webFetch);
}
function resolvePluginOwnedToolConfigKeys(plugin) {
	if ((plugin.contracts?.tools?.length ?? 0) === 0) return [];
	const properties = isRecord(plugin.configSchema) ? plugin.configSchema.properties : void 0;
	if (!isRecord(properties)) return [];
	return Object.keys(properties).filter((key) => key !== "webSearch" && key !== "webFetch");
}
function hasPluginOwnedToolConfig(cfg, plugin) {
	const pluginConfig = cfg.plugins?.entries?.[plugin.id]?.config;
	if (!isRecord(pluginConfig)) return false;
	return resolvePluginOwnedToolConfigKeys(plugin).some((key) => pluginConfig[key] !== void 0);
}
function resolveProviderPluginsWithOwnedWebSearch(registry) {
	return registry.plugins.filter((plugin) => (plugin.providers?.length ?? 0) > 0).filter((plugin) => (plugin.contracts?.webSearchProviders?.length ?? 0) > 0);
}
function resolveProviderPluginsWithOwnedWebFetch(registry) {
	return registry.plugins.filter((plugin) => (plugin.contracts?.webFetchProviders?.length ?? 0) > 0);
}
function resolvePluginsWithOwnedToolConfig(registry) {
	return registry.plugins.filter((plugin) => (plugin.contracts?.tools?.length ?? 0) > 0);
}
function resolvePluginIdForConfiguredWebFetchProvider(providerId, env) {
	return resolveManifestContractOwnerPluginId({
		contract: "webFetchProviders",
		value: normalizeOptionalLowercaseString(providerId) ?? "",
		origin: "bundled",
		env
	});
}
function buildChannelToPluginIdMap(registry) {
	const map = /* @__PURE__ */ new Map();
	for (const record of registry.plugins) for (const channelId of record.channels ?? []) if (channelId && !map.has(channelId)) map.set(channelId, record.id);
	return map;
}
function resolvePluginIdForChannel(channelId, channelToPluginId) {
	const builtInId = normalizeChatChannelId(channelId);
	if (builtInId) return builtInId;
	return channelToPluginId.get(channelId) ?? channelId;
}
function collectCandidateChannelIds(cfg, env) {
	return listPotentialConfiguredChannelIds(cfg, env).map((channelId) => normalizeChatChannelId(channelId) ?? channelId);
}
function hasConfiguredWebSearchPluginEntry(cfg) {
	const entries = cfg.plugins?.entries;
	return !!entries && typeof entries === "object" && Object.values(entries).some((entry) => isRecord(entry) && isRecord(entry.config) && isRecord(entry.config.webSearch));
}
function hasConfiguredWebFetchPluginEntry(cfg) {
	const entries = cfg.plugins?.entries;
	return !!entries && typeof entries === "object" && Object.values(entries).some((entry) => isRecord(entry) && isRecord(entry.config) && isRecord(entry.config.webFetch));
}
function hasConfiguredPluginConfigEntry(cfg) {
	const entries = cfg.plugins?.entries;
	return !!entries && typeof entries === "object" && Object.values(entries).some((entry) => isRecord(entry) && isRecord(entry.config));
}
function listContainsNormalized(value, expected) {
	return Array.isArray(value) && value.some((entry) => normalizeOptionalLowercaseString(entry) === expected);
}
function toolPolicyReferencesBrowser(value) {
	return isRecord(value) && (listContainsNormalized(value.allow, "browser") || listContainsNormalized(value.alsoAllow, "browser"));
}
function hasBrowserToolReference(cfg) {
	if (toolPolicyReferencesBrowser(cfg.tools)) return true;
	const agentList = cfg.agents?.list;
	return Array.isArray(agentList) ? agentList.some((entry) => isRecord(entry) && toolPolicyReferencesBrowser(entry.tools)) : false;
}
function collectConfiguredPluginEntryIds(cfg) {
	const entries = cfg.plugins?.entries;
	if (!entries || typeof entries !== "object") return [];
	return Object.keys(entries).map((pluginId) => pluginId.trim()).filter(Boolean);
}
function resolveRelevantSetupAutoEnablePluginIds(cfg) {
	const pluginIds = new Set(collectConfiguredPluginEntryIds(cfg));
	if (isRecord(cfg.browser) || isRecord(cfg.plugins?.entries?.browser) || hasBrowserToolReference(cfg)) pluginIds.add("browser");
	if (isRecord(cfg.acp) || isRecord(cfg.plugins?.entries?.acpx)) pluginIds.add("acpx");
	if (isRecord(cfg.plugins?.entries?.xai) || isRecord(cfg.tools?.web) && isRecord(cfg.tools.web.x_search)) pluginIds.add("xai");
	return [...pluginIds].toSorted((left, right) => left.localeCompare(right));
}
function hasSetupAutoEnableRelevantConfig(cfg) {
	const entries = cfg.plugins?.entries;
	if (isRecord(cfg.browser) || isRecord(cfg.acp) || hasBrowserToolReference(cfg)) return true;
	if (isRecord(entries?.browser) || isRecord(entries?.acpx) || isRecord(entries?.xai)) return true;
	if (isRecord(cfg.tools?.web) && isRecord(cfg.tools.web.x_search)) return true;
	return hasConfiguredPluginConfigEntry(cfg);
}
function hasPluginEntries(cfg) {
	const entries = cfg.plugins?.entries;
	return !!entries && typeof entries === "object" && Object.keys(entries).length > 0;
}
function configMayNeedPluginManifestRegistry(cfg, env) {
	const pluginEntries = cfg.plugins?.entries;
	if (Array.isArray(cfg.plugins?.allow) && cfg.plugins.allow.length > 0 && hasPluginEntries(cfg)) return true;
	if (pluginEntries && Object.values(pluginEntries).some((entry) => isRecord(entry) && isRecord(entry.config))) return true;
	if (cfg.auth?.profiles && Object.keys(cfg.auth.profiles).length > 0) return true;
	if (cfg.models?.providers && Object.keys(cfg.models.providers).length > 0) return true;
	if (collectModelRefs(cfg).length > 0) return true;
	if (hasConfiguredEmbeddedHarnessRuntime(cfg, env)) return true;
	const configuredChannels = cfg.channels;
	if (!configuredChannels || typeof configuredChannels !== "object") return false;
	for (const key of Object.keys(configuredChannels)) {
		if (key === "defaults" || key === "modelByChannel") continue;
		if (!normalizeChatChannelId(key)) return true;
	}
	return false;
}
function configMayNeedPluginAutoEnable(cfg, env) {
	if (Array.isArray(cfg.plugins?.allow) && cfg.plugins.allow.length > 0 && hasPluginEntries(cfg)) return true;
	if (hasConfiguredPluginConfigEntry(cfg)) return true;
	if (hasPotentialConfiguredChannels(cfg, env)) return true;
	if (cfg.auth?.profiles && Object.keys(cfg.auth.profiles).length > 0) return true;
	if (cfg.models?.providers && Object.keys(cfg.models.providers).length > 0) return true;
	if (collectModelRefs(cfg).length > 0) return true;
	if (hasConfiguredEmbeddedHarnessRuntime(cfg, env)) return true;
	if (hasConfiguredWebSearchPluginEntry(cfg) || hasConfiguredWebFetchPluginEntry(cfg)) return true;
	if (!hasSetupAutoEnableRelevantConfig(cfg)) return false;
	return resolvePluginSetupAutoEnableReasons({
		config: cfg,
		env,
		pluginIds: resolveRelevantSetupAutoEnablePluginIds(cfg)
	}).length > 0;
}
function resolvePluginAutoEnableCandidateReason(candidate) {
	switch (candidate.kind) {
		case "channel-configured": return `${candidate.channelId} configured`;
		case "provider-auth-configured": return `${candidate.providerId} auth configured`;
		case "provider-model-configured": return `${candidate.modelRef} model configured`;
		case "agent-harness-runtime-configured": return `${candidate.runtime} agent harness runtime configured`;
		case "web-fetch-provider-selected": return `${candidate.providerId} web fetch provider selected`;
		case "plugin-web-search-configured": return `${candidate.pluginId} web search configured`;
		case "plugin-web-fetch-configured": return `${candidate.pluginId} web fetch configured`;
		case "plugin-tool-configured": return `${candidate.pluginId} tool configured`;
		case "setup-auto-enable": return candidate.reason;
	}
	throw new Error("Unsupported plugin auto-enable candidate");
}
function resolveConfiguredPluginAutoEnableCandidates(params) {
	const changes = [];
	const channelToPluginId = buildChannelToPluginIdMap(params.registry);
	for (const channelId of collectCandidateChannelIds(params.config, params.env)) {
		const pluginId = resolvePluginIdForChannel(channelId, channelToPluginId);
		if (isChannelConfigured(params.config, channelId, params.env)) changes.push({
			pluginId,
			kind: "channel-configured",
			channelId
		});
	}
	for (const [providerId, pluginId] of Object.entries(resolveAutoEnableProviderPluginIds(params.registry))) if (isProviderConfigured(params.config, providerId)) changes.push({
		pluginId,
		kind: "provider-auth-configured",
		providerId
	});
	for (const modelRef of collectModelRefs(params.config)) {
		const owningPluginIds = resolveOwningPluginIdsForModelRef({
			model: modelRef,
			config: params.config,
			env: params.env,
			manifestRegistry: params.registry
		});
		if (owningPluginIds?.length === 1) changes.push({
			pluginId: owningPluginIds[0],
			kind: "provider-model-configured",
			modelRef
		});
	}
	for (const runtime of collectConfiguredAgentHarnessRuntimes(params.config, params.env)) {
		const pluginIds = resolveAgentHarnessOwnerPluginIds(params.registry, runtime);
		for (const pluginId of pluginIds) changes.push({
			pluginId,
			kind: "agent-harness-runtime-configured",
			runtime
		});
	}
	const webFetchProvider = typeof params.config.tools?.web?.fetch?.provider === "string" ? params.config.tools.web.fetch.provider : void 0;
	const webFetchPluginId = resolvePluginIdForConfiguredWebFetchProvider(webFetchProvider, params.env);
	if (webFetchPluginId) changes.push({
		pluginId: webFetchPluginId,
		kind: "web-fetch-provider-selected",
		providerId: normalizeOptionalLowercaseString(webFetchProvider) ?? ""
	});
	for (const plugin of resolveProviderPluginsWithOwnedWebSearch(params.registry)) {
		const pluginId = plugin.id;
		if (hasPluginOwnedWebSearchConfig(params.config, pluginId)) changes.push({
			pluginId,
			kind: "plugin-web-search-configured"
		});
	}
	for (const plugin of resolvePluginsWithOwnedToolConfig(params.registry)) {
		const pluginId = plugin.id;
		if (hasPluginOwnedToolConfig(params.config, plugin)) changes.push({
			pluginId,
			kind: "plugin-tool-configured"
		});
	}
	for (const plugin of resolveProviderPluginsWithOwnedWebFetch(params.registry)) {
		const pluginId = plugin.id;
		if (hasPluginOwnedWebFetchConfig(params.config, pluginId)) changes.push({
			pluginId,
			kind: "plugin-web-fetch-configured"
		});
	}
	if (hasSetupAutoEnableRelevantConfig(params.config)) for (const entry of resolvePluginSetupAutoEnableReasons({
		config: params.config,
		env: params.env,
		pluginIds: resolveRelevantSetupAutoEnablePluginIds(params.config)
	})) changes.push({
		pluginId: entry.pluginId,
		kind: "setup-auto-enable",
		reason: entry.reason
	});
	return changes;
}
function isPluginExplicitlyDisabled(cfg, pluginId) {
	const builtInChannelId = normalizeChatChannelId(pluginId);
	if (builtInChannelId) {
		const channelConfig = cfg.channels?.[builtInChannelId];
		if (channelConfig && typeof channelConfig === "object" && !Array.isArray(channelConfig) && channelConfig.enabled === false) return true;
	}
	return cfg.plugins?.entries?.[pluginId]?.enabled === false;
}
function isPluginDenied(cfg, pluginId) {
	const deny = cfg.plugins?.deny;
	return Array.isArray(deny) && deny.includes(pluginId);
}
function isBuiltInChannelAlreadyEnabled(cfg, channelId) {
	const channelConfig = cfg.channels?.[channelId];
	return !!channelConfig && typeof channelConfig === "object" && !Array.isArray(channelConfig) && channelConfig.enabled === true;
}
function registerPluginEntry(cfg, pluginId) {
	const builtInChannelId = normalizeChatChannelId(pluginId);
	if (builtInChannelId) {
		const existing = cfg.channels?.[builtInChannelId];
		const existingRecord = existing && typeof existing === "object" && !Array.isArray(existing) ? existing : {};
		return {
			...cfg,
			channels: {
				...cfg.channels,
				[builtInChannelId]: {
					...existingRecord,
					enabled: true
				}
			}
		};
	}
	return {
		...cfg,
		plugins: {
			...cfg.plugins,
			entries: {
				...cfg.plugins?.entries,
				[pluginId]: {
					...cfg.plugins?.entries?.[pluginId],
					enabled: true
				}
			}
		}
	};
}
function hasMaterialPluginEntryConfig(entry) {
	if (!isRecord(entry)) return false;
	return entry.enabled === true || isRecord(entry.config) || isRecord(entry.hooks) || isRecord(entry.subagent) || entry.apiKey !== void 0 || entry.env !== void 0;
}
function isKnownPluginId(pluginId, manifestRegistry) {
	if (normalizeChatChannelId(pluginId)) return true;
	return manifestRegistry.plugins.some((plugin) => plugin.id === pluginId);
}
function materializeConfiguredPluginEntryAllowlist(params) {
	let next = params.config;
	const allow = next.plugins?.allow;
	const entries = next.plugins?.entries;
	if (!Array.isArray(allow) || allow.length === 0 || !entries || typeof entries !== "object") return next;
	for (const pluginId of Object.keys(entries).toSorted((left, right) => left.localeCompare(right))) {
		const entry = entries[pluginId];
		if (!hasMaterialPluginEntryConfig(entry) || isPluginDenied(next, pluginId) || isPluginExplicitlyDisabled(next, pluginId) || allow.includes(pluginId) || !isKnownPluginId(pluginId, params.manifestRegistry)) continue;
		next = ensurePluginAllowlisted(next, pluginId);
		params.changes.push(`${pluginId} plugin config present, added to plugin allowlist.`);
	}
	return next;
}
function resolveChannelAutoEnableDisplayLabel(entry, manifestRegistry) {
	const builtInChannelId = normalizeChatChannelId(entry.channelId);
	if (builtInChannelId) return getChatChannelMeta(builtInChannelId).label;
	const plugin = manifestRegistry.plugins.find((record) => record.id === entry.pluginId);
	return plugin?.channelConfigs?.[entry.channelId]?.label ?? plugin?.channelCatalogMeta?.label;
}
function formatAutoEnableChange(entry, manifestRegistry) {
	if (entry.kind === "channel-configured") {
		const label = resolveChannelAutoEnableDisplayLabel(entry, manifestRegistry);
		if (label) return `${label} configured, enabled automatically.`;
	}
	return `${resolvePluginAutoEnableCandidateReason(entry).trim()}, enabled automatically.`;
}
function resolvePluginAutoEnableManifestRegistry(params) {
	return params.manifestRegistry ?? (configMayNeedPluginManifestRegistry(params.config, params.env) ? loadPluginManifestRegistry({
		config: params.config,
		env: params.env
	}) : EMPTY_PLUGIN_MANIFEST_REGISTRY);
}
function materializePluginAutoEnableCandidatesInternal(params) {
	let next = params.config ?? {};
	const changes = [];
	const autoEnabledReasons = /* @__PURE__ */ new Map();
	if (next.plugins?.enabled === false) return {
		config: next,
		changes,
		autoEnabledReasons: {}
	};
	const preferOverCache = /* @__PURE__ */ new Map();
	for (const entry of params.candidates) {
		const builtInChannelId = normalizeChatChannelId(entry.pluginId);
		if (isPluginDenied(next, entry.pluginId) || isPluginExplicitlyDisabled(next, entry.pluginId)) continue;
		if (shouldSkipPreferredPluginAutoEnable({
			config: next,
			entry,
			configured: params.candidates,
			env: params.env,
			registry: params.manifestRegistry,
			isPluginDenied,
			isPluginExplicitlyDisabled,
			preferOverCache
		})) continue;
		const allow = next.plugins?.allow;
		const allowMissing = Array.isArray(allow) && !allow.includes(entry.pluginId);
		if ((builtInChannelId != null ? isBuiltInChannelAlreadyEnabled(next, builtInChannelId) : next.plugins?.entries?.[entry.pluginId]?.enabled === true) && !allowMissing) continue;
		next = registerPluginEntry(next, entry.pluginId);
		next = ensurePluginAllowlisted(next, entry.pluginId);
		const reason = resolvePluginAutoEnableCandidateReason(entry);
		autoEnabledReasons.set(entry.pluginId, [...autoEnabledReasons.get(entry.pluginId) ?? [], reason]);
		changes.push(formatAutoEnableChange(entry, params.manifestRegistry));
	}
	next = materializeConfiguredPluginEntryAllowlist({
		config: next,
		changes,
		manifestRegistry: params.manifestRegistry
	});
	const autoEnabledReasonRecord = Object.create(null);
	for (const [pluginId, reasons] of autoEnabledReasons) if (!isBlockedObjectKey(pluginId)) autoEnabledReasonRecord[pluginId] = [...reasons];
	return {
		config: next,
		changes,
		autoEnabledReasons: autoEnabledReasonRecord
	};
}
//#endregion
//#region src/config/plugin-auto-enable.detect.ts
function detectPluginAutoEnableCandidates(params) {
	const env = params.env ?? process.env;
	const config = params.config ?? {};
	if (!configMayNeedPluginAutoEnable(config, env)) return [];
	return resolveConfiguredPluginAutoEnableCandidates({
		config,
		env,
		registry: resolvePluginAutoEnableManifestRegistry({
			config,
			env,
			manifestRegistry: params.manifestRegistry
		})
	});
}
//#endregion
//#region src/config/plugin-auto-enable.apply.ts
function materializePluginAutoEnableCandidates(params) {
	const env = params.env ?? process.env;
	const config = params.config ?? {};
	const manifestRegistry = resolvePluginAutoEnableManifestRegistry({
		config,
		env,
		manifestRegistry: params.manifestRegistry
	});
	return materializePluginAutoEnableCandidatesInternal({
		config,
		candidates: params.candidates,
		env,
		manifestRegistry
	});
}
function applyPluginAutoEnable(params) {
	const candidates = detectPluginAutoEnableCandidates(params);
	return materializePluginAutoEnableCandidates({
		config: params.config,
		candidates,
		env: params.env,
		manifestRegistry: params.manifestRegistry
	});
}
//#endregion
export { hasExplicitManifestOwnerTrust as _, runPluginSetupConfigMigrations as a, passesManifestOwnerBasePolicy as b, resolveActivatableProviderOwnerPluginIds as c, resolveDiscoverableProviderOwnerPluginIds as d, resolveDiscoveredProviderPluginIds as f, withBundledProviderVitestCompat as g, resolveOwningPluginIdsForProvider as h, resolvePluginSetupProvider as i, resolveBundledProviderCompatPluginIds as l, resolveOwningPluginIdsForModelRefs as m, configMayNeedPluginAutoEnable as n, collectPluginConfigContractMatches as o, resolveEnabledProviderPluginIds as p, resolvePluginSetupCliBackend as r, resolvePluginConfigContractsById as s, applyPluginAutoEnable as t, resolveCatalogHookProviderPluginIds as u, isActivatedManifestOwner as v, collectConfiguredAgentHarnessRuntimes as x, isBundledManifestOwner as y };
