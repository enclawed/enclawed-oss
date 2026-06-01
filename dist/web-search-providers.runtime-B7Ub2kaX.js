import { s as normalizeOptionalString } from "./string-coerce-BUSzWgUA.js";
import { a as normalizePluginIdScope, r as hasExplicitPluginIdScope } from "./channel-configured-B7jOcEsJ.js";
import { r as withActivatedPluginIds } from "./activation-context-DD-kKdNq.js";
import { a as resolveRuntimePluginRegistry, i as resolveCompatibleRuntimePluginRegistry, r as loadEnclawedPlugins, t as isPluginRegistryLoadInFlight } from "./loader-C8wlZwIu.js";
import { o as getActivePluginRegistryWorkspaceDir } from "./runtime-v-gfCtZv.js";
import { n as buildPluginRuntimeLoadOptionsFromValues, r as createPluginRuntimeLoaderLogger } from "./load-context-Bv-4NSeR.js";
import { c as mapRegistryProviders, l as resolveManifestDeclaredWebProviderCandidatePluginIds, n as sortWebSearchProviders, s as buildWebProviderSnapshotCacheKey, t as resolveBundledWebSearchResolutionConfig } from "./web-search-providers.shared-BS35FJ47.js";
import { n as resolveBundledWebSearchProvidersFromPublicArtifacts } from "./web-provider-public-artifacts-DTXql4Ot.js";
//#region src/plugins/cache-controls.ts
const DEFAULT_PLUGIN_DISCOVERY_CACHE_MS = 1e3;
const DEFAULT_PLUGIN_MANIFEST_CACHE_MS = 1e3;
function shouldUsePluginSnapshotCache(env) {
	if (normalizeOptionalString(env.ENCLAWED_DISABLE_PLUGIN_DISCOVERY_CACHE)) return false;
	if (normalizeOptionalString(env.ENCLAWED_DISABLE_PLUGIN_MANIFEST_CACHE)) return false;
	if (normalizeOptionalString(env.ENCLAWED_PLUGIN_DISCOVERY_CACHE_MS) === "0") return false;
	if (normalizeOptionalString(env.ENCLAWED_PLUGIN_MANIFEST_CACHE_MS) === "0") return false;
	return true;
}
function resolvePluginCacheMs(rawValue, defaultMs) {
	const raw = normalizeOptionalString(rawValue);
	if (raw === "" || raw === "0") return 0;
	if (!raw) return defaultMs;
	const parsed = Number.parseInt(raw, 10);
	if (!Number.isFinite(parsed)) return defaultMs;
	return Math.max(0, parsed);
}
function resolvePluginSnapshotCacheTtlMs(env) {
	const discoveryCacheMs = resolvePluginCacheMs(env.ENCLAWED_PLUGIN_DISCOVERY_CACHE_MS, DEFAULT_PLUGIN_DISCOVERY_CACHE_MS);
	const manifestCacheMs = resolvePluginCacheMs(env.ENCLAWED_PLUGIN_MANIFEST_CACHE_MS, DEFAULT_PLUGIN_MANIFEST_CACHE_MS);
	return Math.min(discoveryCacheMs, manifestCacheMs);
}
function buildPluginSnapshotCacheEnvKey(env) {
	return JSON.stringify({
		ENCLAWED_BUNDLED_PLUGINS_DIR: env.ENCLAWED_BUNDLED_PLUGINS_DIR ?? "",
		ENCLAWED_DISABLE_PLUGIN_DISCOVERY_CACHE: env.ENCLAWED_DISABLE_PLUGIN_DISCOVERY_CACHE ?? "",
		ENCLAWED_DISABLE_PLUGIN_MANIFEST_CACHE: env.ENCLAWED_DISABLE_PLUGIN_MANIFEST_CACHE ?? "",
		ENCLAWED_PLUGIN_DISCOVERY_CACHE_MS: env.ENCLAWED_PLUGIN_DISCOVERY_CACHE_MS ?? "",
		ENCLAWED_PLUGIN_MANIFEST_CACHE_MS: env.ENCLAWED_PLUGIN_MANIFEST_CACHE_MS ?? "",
		ENCLAWED_HOME: env.ENCLAWED_HOME ?? "",
		ENCLAWED_STATE_DIR: env.ENCLAWED_STATE_DIR ?? "",
		ENCLAWED_CONFIG_PATH: env.ENCLAWED_CONFIG_PATH ?? "",
		HOME: env.HOME ?? "",
		USERPROFILE: env.USERPROFILE ?? "",
		VITEST: env.VITEST ?? ""
	});
}
//#endregion
//#region src/plugins/web-provider-runtime-shared.ts
function createWebProviderSnapshotCache() {
	return /* @__PURE__ */ new WeakMap();
}
function resolveWebProviderLoadOptions(params, deps) {
	const env = params.env ?? process.env;
	const workspaceDir = params.workspaceDir ?? getActivePluginRegistryWorkspaceDir();
	const { config, activationSourceConfig, autoEnabledReasons } = deps.resolveBundledResolutionConfig({
		...params,
		workspaceDir,
		env
	});
	const onlyPluginIds = normalizePluginIdScope(deps.resolveCandidatePluginIds({
		config,
		workspaceDir,
		env,
		onlyPluginIds: params.onlyPluginIds,
		origin: params.origin
	}));
	return buildPluginRuntimeLoadOptionsFromValues({
		env,
		config,
		activationSourceConfig,
		autoEnabledReasons,
		workspaceDir,
		logger: createPluginRuntimeLoaderLogger()
	}, {
		cache: params.cache ?? false,
		activate: params.activate ?? false,
		...hasExplicitPluginIdScope(onlyPluginIds) ? { onlyPluginIds } : {}
	});
}
function resolvePluginWebProviders(params, deps) {
	const env = params.env ?? process.env;
	const workspaceDir = params.workspaceDir ?? getActivePluginRegistryWorkspaceDir();
	if (params.mode === "setup") {
		const pluginIds = deps.resolveCandidatePluginIds({
			config: params.config,
			workspaceDir,
			env,
			onlyPluginIds: params.onlyPluginIds,
			origin: params.origin
		}) ?? [];
		if (pluginIds.length === 0) return [];
		if (params.activate !== true) {
			const bundledArtifactProviders = deps.resolveBundledPublicArtifactProviders?.({
				config: params.config,
				workspaceDir,
				env,
				bundledAllowlistCompat: params.bundledAllowlistCompat,
				onlyPluginIds: pluginIds
			});
			if (bundledArtifactProviders) return bundledArtifactProviders;
		}
		const registry = loadEnclawedPlugins(buildPluginRuntimeLoadOptionsFromValues({
			config: withActivatedPluginIds({
				config: params.config,
				pluginIds
			}),
			activationSourceConfig: params.config,
			autoEnabledReasons: {},
			workspaceDir,
			env,
			logger: createPluginRuntimeLoaderLogger()
		}, {
			onlyPluginIds: pluginIds,
			cache: params.cache ?? false,
			activate: params.activate ?? false
		}));
		return deps.mapRegistryProviders({
			registry,
			onlyPluginIds: pluginIds
		});
	}
	const cacheOwnerConfig = params.config;
	const shouldMemoizeSnapshot = params.activate !== true && params.cache !== true && shouldUsePluginSnapshotCache(env);
	const cacheKey = buildWebProviderSnapshotCacheKey({
		config: cacheOwnerConfig,
		workspaceDir,
		bundledAllowlistCompat: params.bundledAllowlistCompat,
		onlyPluginIds: params.onlyPluginIds,
		origin: params.origin,
		envKey: buildPluginSnapshotCacheEnvKey(env)
	});
	if (cacheOwnerConfig && shouldMemoizeSnapshot) {
		const cached = (deps.snapshotCache.get(cacheOwnerConfig)?.get(env))?.get(cacheKey);
		if (cached && cached.expiresAt > Date.now()) return cached.providers;
	}
	const memoizeSnapshot = (providers) => {
		if (!cacheOwnerConfig || !shouldMemoizeSnapshot) return;
		const ttlMs = resolvePluginSnapshotCacheTtlMs(env);
		let configCache = deps.snapshotCache.get(cacheOwnerConfig);
		if (!configCache) {
			configCache = /* @__PURE__ */ new WeakMap();
			deps.snapshotCache.set(cacheOwnerConfig, configCache);
		}
		let envCache = configCache.get(env);
		if (!envCache) {
			envCache = /* @__PURE__ */ new Map();
			configCache.set(env, envCache);
		}
		envCache.set(cacheKey, {
			expiresAt: Date.now() + ttlMs,
			providers
		});
	};
	const loadOptions = resolveWebProviderLoadOptions(params, deps);
	const compatible = resolveCompatibleRuntimePluginRegistry(loadOptions);
	if (compatible) {
		const resolved = deps.mapRegistryProviders({
			registry: compatible,
			onlyPluginIds: params.onlyPluginIds
		});
		memoizeSnapshot(resolved);
		return resolved;
	}
	if (isPluginRegistryLoadInFlight(loadOptions)) return [];
	const resolved = deps.mapRegistryProviders({
		registry: loadEnclawedPlugins(loadOptions),
		onlyPluginIds: params.onlyPluginIds
	});
	memoizeSnapshot(resolved);
	return resolved;
}
function resolveRuntimeWebProviders(params, deps) {
	const runtimeRegistry = resolveRuntimePluginRegistry(params.config === void 0 ? void 0 : resolveWebProviderLoadOptions(params, deps));
	if (runtimeRegistry) return deps.mapRegistryProviders({
		registry: runtimeRegistry,
		onlyPluginIds: params.onlyPluginIds
	});
	return resolvePluginWebProviders(params, deps);
}
//#endregion
//#region src/plugins/web-search-providers.runtime.ts
let webSearchProviderSnapshotCache = createWebProviderSnapshotCache();
function resolveWebSearchCandidatePluginIds(params) {
	return resolveManifestDeclaredWebProviderCandidatePluginIds({
		contract: "webSearchProviders",
		configKey: "webSearch",
		config: params.config,
		workspaceDir: params.workspaceDir,
		env: params.env,
		onlyPluginIds: params.onlyPluginIds,
		origin: params.origin
	});
}
function mapRegistryWebSearchProviders(params) {
	return mapRegistryProviders({
		entries: params.registry.webSearchProviders,
		onlyPluginIds: params.onlyPluginIds,
		sortProviders: sortWebSearchProviders
	});
}
function resolvePluginWebSearchProviders(params) {
	return resolvePluginWebProviders(params, {
		snapshotCache: webSearchProviderSnapshotCache,
		resolveBundledResolutionConfig: resolveBundledWebSearchResolutionConfig,
		resolveCandidatePluginIds: resolveWebSearchCandidatePluginIds,
		mapRegistryProviders: mapRegistryWebSearchProviders,
		resolveBundledPublicArtifactProviders: resolveBundledWebSearchProvidersFromPublicArtifacts
	});
}
function resolveRuntimeWebSearchProviders(params) {
	return resolveRuntimeWebProviders(params, {
		snapshotCache: webSearchProviderSnapshotCache,
		resolveBundledResolutionConfig: resolveBundledWebSearchResolutionConfig,
		resolveCandidatePluginIds: resolveWebSearchCandidatePluginIds,
		mapRegistryProviders: mapRegistryWebSearchProviders
	});
}
//#endregion
export { resolvePluginWebProviders as i, resolveRuntimeWebSearchProviders as n, createWebProviderSnapshotCache as r, resolvePluginWebSearchProviders as t };
