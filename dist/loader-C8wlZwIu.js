import { i as normalizeLowercaseStringOrEmpty, s as normalizeOptionalString } from "./string-coerce-BUSzWgUA.js";
import { g as resolveUserPath, l as isRecord } from "./utils-CrVQlOZJ.js";
import { t as createSubsystemLogger } from "./subsystem-DTyALtnK.js";
import { t as formatCliCommand } from "./command-format-CAEA84sd.js";
import { i as openBoundaryFileSync, n as matchBoundaryFileOpenFailure } from "./boundary-file-read-CQh3KACR.js";
import { a as CLAUDE_BUNDLE_MANIFEST_RELATIVE_PATH, d as normalizeBundlePathList, i as safeStatSync, n as isPathInside, o as CODEX_BUNDLE_MANIFEST_RELATIVE_PATH, s as CURSOR_BUNDLE_MANIFEST_RELATIVE_PATH, u as mergeBundlePathLists } from "./path-safety-A6_emD94.js";
import { n as discoverEnclawedPlugins, r as resolvePluginCacheInputs } from "./discovery-DIELPEbp.js";
import { h as unwrapDefaultModuleExport } from "./bundled-CPcF5CPE.js";
import { f as resolvePluginRuntimeModulePath, g as shouldPreferNativeJiti, t as buildPluginLoaderAliasMap } from "./sdk-alias-C8kG0ZRH.js";
import { t as getCachedPluginJitiLoader } from "./jiti-loader-cache-B3dId7bg.js";
import { t as loadPluginManifestRegistry } from "./manifest-registry-DwVSF2gb.js";
import { i as kindsEqual, r as hasKind } from "./slots-CjmwiD-v.js";
import { t as applyMergePatch } from "./merge-patch-CENhXpuA.js";
import { a as normalizePluginsConfig, l as resolveMemorySlotDecision, n as createPluginActivationSource, o as resolveEffectiveEnableState, s as resolveEffectivePluginActivationState, t as applyTestPluginDefaults } from "./config-state-BmxTP58e.js";
import { t as validateJsonSchemaValue } from "./schema-validator-B8BUNg3T.js";
import { a as normalizePluginIdScope, n as createPluginIdScopeSet, o as serializePluginIdScope, r as hasExplicitPluginIdScope, t as isChannelConfigured } from "./channel-configured-B7jOcEsJ.js";
import { t as buildPluginApi } from "./api-builder-BPyyi3ei.js";
import { c as clearAgentHarnesses, f as restoreRegisteredAgentHarnesses, o as listRegisteredCompactionProviders, s as restoreRegisteredCompactionProviders, t as createPluginRegistry, u as listRegisteredAgentHarnesses } from "./registry-Bj1z72i4.js";
import { I as resolveMemoryDreamingConfig, L as resolveMemoryDreamingPluginConfig, _ as DEFAULT_MEMORY_DREAMING_PLUGIN_ID } from "./dreaming-D6fRJtHx.js";
import { a as clearPluginCommands } from "./command-registration-Bqzv_qN_.js";
import { i as initializeGlobalHookRunner } from "./hook-runner-global-B18jmw-H.js";
import { c as clearPluginInteractiveHandlers } from "./types-VxFFQ_Ma.js";
import { i as listRegisteredMemoryEmbeddingProviders, o as restoreRegisteredMemoryEmbeddingProviders } from "./memory-embedding-providers-BTTCMWj7.js";
import { a as getMemoryPromptSectionBuilder, i as getMemoryFlushPlanResolver, l as listMemoryCorpusSupplements, n as clearMemoryPluginState, o as getMemoryRuntime, r as getMemoryCapabilityRegistration, u as listMemoryPromptSupplements, v as restoreMemoryPluginState } from "./memory-state-CFyyWZvk.js";
import { d as recordImportedPluginId, i as getActivePluginRegistryKey, r as getActivePluginRegistry, s as getActivePluginRuntimeSubagentMode, y as setActivePluginRegistry } from "./runtime-v-gfCtZv.js";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
//#region src/plugins/bundle-config-shared.ts
function readBundleJsonObject(params) {
	const opened = openBoundaryFileSync({
		absolutePath: path.join(params.rootDir, params.relativePath),
		rootPath: params.rootDir,
		boundaryLabel: "plugin root",
		rejectHardlinks: true
	});
	if (!opened.ok) return params.onOpenFailure?.(opened) ?? {
		ok: true,
		raw: {}
	};
	try {
		const raw = JSON.parse(fs.readFileSync(opened.fd, "utf-8"));
		if (!isRecord(raw)) return {
			ok: false,
			error: `${params.relativePath} must contain a JSON object`
		};
		return {
			ok: true,
			raw
		};
	} catch (error) {
		return {
			ok: false,
			error: `failed to parse ${params.relativePath}: ${String(error)}`
		};
	} finally {
		fs.closeSync(opened.fd);
	}
}
function resolveBundleJsonOpenFailure(params) {
	return matchBoundaryFileOpenFailure(params.failure, {
		path: () => {
			if (params.allowMissing) return {
				ok: true,
				raw: {}
			};
			return {
				ok: false,
				error: `unable to read ${params.relativePath}: path`
			};
		},
		fallback: (failure) => ({
			ok: false,
			error: `unable to read ${params.relativePath}: ${failure.reason}`
		})
	});
}
function inspectBundleServerRuntimeSupport(params) {
	const supportedServerNames = [];
	const unsupportedServerNames = [];
	let hasSupportedServer = false;
	for (const [serverName, server] of Object.entries(params.resolveServers(params.loaded.config))) {
		if (typeof server.command === "string" && server.command.trim().length > 0) {
			hasSupportedServer = true;
			supportedServerNames.push(serverName);
			continue;
		}
		unsupportedServerNames.push(serverName);
	}
	return {
		hasSupportedServer,
		supportedServerNames,
		unsupportedServerNames,
		diagnostics: params.loaded.diagnostics
	};
}
function loadEnabledBundleConfig(params) {
	const registry = loadPluginManifestRegistry({
		workspaceDir: params.workspaceDir,
		config: params.cfg
	});
	const normalizedPlugins = normalizePluginsConfig(params.cfg?.plugins);
	const diagnostics = [];
	let merged = params.createEmptyConfig();
	for (const record of registry.plugins) {
		if (record.format !== "bundle" || !record.bundleFormat) continue;
		if (!resolveEffectivePluginActivationState({
			id: record.id,
			origin: record.origin,
			config: normalizedPlugins,
			rootConfig: params.cfg
		}).activated) continue;
		const loaded = params.loadBundleConfig({
			pluginId: record.id,
			rootDir: record.rootDir,
			bundleFormat: record.bundleFormat
		});
		merged = applyMergePatch(merged, loaded.config);
		for (const message of loaded.diagnostics) diagnostics.push(params.createDiagnostic(record.id, message));
	}
	return {
		config: merged,
		diagnostics
	};
}
//#endregion
//#region src/plugins/bundle-mcp.ts
const MANIFEST_PATH_BY_FORMAT = {
	claude: CLAUDE_BUNDLE_MANIFEST_RELATIVE_PATH,
	codex: CODEX_BUNDLE_MANIFEST_RELATIVE_PATH,
	cursor: CURSOR_BUNDLE_MANIFEST_RELATIVE_PATH
};
const CLAUDE_PLUGIN_ROOT_PLACEHOLDER = "${CLAUDE_PLUGIN_ROOT}";
function resolveBundleMcpConfigPaths(params) {
	const declared = normalizeBundlePathList(params.raw.mcpServers);
	const defaults = fs.existsSync(path.join(params.rootDir, ".mcp.json")) ? [".mcp.json"] : [];
	if (params.bundleFormat === "claude") return mergeBundlePathLists(defaults, declared);
	return mergeBundlePathLists(defaults, declared);
}
function extractMcpServerMap(raw) {
	if (!isRecord(raw)) return {};
	const nested = isRecord(raw.mcpServers) ? raw.mcpServers : isRecord(raw.servers) ? raw.servers : raw;
	if (!isRecord(nested)) return {};
	const result = {};
	for (const [serverName, serverRaw] of Object.entries(nested)) {
		if (!isRecord(serverRaw)) continue;
		result[serverName] = { ...serverRaw };
	}
	return result;
}
function isExplicitRelativePath(value) {
	return value === "." || value === ".." || value.startsWith("./") || value.startsWith("../");
}
function expandBundleRootPlaceholders(value, rootDir) {
	if (!value.includes(CLAUDE_PLUGIN_ROOT_PLACEHOLDER)) return value;
	return value.split(CLAUDE_PLUGIN_ROOT_PLACEHOLDER).join(rootDir);
}
function normalizeBundlePath(targetPath) {
	return path.normalize(path.resolve(targetPath));
}
function normalizeExpandedAbsolutePath(value) {
	return path.isAbsolute(value) ? path.normalize(value) : value;
}
function absolutizeBundleMcpServer(params) {
	const next = { ...params.server };
	if (typeof next.cwd !== "string" && typeof next.workingDirectory !== "string") next.cwd = params.baseDir;
	const command = next.command;
	if (typeof command === "string") {
		const expanded = expandBundleRootPlaceholders(command, params.rootDir);
		next.command = isExplicitRelativePath(expanded) ? path.resolve(params.baseDir, expanded) : normalizeExpandedAbsolutePath(expanded);
	}
	const cwd = next.cwd;
	if (typeof cwd === "string") {
		const expanded = expandBundleRootPlaceholders(cwd, params.rootDir);
		next.cwd = path.isAbsolute(expanded) ? expanded : path.resolve(params.baseDir, expanded);
	}
	const workingDirectory = next.workingDirectory;
	if (typeof workingDirectory === "string") {
		const expanded = expandBundleRootPlaceholders(workingDirectory, params.rootDir);
		next.workingDirectory = path.isAbsolute(expanded) ? path.normalize(expanded) : path.resolve(params.baseDir, expanded);
	}
	if (Array.isArray(next.args)) next.args = next.args.map((entry) => {
		if (typeof entry !== "string") return entry;
		const expanded = expandBundleRootPlaceholders(entry, params.rootDir);
		if (!isExplicitRelativePath(expanded)) return normalizeExpandedAbsolutePath(expanded);
		return path.resolve(params.baseDir, expanded);
	});
	if (isRecord(next.env)) next.env = Object.fromEntries(Object.entries(next.env).map(([key, value]) => [key, typeof value === "string" ? normalizeExpandedAbsolutePath(expandBundleRootPlaceholders(value, params.rootDir)) : value]));
	return next;
}
function loadBundleFileBackedMcpConfig(params) {
	const rootDir = normalizeBundlePath(params.rootDir);
	const absolutePath = path.resolve(rootDir, params.relativePath);
	const opened = openBoundaryFileSync({
		absolutePath,
		rootPath: rootDir,
		boundaryLabel: "plugin root",
		rejectHardlinks: true
	});
	if (!opened.ok) return { mcpServers: {} };
	try {
		if (!fs.fstatSync(opened.fd).isFile()) return { mcpServers: {} };
		const servers = extractMcpServerMap(JSON.parse(fs.readFileSync(opened.fd, "utf-8")));
		const baseDir = normalizeBundlePath(path.dirname(absolutePath));
		return { mcpServers: Object.fromEntries(Object.entries(servers).map(([serverName, server]) => [serverName, absolutizeBundleMcpServer({
			rootDir,
			baseDir,
			server
		})])) };
	} finally {
		fs.closeSync(opened.fd);
	}
}
function loadBundleInlineMcpConfig(params) {
	if (!isRecord(params.raw.mcpServers)) return { mcpServers: {} };
	const baseDir = normalizeBundlePath(params.baseDir);
	const servers = extractMcpServerMap(params.raw.mcpServers);
	return { mcpServers: Object.fromEntries(Object.entries(servers).map(([serverName, server]) => [serverName, absolutizeBundleMcpServer({
		rootDir: baseDir,
		baseDir,
		server
	})])) };
}
function loadBundleMcpConfig(params) {
	const manifestRelativePath = MANIFEST_PATH_BY_FORMAT[params.bundleFormat];
	const manifestLoaded = readBundleJsonObject({
		rootDir: params.rootDir,
		relativePath: manifestRelativePath,
		onOpenFailure: (failure) => resolveBundleJsonOpenFailure({
			failure,
			relativePath: manifestRelativePath,
			allowMissing: params.bundleFormat === "claude"
		})
	});
	if (!manifestLoaded.ok) return {
		config: { mcpServers: {} },
		diagnostics: [manifestLoaded.error]
	};
	let merged = { mcpServers: {} };
	const filePaths = resolveBundleMcpConfigPaths({
		raw: manifestLoaded.raw,
		rootDir: params.rootDir,
		bundleFormat: params.bundleFormat
	});
	for (const relativePath of filePaths) merged = applyMergePatch(merged, loadBundleFileBackedMcpConfig({
		rootDir: params.rootDir,
		relativePath
	}));
	merged = applyMergePatch(merged, loadBundleInlineMcpConfig({
		raw: manifestLoaded.raw,
		baseDir: params.rootDir
	}));
	return {
		config: merged,
		diagnostics: []
	};
}
function inspectBundleMcpRuntimeSupport(params) {
	const support = inspectBundleServerRuntimeSupport({
		loaded: loadBundleMcpConfig(params),
		resolveServers: (config) => config.mcpServers
	});
	return {
		hasSupportedStdioServer: support.hasSupportedServer,
		supportedServerNames: support.supportedServerNames,
		unsupportedServerNames: support.unsupportedServerNames,
		diagnostics: support.diagnostics
	};
}
function loadEnabledBundleMcpConfig(params) {
	return loadEnabledBundleConfig({
		workspaceDir: params.workspaceDir,
		cfg: params.cfg,
		createEmptyConfig: () => ({ mcpServers: {} }),
		loadBundleConfig: loadBundleMcpConfig,
		createDiagnostic: (pluginId, message) => ({
			pluginId,
			message
		})
	});
}
//#endregion
//#region src/plugins/loader.ts
const CLI_METADATA_ENTRY_BASENAMES = [
	"cli-metadata.ts",
	"cli-metadata.js",
	"cli-metadata.mjs",
	"cli-metadata.cjs"
];
function resolveDreamingSidecarEngineId(params) {
	const normalizedMemorySlot = normalizeLowercaseStringOrEmpty(params.memorySlot);
	if (!normalizedMemorySlot || normalizedMemorySlot === "none" || normalizedMemorySlot === "memory-core") return null;
	return resolveMemoryDreamingConfig({
		pluginConfig: resolveMemoryDreamingPluginConfig(params.cfg),
		cfg: params.cfg
	}).enabled ? DEFAULT_MEMORY_DREAMING_PLUGIN_ID : null;
}
var PluginLoadFailureError = class extends Error {
	constructor(registry) {
		const failedPlugins = registry.plugins.filter((entry) => entry.status === "error");
		const summary = failedPlugins.map((entry) => `${entry.id}: ${entry.error ?? "unknown plugin load error"}`).join("; ");
		super(`plugin load failed: ${summary}`);
		this.name = "PluginLoadFailureError";
		this.pluginIds = failedPlugins.map((entry) => entry.id);
		this.registry = registry;
	}
};
var PluginLoadReentryError = class extends Error {
	constructor(cacheKey) {
		super(`plugin load reentry detected for cache key: ${cacheKey}`);
		this.name = "PluginLoadReentryError";
		this.cacheKey = cacheKey;
	}
};
let pluginRegistryCacheEntryCap = 128;
const registryCache = /* @__PURE__ */ new Map();
const inFlightPluginRegistryLoads = /* @__PURE__ */ new Set();
const openAllowlistWarningCache = /* @__PURE__ */ new Set();
const LAZY_RUNTIME_REFLECTION_KEYS = [
	"version",
	"config",
	"agent",
	"subagent",
	"system",
	"media",
	"tts",
	"stt",
	"channel",
	"events",
	"logging",
	"state",
	"modelAuth"
];
const defaultLogger = () => createSubsystemLogger("plugins");
function shouldProfilePluginLoader() {
	return process.env.ENCLAWED_PLUGIN_LOAD_PROFILE === "1";
}
function profilePluginLoaderSync(params) {
	if (!shouldProfilePluginLoader()) return params.run();
	const startMs = performance.now();
	try {
		return params.run();
	} finally {
		const elapsedMs = performance.now() - startMs;
		console.error(`[plugin-load-profile] phase=${params.phase} plugin=${params.pluginId ?? "(core)"} elapsedMs=${elapsedMs.toFixed(1)} source=${params.source}`);
	}
}
function isPromiseLike(value) {
	return (typeof value === "object" || typeof value === "function") && value !== null && typeof value.then === "function";
}
function snapshotPluginRegistry(registry) {
	return {
		arrays: {
			tools: [...registry.tools],
			hooks: [...registry.hooks],
			typedHooks: [...registry.typedHooks],
			channels: [...registry.channels],
			channelSetups: [...registry.channelSetups],
			providers: [...registry.providers],
			cliBackends: [...registry.cliBackends ?? []],
			textTransforms: [...registry.textTransforms],
			speechProviders: [...registry.speechProviders],
			realtimeTranscriptionProviders: [...registry.realtimeTranscriptionProviders],
			realtimeVoiceProviders: [...registry.realtimeVoiceProviders],
			mediaUnderstandingProviders: [...registry.mediaUnderstandingProviders],
			imageGenerationProviders: [...registry.imageGenerationProviders],
			videoGenerationProviders: [...registry.videoGenerationProviders],
			musicGenerationProviders: [...registry.musicGenerationProviders],
			webFetchProviders: [...registry.webFetchProviders],
			webSearchProviders: [...registry.webSearchProviders],
			memoryEmbeddingProviders: [...registry.memoryEmbeddingProviders],
			agentHarnesses: [...registry.agentHarnesses],
			httpRoutes: [...registry.httpRoutes],
			cliRegistrars: [...registry.cliRegistrars],
			reloads: [...registry.reloads ?? []],
			nodeHostCommands: [...registry.nodeHostCommands ?? []],
			securityAuditCollectors: [...registry.securityAuditCollectors ?? []],
			services: [...registry.services],
			commands: [...registry.commands],
			conversationBindingResolvedHandlers: [...registry.conversationBindingResolvedHandlers],
			diagnostics: [...registry.diagnostics]
		},
		gatewayHandlers: { ...registry.gatewayHandlers },
		gatewayMethodScopes: { ...registry.gatewayMethodScopes }
	};
}
function restorePluginRegistry(registry, snapshot) {
	registry.tools = snapshot.arrays.tools;
	registry.hooks = snapshot.arrays.hooks;
	registry.typedHooks = snapshot.arrays.typedHooks;
	registry.channels = snapshot.arrays.channels;
	registry.channelSetups = snapshot.arrays.channelSetups;
	registry.providers = snapshot.arrays.providers;
	registry.cliBackends = snapshot.arrays.cliBackends;
	registry.textTransforms = snapshot.arrays.textTransforms;
	registry.speechProviders = snapshot.arrays.speechProviders;
	registry.realtimeTranscriptionProviders = snapshot.arrays.realtimeTranscriptionProviders;
	registry.realtimeVoiceProviders = snapshot.arrays.realtimeVoiceProviders;
	registry.mediaUnderstandingProviders = snapshot.arrays.mediaUnderstandingProviders;
	registry.imageGenerationProviders = snapshot.arrays.imageGenerationProviders;
	registry.videoGenerationProviders = snapshot.arrays.videoGenerationProviders;
	registry.musicGenerationProviders = snapshot.arrays.musicGenerationProviders;
	registry.webFetchProviders = snapshot.arrays.webFetchProviders;
	registry.webSearchProviders = snapshot.arrays.webSearchProviders;
	registry.memoryEmbeddingProviders = snapshot.arrays.memoryEmbeddingProviders;
	registry.agentHarnesses = snapshot.arrays.agentHarnesses;
	registry.httpRoutes = snapshot.arrays.httpRoutes;
	registry.cliRegistrars = snapshot.arrays.cliRegistrars;
	registry.reloads = snapshot.arrays.reloads;
	registry.nodeHostCommands = snapshot.arrays.nodeHostCommands;
	registry.securityAuditCollectors = snapshot.arrays.securityAuditCollectors;
	registry.services = snapshot.arrays.services;
	registry.commands = snapshot.arrays.commands;
	registry.conversationBindingResolvedHandlers = snapshot.arrays.conversationBindingResolvedHandlers;
	registry.diagnostics = snapshot.arrays.diagnostics;
	registry.gatewayHandlers = snapshot.gatewayHandlers;
	registry.gatewayMethodScopes = snapshot.gatewayMethodScopes;
}
function createGuardedPluginRegistrationApi(api) {
	let closed = false;
	return {
		api: new Proxy(api, { get(target, prop, receiver) {
			const value = Reflect.get(target, prop, receiver);
			if (typeof value !== "function") return value;
			return (...args) => {
				if (closed) return;
				return Reflect.apply(value, target, args);
			};
		} }),
		close: () => {
			closed = true;
		}
	};
}
function runPluginRegisterSync(register, api) {
	const guarded = createGuardedPluginRegistrationApi(api);
	try {
		const result = register(guarded.api);
		if (isPromiseLike(result)) {
			Promise.resolve(result).catch(() => {});
			throw new Error("plugin register must be synchronous");
		}
	} finally {
		guarded.close();
	}
}
/**
* On Windows, the Node.js ESM loader requires absolute paths to be expressed
* as file:// URLs (e.g. file:///C:/Users/...). Raw drive-letter paths like
* C:\... are rejected with ERR_UNSUPPORTED_ESM_URL_SCHEME because the loader
* mistakes the drive letter for an unknown URL scheme.
*
* This helper converts Windows absolute import specifiers to file:// URLs and
* leaves everything else unchanged.
*/
function toSafeImportPath(specifier) {
	if (process.platform !== "win32") return specifier;
	if (specifier.startsWith("file://")) return specifier;
	if (path.win32.isAbsolute(specifier)) {
		const normalizedSpecifier = specifier.replaceAll("\\", "/");
		if (normalizedSpecifier.startsWith("//")) return new URL(`file:${encodeURI(normalizedSpecifier)}`).href;
		return new URL(`file:///${encodeURI(normalizedSpecifier)}`).href;
	}
	return specifier;
}
function createPluginJitiLoader(options) {
	const jitiLoaders = /* @__PURE__ */ new Map();
	return (modulePath) => {
		const tryNative = shouldPreferNativeJiti(modulePath);
		const aliasMap = buildPluginLoaderAliasMap(modulePath, process.argv[1], import.meta.url, options.pluginSdkResolution);
		return getCachedPluginJitiLoader({
			cache: jitiLoaders,
			modulePath,
			importerUrl: import.meta.url,
			jitiFilename: import.meta.url,
			aliasMap,
			tryNative
		});
	};
}
function getCachedPluginRegistry(cacheKey) {
	const cached = registryCache.get(cacheKey);
	if (!cached) return;
	registryCache.delete(cacheKey);
	registryCache.set(cacheKey, cached);
	return cached;
}
function setCachedPluginRegistry(cacheKey, state) {
	if (registryCache.has(cacheKey)) registryCache.delete(cacheKey);
	registryCache.set(cacheKey, state);
	while (registryCache.size > pluginRegistryCacheEntryCap) {
		const oldestKey = registryCache.keys().next().value;
		if (!oldestKey) break;
		registryCache.delete(oldestKey);
	}
}
function buildCacheKey(params) {
	const { roots, loadPaths } = resolvePluginCacheInputs({
		workspaceDir: params.workspaceDir,
		loadPaths: params.plugins.loadPaths,
		env: params.env
	});
	const installs = Object.fromEntries(Object.entries(params.installs ?? {}).map(([pluginId, install]) => [pluginId, {
		...install,
		installPath: typeof install.installPath === "string" ? resolveUserPath(install.installPath, params.env) : install.installPath,
		sourcePath: typeof install.sourcePath === "string" ? resolveUserPath(install.sourcePath, params.env) : install.sourcePath
	}]));
	const scopeKey = serializePluginIdScope(params.onlyPluginIds);
	const setupOnlyKey = params.includeSetupOnlyChannelPlugins === true ? "setup-only" : "runtime";
	const startupChannelMode = params.preferSetupRuntimeForChannelPlugins === true ? "prefer-setup" : "full";
	const moduleLoadMode = params.loadModules === false ? "manifest-only" : "load-modules";
	const runtimeSubagentMode = params.runtimeSubagentMode ?? "default";
	const gatewayMethodsKey = JSON.stringify(params.coreGatewayMethodNames ?? []);
	return `${roots.workspace ?? ""}::${roots.global ?? ""}::${roots.stock ?? ""}::${JSON.stringify({
		...params.plugins,
		installs,
		loadPaths,
		activationMetadataKey: params.activationMetadataKey ?? ""
	})}::${scopeKey}::${setupOnlyKey}::${startupChannelMode}::${moduleLoadMode}::${runtimeSubagentMode}::${params.pluginSdkResolution ?? "auto"}::${gatewayMethodsKey}`;
}
function matchesScopedPluginRequest(params) {
	const scopedIds = params.onlyPluginIdSet;
	if (!scopedIds) return true;
	return scopedIds.has(params.pluginId);
}
function resolveRuntimeSubagentMode(runtimeOptions) {
	if (runtimeOptions?.allowGatewaySubagentBinding === true) return "gateway-bindable";
	if (runtimeOptions?.subagent) return "explicit";
	return "default";
}
function buildActivationMetadataHash(params) {
	const enabledSourceChannels = Object.entries(params.activationSource.rootConfig?.channels ?? {}).filter(([, value]) => {
		if (!value || typeof value !== "object" || Array.isArray(value)) return false;
		return value.enabled === true;
	}).map(([channelId]) => channelId).toSorted((left, right) => left.localeCompare(right));
	const pluginEntryStates = Object.entries(params.activationSource.plugins.entries).map(([pluginId, entry]) => [pluginId, entry?.enabled ?? null]).toSorted(([left], [right]) => left.localeCompare(right));
	const autoEnableReasonEntries = Object.entries(params.autoEnabledReasons).map(([pluginId, reasons]) => [pluginId, [...reasons]]).toSorted(([left], [right]) => left.localeCompare(right));
	return createHash("sha256").update(JSON.stringify({
		enabled: params.activationSource.plugins.enabled,
		allow: params.activationSource.plugins.allow,
		deny: params.activationSource.plugins.deny,
		memorySlot: params.activationSource.plugins.slots.memory,
		entries: pluginEntryStates,
		enabledChannels: enabledSourceChannels,
		autoEnabledReasons: autoEnableReasonEntries
	})).digest("hex");
}
function hasExplicitCompatibilityInputs(options) {
	return options.config !== void 0 || options.activationSourceConfig !== void 0 || options.autoEnabledReasons !== void 0 || options.workspaceDir !== void 0 || options.env !== void 0 || hasExplicitPluginIdScope(options.onlyPluginIds) || options.runtimeOptions !== void 0 || options.pluginSdkResolution !== void 0 || options.coreGatewayHandlers !== void 0 || options.includeSetupOnlyChannelPlugins === true || options.preferSetupRuntimeForChannelPlugins === true || options.loadModules === false;
}
function resolvePluginLoadCacheContext(options = {}) {
	const env = options.env ?? process.env;
	const cfg = applyTestPluginDefaults(options.config ?? {}, env);
	const activationSourceConfig = options.activationSourceConfig ?? options.config ?? {};
	const normalized = normalizePluginsConfig(cfg.plugins);
	const activationSource = createPluginActivationSource({ config: activationSourceConfig });
	const onlyPluginIds = normalizePluginIdScope(options.onlyPluginIds);
	const includeSetupOnlyChannelPlugins = options.includeSetupOnlyChannelPlugins === true;
	const preferSetupRuntimeForChannelPlugins = options.preferSetupRuntimeForChannelPlugins === true;
	const runtimeSubagentMode = resolveRuntimeSubagentMode(options.runtimeOptions);
	const coreGatewayMethodNames = Object.keys(options.coreGatewayHandlers ?? {}).toSorted();
	const cacheKey = buildCacheKey({
		workspaceDir: options.workspaceDir,
		plugins: normalized,
		activationMetadataKey: buildActivationMetadataHash({
			activationSource,
			autoEnabledReasons: options.autoEnabledReasons ?? {}
		}),
		installs: cfg.plugins?.installs,
		env,
		onlyPluginIds,
		includeSetupOnlyChannelPlugins,
		preferSetupRuntimeForChannelPlugins,
		loadModules: options.loadModules,
		runtimeSubagentMode,
		pluginSdkResolution: options.pluginSdkResolution,
		coreGatewayMethodNames
	});
	return {
		env,
		cfg,
		normalized,
		activationSourceConfig,
		activationSource,
		autoEnabledReasons: options.autoEnabledReasons ?? {},
		onlyPluginIds,
		includeSetupOnlyChannelPlugins,
		preferSetupRuntimeForChannelPlugins,
		shouldActivate: options.activate !== false,
		shouldLoadModules: options.loadModules !== false,
		runtimeSubagentMode,
		cacheKey
	};
}
function getCompatibleActivePluginRegistry(options = {}) {
	const activeRegistry = getActivePluginRegistry() ?? void 0;
	if (!activeRegistry) return;
	if (!hasExplicitCompatibilityInputs(options)) return activeRegistry;
	const activeCacheKey = getActivePluginRegistryKey();
	if (!activeCacheKey) return;
	const loadContext = resolvePluginLoadCacheContext(options);
	if (loadContext.cacheKey === activeCacheKey) return activeRegistry;
	if (loadContext.runtimeSubagentMode === "default" && getActivePluginRuntimeSubagentMode() === "gateway-bindable") {
		if (resolvePluginLoadCacheContext({
			...options,
			runtimeOptions: {
				...options.runtimeOptions,
				allowGatewaySubagentBinding: true
			}
		}).cacheKey === activeCacheKey) return activeRegistry;
	}
}
function resolveRuntimePluginRegistry(options) {
	if (!options || !hasExplicitCompatibilityInputs(options)) return getCompatibleActivePluginRegistry();
	const compatible = getCompatibleActivePluginRegistry(options);
	if (compatible) return compatible;
	if (isPluginRegistryLoadInFlight(options)) return;
	return loadEnclawedPlugins(options);
}
function resolvePluginRegistryLoadCacheKey(options = {}) {
	return resolvePluginLoadCacheContext(options).cacheKey;
}
function isPluginRegistryLoadInFlight(options = {}) {
	return inFlightPluginRegistryLoads.has(resolvePluginRegistryLoadCacheKey(options));
}
function resolveCompatibleRuntimePluginRegistry(options) {
	return getCompatibleActivePluginRegistry(options);
}
function validatePluginConfig(params) {
	const schema = params.schema;
	if (!schema) return {
		ok: true,
		value: params.value
	};
	const result = validateJsonSchemaValue({
		schema,
		cacheKey: params.cacheKey ?? JSON.stringify(schema),
		value: params.value ?? {},
		applyDefaults: true
	});
	if (result.ok) return {
		ok: true,
		value: result.value
	};
	return {
		ok: false,
		errors: result.errors.map((error) => error.text)
	};
}
function resolvePluginModuleExport(moduleExport) {
	const resolved = unwrapDefaultModuleExport(moduleExport);
	if (typeof resolved === "function") return { register: resolved };
	if (resolved && typeof resolved === "object") {
		const def = resolved;
		return {
			definition: def,
			register: def.register ?? def.activate
		};
	}
	return {};
}
function mergeChannelPluginSection(baseValue, overrideValue) {
	if (baseValue && overrideValue && typeof baseValue === "object" && typeof overrideValue === "object") {
		const merged = { ...baseValue };
		for (const [key, value] of Object.entries(overrideValue)) if (value !== void 0) merged[key] = value;
		return { ...merged };
	}
	return overrideValue ?? baseValue;
}
function mergeSetupRuntimeChannelPlugin(runtimePlugin, setupPlugin) {
	return {
		...runtimePlugin,
		...setupPlugin,
		meta: mergeChannelPluginSection(runtimePlugin.meta, setupPlugin.meta),
		capabilities: mergeChannelPluginSection(runtimePlugin.capabilities, setupPlugin.capabilities),
		commands: mergeChannelPluginSection(runtimePlugin.commands, setupPlugin.commands),
		doctor: mergeChannelPluginSection(runtimePlugin.doctor, setupPlugin.doctor),
		reload: mergeChannelPluginSection(runtimePlugin.reload, setupPlugin.reload),
		config: mergeChannelPluginSection(runtimePlugin.config, setupPlugin.config),
		setup: mergeChannelPluginSection(runtimePlugin.setup, setupPlugin.setup),
		messaging: mergeChannelPluginSection(runtimePlugin.messaging, setupPlugin.messaging),
		actions: mergeChannelPluginSection(runtimePlugin.actions, setupPlugin.actions),
		secrets: mergeChannelPluginSection(runtimePlugin.secrets, setupPlugin.secrets)
	};
}
function resolveBundledRuntimeChannelRegistration(moduleExport) {
	const resolved = unwrapDefaultModuleExport(moduleExport);
	if (!resolved || typeof resolved !== "object") return {};
	const entryRecord = resolved;
	if (entryRecord.kind !== "bundled-channel-entry" || typeof entryRecord.id !== "string" || typeof entryRecord.loadChannelPlugin !== "function") return {};
	return {
		id: entryRecord.id,
		loadChannelPlugin: entryRecord.loadChannelPlugin,
		...typeof entryRecord.loadChannelSecrets === "function" ? { loadChannelSecrets: entryRecord.loadChannelSecrets } : {},
		...typeof entryRecord.setChannelRuntime === "function" ? { setChannelRuntime: entryRecord.setChannelRuntime } : {}
	};
}
function loadBundledRuntimeChannelPlugin(params) {
	if (typeof params.registration.loadChannelPlugin !== "function") return {};
	try {
		const loadedPlugin = params.registration.loadChannelPlugin();
		const loadedSecrets = params.registration.loadChannelSecrets?.();
		if (!loadedPlugin || typeof loadedPlugin !== "object") return {};
		const mergedSecrets = mergeChannelPluginSection(loadedPlugin.secrets, loadedSecrets);
		return { plugin: {
			...loadedPlugin,
			...mergedSecrets !== void 0 ? { secrets: mergedSecrets } : {}
		} };
	} catch (err) {
		return { loadError: err };
	}
}
function resolveSetupChannelRegistration(moduleExport) {
	const resolved = unwrapDefaultModuleExport(moduleExport);
	if (!resolved || typeof resolved !== "object") return {};
	const setupEntryRecord = resolved;
	if (setupEntryRecord.kind === "bundled-channel-setup-entry" && typeof setupEntryRecord.loadSetupPlugin === "function") try {
		const loadedPlugin = setupEntryRecord.loadSetupPlugin();
		const loadedSecrets = typeof setupEntryRecord.loadSetupSecrets === "function" ? setupEntryRecord.loadSetupSecrets() : void 0;
		if (loadedPlugin && typeof loadedPlugin === "object") {
			const mergedSecrets = mergeChannelPluginSection(loadedPlugin.secrets, loadedSecrets);
			return {
				plugin: {
					...loadedPlugin,
					...mergedSecrets !== void 0 ? { secrets: mergedSecrets } : {}
				},
				usesBundledSetupContract: true,
				...typeof setupEntryRecord.setChannelRuntime === "function" ? { setChannelRuntime: setupEntryRecord.setChannelRuntime } : {}
			};
		}
	} catch (err) {
		return { loadError: err };
	}
	const setup = resolved;
	if (!setup.plugin || typeof setup.plugin !== "object") return {};
	return { plugin: setup.plugin };
}
function shouldLoadChannelPluginInSetupRuntime(params) {
	if (!params.setupSource || params.manifestChannels.length === 0) return false;
	if (params.preferSetupRuntimeForChannelPlugins && params.startupDeferConfiguredChannelFullLoadUntilAfterListen === true) return true;
	return !params.manifestChannels.some((channelId) => isChannelConfigured(params.cfg, channelId, params.env));
}
function createPluginRecord(params) {
	return {
		id: params.id,
		name: params.name ?? params.id,
		description: params.description,
		version: params.version,
		format: params.format ?? "enclawed",
		bundleFormat: params.bundleFormat,
		bundleCapabilities: params.bundleCapabilities,
		source: params.source,
		rootDir: params.rootDir,
		origin: params.origin,
		workspaceDir: params.workspaceDir,
		enabled: params.enabled,
		explicitlyEnabled: params.activationState?.explicitlyEnabled,
		activated: params.activationState?.activated,
		activationSource: params.activationState?.source,
		activationReason: params.activationState?.reason,
		status: params.enabled ? "loaded" : "disabled",
		toolNames: [],
		hookNames: [],
		channelIds: [],
		cliBackendIds: [],
		providerIds: [],
		speechProviderIds: [],
		realtimeTranscriptionProviderIds: [],
		realtimeVoiceProviderIds: [],
		mediaUnderstandingProviderIds: [],
		imageGenerationProviderIds: [],
		videoGenerationProviderIds: [],
		musicGenerationProviderIds: [],
		webFetchProviderIds: [],
		webSearchProviderIds: [],
		contextEngineIds: [],
		memoryEmbeddingProviderIds: [],
		agentHarnessIds: [],
		gatewayMethods: [],
		cliCommands: [],
		services: [],
		commands: [],
		httpRoutes: 0,
		hookCount: 0,
		configSchema: params.configSchema,
		configUiHints: void 0,
		configJsonSchema: void 0,
		contracts: params.contracts
	};
}
function markPluginActivationDisabled(record, reason) {
	record.activated = false;
	record.activationSource = "disabled";
	record.activationReason = reason;
}
function formatAutoEnabledActivationReason(reasons) {
	if (!reasons || reasons.length === 0) return;
	return reasons.join("; ");
}
function recordPluginError(params) {
	const errorText = process.env.ENCLAWED_PLUGIN_LOADER_DEBUG_STACKS === "1" && params.error instanceof Error && typeof params.error.stack === "string" ? params.error.stack : String(params.error);
	const deprecatedApiHint = errorText.includes("api.registerHttpHandler") && errorText.includes("is not a function") ? "deprecated api.registerHttpHandler(...) was removed; use api.registerHttpRoute(...) for plugin-owned routes or registerPluginHttpRoute(...) for dynamic lifecycle routes" : null;
	const displayError = deprecatedApiHint ? `${deprecatedApiHint} (${errorText})` : errorText;
	params.logger.error(`${params.logPrefix}${displayError}`);
	params.record.status = "error";
	params.record.error = displayError;
	params.record.failedAt = /* @__PURE__ */ new Date();
	params.record.failurePhase = params.phase;
	params.registry.plugins.push(params.record);
	params.seenIds.set(params.pluginId, params.origin);
	params.registry.diagnostics.push({
		level: "error",
		pluginId: params.record.id,
		source: params.record.source,
		message: `${params.diagnosticMessagePrefix}${displayError}`
	});
}
function formatPluginFailureSummary(failedPlugins) {
	const grouped = /* @__PURE__ */ new Map();
	for (const plugin of failedPlugins) {
		const phase = plugin.failurePhase ?? "load";
		const ids = grouped.get(phase);
		if (ids) {
			ids.push(plugin.id);
			continue;
		}
		grouped.set(phase, [plugin.id]);
	}
	return [...grouped.entries()].map(([phase, ids]) => `${phase}: ${ids.join(", ")}`).join("; ");
}
function pushDiagnostics(diagnostics, append) {
	diagnostics.push(...append);
}
function maybeThrowOnPluginLoadError(registry, throwOnLoadError) {
	if (!throwOnLoadError) return;
	if (!registry.plugins.some((entry) => entry.status === "error")) return;
	throw new PluginLoadFailureError(registry);
}
function createPathMatcher() {
	return {
		exact: /* @__PURE__ */ new Set(),
		dirs: []
	};
}
function addPathToMatcher(matcher, rawPath, env = process.env) {
	const trimmed = rawPath.trim();
	if (!trimmed) return;
	const resolved = resolveUserPath(trimmed, env);
	if (!resolved) return;
	if (matcher.exact.has(resolved) || matcher.dirs.includes(resolved)) return;
	if (safeStatSync(resolved)?.isDirectory()) {
		matcher.dirs.push(resolved);
		return;
	}
	matcher.exact.add(resolved);
}
function matchesPathMatcher(matcher, sourcePath) {
	if (matcher.exact.has(sourcePath)) return true;
	return matcher.dirs.some((dirPath) => isPathInside(dirPath, sourcePath));
}
function buildProvenanceIndex(params) {
	const loadPathMatcher = createPathMatcher();
	for (const loadPath of params.normalizedLoadPaths) addPathToMatcher(loadPathMatcher, loadPath, params.env);
	const installRules = /* @__PURE__ */ new Map();
	const installs = params.config.plugins?.installs ?? {};
	for (const [pluginId, install] of Object.entries(installs)) {
		const rule = {
			trackedWithoutPaths: false,
			matcher: createPathMatcher()
		};
		const trackedPaths = [install.installPath, install.sourcePath].map((entry) => normalizeOptionalString(entry)).filter((entry) => Boolean(entry));
		if (trackedPaths.length === 0) rule.trackedWithoutPaths = true;
		else for (const trackedPath of trackedPaths) addPathToMatcher(rule.matcher, trackedPath, params.env);
		installRules.set(pluginId, rule);
	}
	return {
		loadPathMatcher,
		installRules
	};
}
function isTrackedByProvenance(params) {
	const sourcePath = resolveUserPath(params.source, params.env);
	const installRule = params.index.installRules.get(params.pluginId);
	if (installRule) {
		if (installRule.trackedWithoutPaths) return true;
		if (matchesPathMatcher(installRule.matcher, sourcePath)) return true;
	}
	return matchesPathMatcher(params.index.loadPathMatcher, sourcePath);
}
function matchesExplicitInstallRule(params) {
	const sourcePath = resolveUserPath(params.source, params.env);
	const installRule = params.index.installRules.get(params.pluginId);
	if (!installRule || installRule.trackedWithoutPaths) return false;
	return matchesPathMatcher(installRule.matcher, sourcePath);
}
function resolveCandidateDuplicateRank(params) {
	const pluginId = params.manifestByRoot.get(params.candidate.rootDir)?.id;
	const isExplicitInstall = params.candidate.origin === "global" && pluginId !== void 0 && matchesExplicitInstallRule({
		pluginId,
		source: params.candidate.source,
		index: params.provenance,
		env: params.env
	});
	if (params.candidate.origin === "config") return 0;
	if (params.candidate.origin === "global" && isExplicitInstall) return 1;
	if (params.candidate.origin === "bundled") return 2;
	if (params.candidate.origin === "workspace") return 3;
	return 4;
}
function compareDuplicateCandidateOrder(params) {
	const leftPluginId = params.manifestByRoot.get(params.left.rootDir)?.id;
	const rightPluginId = params.manifestByRoot.get(params.right.rootDir)?.id;
	if (!leftPluginId || leftPluginId !== rightPluginId) return 0;
	return resolveCandidateDuplicateRank({
		candidate: params.left,
		manifestByRoot: params.manifestByRoot,
		provenance: params.provenance,
		env: params.env
	}) - resolveCandidateDuplicateRank({
		candidate: params.right,
		manifestByRoot: params.manifestByRoot,
		provenance: params.provenance,
		env: params.env
	});
}
function warnWhenAllowlistIsOpen(params) {
	if (!params.emitWarning) return;
	if (!params.pluginsEnabled) return;
	if (params.allow.length > 0) return;
	const autoDiscoverable = params.discoverablePlugins.filter((entry) => entry.origin === "workspace" || entry.origin === "global");
	if (autoDiscoverable.length === 0) return;
	if (openAllowlistWarningCache.has(params.warningCacheKey)) return;
	const preview = autoDiscoverable.slice(0, 6).map((entry) => `${entry.id} (${entry.source})`).join(", ");
	const extra = autoDiscoverable.length > 6 ? ` (+${autoDiscoverable.length - 6} more)` : "";
	openAllowlistWarningCache.add(params.warningCacheKey);
	params.logger.warn(`[plugins] plugins.allow is empty; discovered non-bundled plugins may auto-load: ${preview}${extra}. Set plugins.allow to explicit trusted ids.`);
}
function warnAboutUntrackedLoadedPlugins(params) {
	const allowSet = new Set(params.allowlist);
	for (const plugin of params.registry.plugins) {
		if (plugin.status !== "loaded" || plugin.origin === "bundled") continue;
		if (allowSet.has(plugin.id)) continue;
		if (isTrackedByProvenance({
			pluginId: plugin.id,
			source: plugin.source,
			index: params.provenance,
			env: params.env
		})) continue;
		const message = "loaded without install/load-path provenance; treat as untracked local code and pin trust via plugins.allow or install records";
		params.registry.diagnostics.push({
			level: "warn",
			pluginId: plugin.id,
			source: plugin.source,
			message
		});
		if (params.emitWarning) params.logger.warn(`[plugins] ${plugin.id}: ${message} (${plugin.source})`);
	}
}
function activatePluginRegistry(registry, cacheKey, runtimeSubagentMode, workspaceDir) {
	setActivePluginRegistry(registry, cacheKey, runtimeSubagentMode, workspaceDir);
	initializeGlobalHookRunner(registry);
}
function loadEnclawedPlugins(options = {}) {
	if (options.activate === false && options.cache !== false) throw new Error("loadEnclawedPlugins: activate:false requires cache:false to prevent command registry divergence");
	const { env, cfg, normalized, activationSource, autoEnabledReasons, onlyPluginIds, includeSetupOnlyChannelPlugins, preferSetupRuntimeForChannelPlugins, shouldActivate, shouldLoadModules, cacheKey, runtimeSubagentMode } = resolvePluginLoadCacheContext(options);
	const logger = options.logger ?? defaultLogger();
	const validateOnly = options.mode === "validate";
	const onlyPluginIdSet = createPluginIdScopeSet(onlyPluginIds);
	const cacheEnabled = options.cache !== false;
	if (cacheEnabled) {
		const cached = getCachedPluginRegistry(cacheKey);
		if (cached) {
			restoreRegisteredAgentHarnesses(cached.agentHarnesses);
			restoreRegisteredCompactionProviders(cached.compactionProviders);
			restoreRegisteredMemoryEmbeddingProviders(cached.memoryEmbeddingProviders);
			restoreMemoryPluginState({
				capability: cached.memoryCapability,
				corpusSupplements: cached.memoryCorpusSupplements,
				promptBuilder: cached.memoryPromptBuilder,
				promptSupplements: cached.memoryPromptSupplements,
				flushPlanResolver: cached.memoryFlushPlanResolver,
				runtime: cached.memoryRuntime
			});
			if (shouldActivate) activatePluginRegistry(cached.registry, cacheKey, runtimeSubagentMode, options.workspaceDir);
			return cached.registry;
		}
	}
	if (inFlightPluginRegistryLoads.has(cacheKey)) throw new PluginLoadReentryError(cacheKey);
	inFlightPluginRegistryLoads.add(cacheKey);
	try {
		if (shouldActivate) {
			clearAgentHarnesses();
			clearPluginCommands();
			clearPluginInteractiveHandlers();
			clearMemoryPluginState();
		}
		const getJiti = createPluginJitiLoader(options);
		let createPluginRuntimeFactory = null;
		const resolveCreatePluginRuntime = () => {
			if (createPluginRuntimeFactory) return createPluginRuntimeFactory;
			const runtimeModulePath = resolvePluginRuntimeModulePath({ pluginSdkResolution: options.pluginSdkResolution });
			if (!runtimeModulePath) throw new Error("Unable to resolve plugin runtime module");
			const safeRuntimePath = toSafeImportPath(runtimeModulePath);
			const runtimeModule = profilePluginLoaderSync({
				phase: "runtime-module",
				source: runtimeModulePath,
				run: () => getJiti(runtimeModulePath)(safeRuntimePath)
			});
			if (typeof runtimeModule.createPluginRuntime !== "function") throw new Error("Plugin runtime module missing createPluginRuntime export");
			createPluginRuntimeFactory = runtimeModule.createPluginRuntime;
			return createPluginRuntimeFactory;
		};
		let resolvedRuntime = null;
		const resolveRuntime = () => {
			resolvedRuntime ??= resolveCreatePluginRuntime()(options.runtimeOptions);
			return resolvedRuntime;
		};
		const lazyRuntimeReflectionKeySet = new Set(LAZY_RUNTIME_REFLECTION_KEYS);
		const resolveLazyRuntimeDescriptor = (prop) => {
			if (!lazyRuntimeReflectionKeySet.has(prop)) return Reflect.getOwnPropertyDescriptor(resolveRuntime(), prop);
			return {
				configurable: true,
				enumerable: true,
				get() {
					return Reflect.get(resolveRuntime(), prop);
				},
				set(value) {
					Reflect.set(resolveRuntime(), prop, value);
				}
			};
		};
		const { registry, createApi, rollbackPluginGlobalSideEffects, registerReload, registerNodeHostCommand, registerSecurityAuditCollector } = createPluginRegistry({
			logger,
			runtime: new Proxy({}, {
				get(_target, prop, receiver) {
					return Reflect.get(resolveRuntime(), prop, receiver);
				},
				set(_target, prop, value, receiver) {
					return Reflect.set(resolveRuntime(), prop, value, receiver);
				},
				has(_target, prop) {
					return lazyRuntimeReflectionKeySet.has(prop) || Reflect.has(resolveRuntime(), prop);
				},
				ownKeys() {
					return [...LAZY_RUNTIME_REFLECTION_KEYS];
				},
				getOwnPropertyDescriptor(_target, prop) {
					return resolveLazyRuntimeDescriptor(prop);
				},
				defineProperty(_target, prop, attributes) {
					return Reflect.defineProperty(resolveRuntime(), prop, attributes);
				},
				deleteProperty(_target, prop) {
					return Reflect.deleteProperty(resolveRuntime(), prop);
				},
				getPrototypeOf() {
					return Reflect.getPrototypeOf(resolveRuntime());
				}
			}),
			coreGatewayHandlers: options.coreGatewayHandlers,
			activateGlobalSideEffects: shouldActivate
		});
		const discovery = discoverEnclawedPlugins({
			workspaceDir: options.workspaceDir,
			extraPaths: normalized.loadPaths,
			cache: options.cache,
			env
		});
		const manifestRegistry = loadPluginManifestRegistry({
			config: cfg,
			workspaceDir: options.workspaceDir,
			cache: options.cache,
			env,
			candidates: discovery.candidates,
			diagnostics: discovery.diagnostics
		});
		pushDiagnostics(registry.diagnostics, manifestRegistry.diagnostics);
		warnWhenAllowlistIsOpen({
			emitWarning: shouldActivate,
			logger,
			pluginsEnabled: normalized.enabled,
			allow: normalized.allow,
			warningCacheKey: cacheKey,
			discoverablePlugins: manifestRegistry.plugins.filter((plugin) => !onlyPluginIdSet || onlyPluginIdSet.has(plugin.id)).map((plugin) => ({
				id: plugin.id,
				source: plugin.source,
				origin: plugin.origin
			}))
		});
		const provenance = buildProvenanceIndex({
			config: cfg,
			normalizedLoadPaths: normalized.loadPaths,
			env
		});
		const manifestByRoot = new Map(manifestRegistry.plugins.map((record) => [record.rootDir, record]));
		const orderedCandidates = [...discovery.candidates].toSorted((left, right) => {
			return compareDuplicateCandidateOrder({
				left,
				right,
				manifestByRoot,
				provenance,
				env
			});
		});
		const seenIds = /* @__PURE__ */ new Map();
		const memorySlot = normalized.slots.memory;
		let selectedMemoryPluginId = null;
		let memorySlotMatched = false;
		const dreamingEngineId = resolveDreamingSidecarEngineId({
			cfg,
			memorySlot
		});
		for (const candidate of orderedCandidates) {
			const manifestRecord = manifestByRoot.get(candidate.rootDir);
			if (!manifestRecord) continue;
			const pluginId = manifestRecord.id;
			if (!matchesScopedPluginRequest({
				onlyPluginIdSet,
				pluginId
			})) continue;
			const activationState = resolveEffectivePluginActivationState({
				id: pluginId,
				origin: candidate.origin,
				config: normalized,
				rootConfig: cfg,
				enabledByDefault: manifestRecord.enabledByDefault,
				activationSource,
				autoEnabledReason: formatAutoEnabledActivationReason(autoEnabledReasons[pluginId])
			});
			const existingOrigin = seenIds.get(pluginId);
			if (existingOrigin) {
				const record = createPluginRecord({
					id: pluginId,
					name: manifestRecord.name ?? pluginId,
					description: manifestRecord.description,
					version: manifestRecord.version,
					format: manifestRecord.format,
					bundleFormat: manifestRecord.bundleFormat,
					bundleCapabilities: manifestRecord.bundleCapabilities,
					source: candidate.source,
					rootDir: candidate.rootDir,
					origin: candidate.origin,
					workspaceDir: candidate.workspaceDir,
					enabled: false,
					activationState,
					configSchema: Boolean(manifestRecord.configSchema),
					contracts: manifestRecord.contracts
				});
				record.status = "disabled";
				record.error = `overridden by ${existingOrigin} plugin`;
				markPluginActivationDisabled(record, record.error);
				registry.plugins.push(record);
				continue;
			}
			const enableState = resolveEffectiveEnableState({
				id: pluginId,
				origin: candidate.origin,
				config: normalized,
				rootConfig: cfg,
				enabledByDefault: manifestRecord.enabledByDefault,
				activationSource
			});
			const entry = normalized.entries[pluginId];
			const record = createPluginRecord({
				id: pluginId,
				name: manifestRecord.name ?? pluginId,
				description: manifestRecord.description,
				version: manifestRecord.version,
				format: manifestRecord.format,
				bundleFormat: manifestRecord.bundleFormat,
				bundleCapabilities: manifestRecord.bundleCapabilities,
				source: candidate.source,
				rootDir: candidate.rootDir,
				origin: candidate.origin,
				workspaceDir: candidate.workspaceDir,
				enabled: enableState.enabled,
				activationState,
				configSchema: Boolean(manifestRecord.configSchema),
				contracts: manifestRecord.contracts
			});
			record.kind = manifestRecord.kind;
			record.configUiHints = manifestRecord.configUiHints;
			record.configJsonSchema = manifestRecord.configSchema;
			const pushPluginLoadError = (message) => {
				record.status = "error";
				record.error = message;
				record.failedAt = /* @__PURE__ */ new Date();
				record.failurePhase = "validation";
				registry.plugins.push(record);
				seenIds.set(pluginId, candidate.origin);
				registry.diagnostics.push({
					level: "error",
					pluginId: record.id,
					source: record.source,
					message: record.error
				});
			};
			const registrationMode = enableState.enabled ? !validateOnly && shouldLoadChannelPluginInSetupRuntime({
				manifestChannels: manifestRecord.channels,
				setupSource: manifestRecord.setupSource,
				startupDeferConfiguredChannelFullLoadUntilAfterListen: manifestRecord.startupDeferConfiguredChannelFullLoadUntilAfterListen,
				cfg,
				env,
				preferSetupRuntimeForChannelPlugins
			}) ? "setup-runtime" : "full" : includeSetupOnlyChannelPlugins && !validateOnly && onlyPluginIdSet && manifestRecord.channels.length > 0 ? "setup-only" : null;
			if (!registrationMode) {
				record.status = "disabled";
				record.error = enableState.reason;
				markPluginActivationDisabled(record, enableState.reason);
				registry.plugins.push(record);
				seenIds.set(pluginId, candidate.origin);
				continue;
			}
			if (!enableState.enabled) {
				record.status = "disabled";
				record.error = enableState.reason;
				markPluginActivationDisabled(record, enableState.reason);
			}
			if (record.format === "bundle") {
				const unsupportedCapabilities = (record.bundleCapabilities ?? []).filter((capability) => capability !== "skills" && capability !== "mcpServers" && capability !== "settings" && !((capability === "commands" || capability === "agents" || capability === "outputStyles" || capability === "lspServers") && (record.bundleFormat === "claude" || record.bundleFormat === "cursor")) && !(capability === "hooks" && (record.bundleFormat === "codex" || record.bundleFormat === "claude")));
				for (const capability of unsupportedCapabilities) registry.diagnostics.push({
					level: "warn",
					pluginId: record.id,
					source: record.source,
					message: `bundle capability detected but not wired into Enclawed yet: ${capability}`
				});
				if (enableState.enabled && record.rootDir && record.bundleFormat && (record.bundleCapabilities ?? []).includes("mcpServers")) {
					const runtimeSupport = inspectBundleMcpRuntimeSupport({
						pluginId: record.id,
						rootDir: record.rootDir,
						bundleFormat: record.bundleFormat
					});
					for (const message of runtimeSupport.diagnostics) registry.diagnostics.push({
						level: "warn",
						pluginId: record.id,
						source: record.source,
						message
					});
					if (runtimeSupport.unsupportedServerNames.length > 0) registry.diagnostics.push({
						level: "warn",
						pluginId: record.id,
						source: record.source,
						message: `bundle MCP servers use unsupported transports or incomplete configs (stdio only today): ${runtimeSupport.unsupportedServerNames.join(", ")}`
					});
				}
				registry.plugins.push(record);
				seenIds.set(pluginId, candidate.origin);
				continue;
			}
			if (registrationMode === "full" && candidate.origin === "bundled" && hasKind(manifestRecord.kind, "memory")) {
				if (pluginId !== dreamingEngineId) {
					const earlyMemoryDecision = resolveMemorySlotDecision({
						id: record.id,
						kind: manifestRecord.kind,
						slot: memorySlot,
						selectedId: selectedMemoryPluginId
					});
					if (!earlyMemoryDecision.enabled) {
						record.enabled = false;
						record.status = "disabled";
						record.error = earlyMemoryDecision.reason;
						markPluginActivationDisabled(record, earlyMemoryDecision.reason);
						registry.plugins.push(record);
						seenIds.set(pluginId, candidate.origin);
						continue;
					}
				}
			}
			if (!manifestRecord.configSchema) {
				pushPluginLoadError("missing config schema");
				continue;
			}
			if (!shouldLoadModules && registrationMode === "full") {
				const memoryDecision = resolveMemorySlotDecision({
					id: record.id,
					kind: record.kind,
					slot: memorySlot,
					selectedId: selectedMemoryPluginId
				});
				if (!memoryDecision.enabled && pluginId !== dreamingEngineId) {
					record.enabled = false;
					record.status = "disabled";
					record.error = memoryDecision.reason;
					markPluginActivationDisabled(record, memoryDecision.reason);
					registry.plugins.push(record);
					seenIds.set(pluginId, candidate.origin);
					continue;
				}
				if (memoryDecision.selected && hasKind(record.kind, "memory")) {
					selectedMemoryPluginId = record.id;
					memorySlotMatched = true;
					record.memorySlotSelected = true;
				}
			}
			const validatedConfig = validatePluginConfig({
				schema: manifestRecord.configSchema,
				cacheKey: manifestRecord.schemaCacheKey,
				value: entry?.config
			});
			if (!validatedConfig.ok) {
				logger.error(`[plugins] ${record.id} invalid config: ${validatedConfig.errors?.join(", ")}`);
				pushPluginLoadError(`invalid config: ${validatedConfig.errors?.join(", ")}`);
				continue;
			}
			if (!shouldLoadModules) {
				registry.plugins.push(record);
				seenIds.set(pluginId, candidate.origin);
				continue;
			}
			const pluginRoot = safeRealpathOrResolve(candidate.rootDir);
			const opened = openBoundaryFileSync({
				absolutePath: (registrationMode === "setup-only" || registrationMode === "setup-runtime") && manifestRecord.setupSource ? manifestRecord.setupSource : candidate.source,
				rootPath: pluginRoot,
				boundaryLabel: "plugin root",
				rejectHardlinks: candidate.origin !== "bundled",
				skipLexicalRootCheck: true
			});
			if (!opened.ok) {
				pushPluginLoadError("plugin entry path escapes plugin root or fails alias checks");
				continue;
			}
			const safeSource = opened.path;
			fs.closeSync(opened.fd);
			const safeImportSource = toSafeImportPath(safeSource);
			let mod = null;
			try {
				recordImportedPluginId(record.id);
				mod = profilePluginLoaderSync({
					phase: registrationMode,
					pluginId: record.id,
					source: safeSource,
					run: () => getJiti(safeSource)(safeImportSource)
				});
			} catch (err) {
				recordPluginError({
					logger,
					registry,
					record,
					seenIds,
					pluginId,
					origin: candidate.origin,
					phase: "load",
					error: err,
					logPrefix: `[plugins] ${record.id} failed to load from ${record.source}: `,
					diagnosticMessagePrefix: "failed to load plugin: "
				});
				continue;
			}
			if ((registrationMode === "setup-only" || registrationMode === "setup-runtime") && manifestRecord.setupSource) {
				const setupRegistration = resolveSetupChannelRegistration(mod);
				if (setupRegistration.loadError) {
					recordPluginError({
						logger,
						registry,
						record,
						seenIds,
						pluginId,
						origin: candidate.origin,
						phase: "load",
						error: setupRegistration.loadError,
						logPrefix: `[plugins] ${record.id} failed to load setup entry from ${record.source}: `,
						diagnosticMessagePrefix: "failed to load setup entry: "
					});
					continue;
				}
				if (setupRegistration.plugin) {
					if (setupRegistration.plugin.id && setupRegistration.plugin.id !== record.id) {
						pushPluginLoadError(`plugin id mismatch (config uses "${record.id}", setup export uses "${setupRegistration.plugin.id}")`);
						continue;
					}
					const api = createApi(record, {
						config: cfg,
						pluginConfig: {},
						hookPolicy: entry?.hooks,
						registrationMode
					});
					let mergedSetupRegistration = setupRegistration;
					let runtimeSetterApplied = false;
					if (registrationMode === "setup-runtime" && setupRegistration.usesBundledSetupContract && candidate.source !== safeSource) {
						const runtimeOpened = openBoundaryFileSync({
							absolutePath: candidate.source,
							rootPath: pluginRoot,
							boundaryLabel: "plugin root",
							rejectHardlinks: candidate.origin !== "bundled",
							skipLexicalRootCheck: true
						});
						if (!runtimeOpened.ok) {
							pushPluginLoadError("plugin entry path escapes plugin root or fails alias checks");
							continue;
						}
						const safeRuntimeSource = runtimeOpened.path;
						fs.closeSync(runtimeOpened.fd);
						const safeRuntimeImportSource = toSafeImportPath(safeRuntimeSource);
						let runtimeMod = null;
						try {
							runtimeMod = profilePluginLoaderSync({
								phase: "load-setup-runtime-entry",
								pluginId: record.id,
								source: safeRuntimeSource,
								run: () => getJiti(safeRuntimeSource)(safeRuntimeImportSource)
							});
						} catch (err) {
							recordPluginError({
								logger,
								registry,
								record,
								seenIds,
								pluginId,
								origin: candidate.origin,
								phase: "load",
								error: err,
								logPrefix: `[plugins] ${record.id} failed to load setup-runtime entry from ${record.source}: `,
								diagnosticMessagePrefix: "failed to load setup-runtime entry: "
							});
							continue;
						}
						const runtimeRegistration = resolveBundledRuntimeChannelRegistration(runtimeMod);
						if (runtimeRegistration.id && runtimeRegistration.id !== record.id) {
							pushPluginLoadError(`plugin id mismatch (config uses "${record.id}", runtime entry uses "${runtimeRegistration.id}")`);
							continue;
						}
						if (runtimeRegistration.setChannelRuntime) try {
							runtimeRegistration.setChannelRuntime(api.runtime);
							runtimeSetterApplied = true;
						} catch (err) {
							recordPluginError({
								logger,
								registry,
								record,
								seenIds,
								pluginId,
								origin: candidate.origin,
								phase: "load",
								error: err,
								logPrefix: `[plugins] ${record.id} failed to apply setup-runtime channel runtime from ${record.source}: `,
								diagnosticMessagePrefix: "failed to apply setup-runtime channel runtime: "
							});
							continue;
						}
						const runtimePluginRegistration = loadBundledRuntimeChannelPlugin({ registration: runtimeRegistration });
						if (runtimePluginRegistration.loadError) {
							recordPluginError({
								logger,
								registry,
								record,
								seenIds,
								pluginId,
								origin: candidate.origin,
								phase: "load",
								error: runtimePluginRegistration.loadError,
								logPrefix: `[plugins] ${record.id} failed to load setup-runtime channel entry from ${record.source}: `,
								diagnosticMessagePrefix: "failed to load setup-runtime channel entry: "
							});
							continue;
						}
						if (runtimePluginRegistration.plugin) {
							if (runtimePluginRegistration.plugin.id && runtimePluginRegistration.plugin.id !== record.id) {
								pushPluginLoadError(`plugin id mismatch (config uses "${record.id}", runtime export uses "${runtimePluginRegistration.plugin.id}")`);
								continue;
							}
							mergedSetupRegistration = {
								...setupRegistration,
								plugin: mergeSetupRuntimeChannelPlugin(runtimePluginRegistration.plugin, setupRegistration.plugin),
								setChannelRuntime: runtimeRegistration.setChannelRuntime ?? setupRegistration.setChannelRuntime
							};
						}
					}
					const mergedSetupPlugin = mergedSetupRegistration.plugin;
					if (!mergedSetupPlugin) continue;
					if (mergedSetupPlugin.id && mergedSetupPlugin.id !== record.id) {
						pushPluginLoadError(`plugin id mismatch (config uses "${record.id}", setup export uses "${mergedSetupPlugin.id}")`);
						continue;
					}
					if (!runtimeSetterApplied) try {
						mergedSetupRegistration.setChannelRuntime?.(api.runtime);
					} catch (err) {
						recordPluginError({
							logger,
							registry,
							record,
							seenIds,
							pluginId,
							origin: candidate.origin,
							phase: "load",
							error: err,
							logPrefix: `[plugins] ${record.id} failed to apply setup channel runtime from ${record.source}: `,
							diagnosticMessagePrefix: "failed to apply setup channel runtime: "
						});
						continue;
					}
					api.registerChannel(mergedSetupPlugin);
					registry.plugins.push(record);
					seenIds.set(pluginId, candidate.origin);
					continue;
				}
			}
			const resolved = resolvePluginModuleExport(mod);
			const definition = resolved.definition;
			const register = resolved.register;
			if (definition?.id && definition.id !== record.id) {
				pushPluginLoadError(`plugin id mismatch (config uses "${record.id}", export uses "${definition.id}")`);
				continue;
			}
			record.name = definition?.name ?? record.name;
			record.description = definition?.description ?? record.description;
			record.version = definition?.version ?? record.version;
			const manifestKind = record.kind;
			const exportKind = definition?.kind;
			if (manifestKind && exportKind && !kindsEqual(manifestKind, exportKind)) registry.diagnostics.push({
				level: "warn",
				pluginId: record.id,
				source: record.source,
				message: `plugin kind mismatch (manifest uses "${String(manifestKind)}", export uses "${String(exportKind)}")`
			});
			record.kind = definition?.kind ?? record.kind;
			if (hasKind(record.kind, "memory") && memorySlot === record.id) memorySlotMatched = true;
			if (registrationMode === "full") {
				if (pluginId !== dreamingEngineId) {
					const memoryDecision = resolveMemorySlotDecision({
						id: record.id,
						kind: record.kind,
						slot: memorySlot,
						selectedId: selectedMemoryPluginId
					});
					if (!memoryDecision.enabled) {
						record.enabled = false;
						record.status = "disabled";
						record.error = memoryDecision.reason;
						markPluginActivationDisabled(record, memoryDecision.reason);
						registry.plugins.push(record);
						seenIds.set(pluginId, candidate.origin);
						continue;
					}
					if (memoryDecision.selected && hasKind(record.kind, "memory")) {
						selectedMemoryPluginId = record.id;
						record.memorySlotSelected = true;
					}
				}
			}
			if (registrationMode === "full") {
				if (definition?.reload) registerReload(record, definition.reload);
				for (const nodeHostCommand of definition?.nodeHostCommands ?? []) registerNodeHostCommand(record, nodeHostCommand);
				for (const collector of definition?.securityAuditCollectors ?? []) registerSecurityAuditCollector(record, collector);
			}
			if (validateOnly) {
				registry.plugins.push(record);
				seenIds.set(pluginId, candidate.origin);
				continue;
			}
			if (typeof register !== "function") {
				logger.error(`[plugins] ${record.id} missing register/activate export`);
				pushPluginLoadError("plugin export missing register/activate");
				continue;
			}
			const api = createApi(record, {
				config: cfg,
				pluginConfig: validatedConfig.value,
				hookPolicy: entry?.hooks,
				registrationMode
			});
			const registrySnapshot = snapshotPluginRegistry(registry);
			const previousAgentHarnesses = listRegisteredAgentHarnesses();
			const previousCompactionProviders = listRegisteredCompactionProviders();
			const previousMemoryEmbeddingProviders = listRegisteredMemoryEmbeddingProviders();
			const previousMemoryFlushPlanResolver = getMemoryFlushPlanResolver();
			const previousMemoryPromptBuilder = getMemoryPromptSectionBuilder();
			const previousMemoryCorpusSupplements = listMemoryCorpusSupplements();
			const previousMemoryPromptSupplements = listMemoryPromptSupplements();
			const previousMemoryRuntime = getMemoryRuntime();
			try {
				runPluginRegisterSync(register, api);
				if (!shouldActivate) {
					restoreRegisteredAgentHarnesses(previousAgentHarnesses);
					restoreRegisteredCompactionProviders(previousCompactionProviders);
					restoreRegisteredMemoryEmbeddingProviders(previousMemoryEmbeddingProviders);
					restoreMemoryPluginState({
						corpusSupplements: previousMemoryCorpusSupplements,
						promptBuilder: previousMemoryPromptBuilder,
						promptSupplements: previousMemoryPromptSupplements,
						flushPlanResolver: previousMemoryFlushPlanResolver,
						runtime: previousMemoryRuntime
					});
				}
				registry.plugins.push(record);
				seenIds.set(pluginId, candidate.origin);
			} catch (err) {
				rollbackPluginGlobalSideEffects(record.id);
				restorePluginRegistry(registry, registrySnapshot);
				restoreRegisteredAgentHarnesses(previousAgentHarnesses);
				restoreRegisteredCompactionProviders(previousCompactionProviders);
				restoreRegisteredMemoryEmbeddingProviders(previousMemoryEmbeddingProviders);
				restoreMemoryPluginState({
					corpusSupplements: previousMemoryCorpusSupplements,
					promptBuilder: previousMemoryPromptBuilder,
					promptSupplements: previousMemoryPromptSupplements,
					flushPlanResolver: previousMemoryFlushPlanResolver,
					runtime: previousMemoryRuntime
				});
				recordPluginError({
					logger,
					registry,
					record,
					seenIds,
					pluginId,
					origin: candidate.origin,
					phase: "register",
					error: err,
					logPrefix: `[plugins] ${record.id} failed during register from ${record.source}: `,
					diagnosticMessagePrefix: "plugin failed during register: "
				});
			}
		}
		if (!onlyPluginIdSet && typeof memorySlot === "string" && !memorySlotMatched) registry.diagnostics.push({
			level: "warn",
			message: `memory slot plugin not found or not marked as memory: ${memorySlot}`
		});
		warnAboutUntrackedLoadedPlugins({
			registry,
			provenance,
			allowlist: normalized.allow,
			emitWarning: shouldActivate,
			logger,
			env
		});
		maybeThrowOnPluginLoadError(registry, options.throwOnLoadError);
		if (shouldActivate && options.mode !== "validate") {
			const failedPlugins = registry.plugins.filter((plugin) => plugin.failedAt != null);
			if (failedPlugins.length > 0) logger.warn(`[plugins] ${failedPlugins.length} plugin(s) failed to initialize (${formatPluginFailureSummary(failedPlugins)}). Run '${formatCliCommand("enclawed plugins list")}' for details.`);
		}
		if (cacheEnabled) setCachedPluginRegistry(cacheKey, {
			memoryCapability: getMemoryCapabilityRegistration(),
			memoryCorpusSupplements: listMemoryCorpusSupplements(),
			registry,
			agentHarnesses: listRegisteredAgentHarnesses(),
			compactionProviders: listRegisteredCompactionProviders(),
			memoryEmbeddingProviders: listRegisteredMemoryEmbeddingProviders(),
			memoryFlushPlanResolver: getMemoryFlushPlanResolver(),
			memoryPromptBuilder: getMemoryPromptSectionBuilder(),
			memoryPromptSupplements: listMemoryPromptSupplements(),
			memoryRuntime: getMemoryRuntime()
		});
		if (shouldActivate) activatePluginRegistry(registry, cacheKey, runtimeSubagentMode, options.workspaceDir);
		return registry;
	} finally {
		inFlightPluginRegistryLoads.delete(cacheKey);
	}
}
async function loadEnclawedPluginCliRegistry(options = {}) {
	const { env, cfg, normalized, activationSource, autoEnabledReasons, onlyPluginIds, cacheKey } = resolvePluginLoadCacheContext({
		...options,
		activate: false,
		cache: false
	});
	const logger = options.logger ?? defaultLogger();
	const onlyPluginIdSet = createPluginIdScopeSet(onlyPluginIds);
	const getJiti = createPluginJitiLoader(options);
	const { registry, registerCli } = createPluginRegistry({
		logger,
		runtime: {},
		coreGatewayHandlers: options.coreGatewayHandlers,
		activateGlobalSideEffects: false
	});
	const discovery = discoverEnclawedPlugins({
		workspaceDir: options.workspaceDir,
		extraPaths: normalized.loadPaths,
		cache: false,
		env
	});
	const manifestRegistry = loadPluginManifestRegistry({
		config: cfg,
		workspaceDir: options.workspaceDir,
		cache: false,
		env,
		candidates: discovery.candidates,
		diagnostics: discovery.diagnostics
	});
	pushDiagnostics(registry.diagnostics, manifestRegistry.diagnostics);
	warnWhenAllowlistIsOpen({
		emitWarning: false,
		logger,
		pluginsEnabled: normalized.enabled,
		allow: normalized.allow,
		warningCacheKey: `${cacheKey}::cli-metadata`,
		discoverablePlugins: manifestRegistry.plugins.filter((plugin) => !onlyPluginIdSet || onlyPluginIdSet.has(plugin.id)).map((plugin) => ({
			id: plugin.id,
			source: plugin.source,
			origin: plugin.origin
		}))
	});
	const provenance = buildProvenanceIndex({
		config: cfg,
		normalizedLoadPaths: normalized.loadPaths,
		env
	});
	const manifestByRoot = new Map(manifestRegistry.plugins.map((record) => [record.rootDir, record]));
	const orderedCandidates = [...discovery.candidates].toSorted((left, right) => {
		return compareDuplicateCandidateOrder({
			left,
			right,
			manifestByRoot,
			provenance,
			env
		});
	});
	const seenIds = /* @__PURE__ */ new Map();
	const memorySlot = normalized.slots.memory;
	let selectedMemoryPluginId = null;
	const dreamingEngineId = resolveDreamingSidecarEngineId({
		cfg,
		memorySlot
	});
	for (const candidate of orderedCandidates) {
		const manifestRecord = manifestByRoot.get(candidate.rootDir);
		if (!manifestRecord) continue;
		const pluginId = manifestRecord.id;
		if (!matchesScopedPluginRequest({
			onlyPluginIdSet,
			pluginId
		})) continue;
		const activationState = resolveEffectivePluginActivationState({
			id: pluginId,
			origin: candidate.origin,
			config: normalized,
			rootConfig: cfg,
			enabledByDefault: manifestRecord.enabledByDefault,
			activationSource,
			autoEnabledReason: formatAutoEnabledActivationReason(autoEnabledReasons[pluginId])
		});
		const existingOrigin = seenIds.get(pluginId);
		if (existingOrigin) {
			const record = createPluginRecord({
				id: pluginId,
				name: manifestRecord.name ?? pluginId,
				description: manifestRecord.description,
				version: manifestRecord.version,
				format: manifestRecord.format,
				bundleFormat: manifestRecord.bundleFormat,
				bundleCapabilities: manifestRecord.bundleCapabilities,
				source: candidate.source,
				rootDir: candidate.rootDir,
				origin: candidate.origin,
				workspaceDir: candidate.workspaceDir,
				enabled: false,
				activationState,
				configSchema: Boolean(manifestRecord.configSchema),
				contracts: manifestRecord.contracts
			});
			record.status = "disabled";
			record.error = `overridden by ${existingOrigin} plugin`;
			markPluginActivationDisabled(record, record.error);
			registry.plugins.push(record);
			continue;
		}
		const enableState = resolveEffectiveEnableState({
			id: pluginId,
			origin: candidate.origin,
			config: normalized,
			rootConfig: cfg,
			enabledByDefault: manifestRecord.enabledByDefault,
			activationSource
		});
		const entry = normalized.entries[pluginId];
		const record = createPluginRecord({
			id: pluginId,
			name: manifestRecord.name ?? pluginId,
			description: manifestRecord.description,
			version: manifestRecord.version,
			format: manifestRecord.format,
			bundleFormat: manifestRecord.bundleFormat,
			bundleCapabilities: manifestRecord.bundleCapabilities,
			source: candidate.source,
			rootDir: candidate.rootDir,
			origin: candidate.origin,
			workspaceDir: candidate.workspaceDir,
			enabled: enableState.enabled,
			activationState,
			configSchema: Boolean(manifestRecord.configSchema),
			contracts: manifestRecord.contracts
		});
		record.kind = manifestRecord.kind;
		record.configUiHints = manifestRecord.configUiHints;
		record.configJsonSchema = manifestRecord.configSchema;
		const pushPluginLoadError = (message) => {
			record.status = "error";
			record.error = message;
			record.failedAt = /* @__PURE__ */ new Date();
			record.failurePhase = "validation";
			registry.plugins.push(record);
			seenIds.set(pluginId, candidate.origin);
			registry.diagnostics.push({
				level: "error",
				pluginId: record.id,
				source: record.source,
				message: record.error
			});
		};
		if (!enableState.enabled) {
			record.status = "disabled";
			record.error = enableState.reason;
			markPluginActivationDisabled(record, enableState.reason);
			registry.plugins.push(record);
			seenIds.set(pluginId, candidate.origin);
			continue;
		}
		if (record.format === "bundle") {
			registry.plugins.push(record);
			seenIds.set(pluginId, candidate.origin);
			continue;
		}
		if (!manifestRecord.configSchema) {
			pushPluginLoadError("missing config schema");
			continue;
		}
		const validatedConfig = validatePluginConfig({
			schema: manifestRecord.configSchema,
			cacheKey: manifestRecord.schemaCacheKey,
			value: entry?.config
		});
		if (!validatedConfig.ok) {
			logger.error(`[plugins] ${record.id} invalid config: ${validatedConfig.errors?.join(", ")}`);
			pushPluginLoadError(`invalid config: ${validatedConfig.errors?.join(", ")}`);
			continue;
		}
		const pluginRoot = safeRealpathOrResolve(candidate.rootDir);
		const cliMetadataSource = resolveCliMetadataEntrySource(candidate.rootDir);
		const sourceForCliMetadata = candidate.origin === "bundled" ? cliMetadataSource : cliMetadataSource ?? candidate.source;
		if (!sourceForCliMetadata) {
			record.status = "loaded";
			registry.plugins.push(record);
			seenIds.set(pluginId, candidate.origin);
			continue;
		}
		const opened = openBoundaryFileSync({
			absolutePath: sourceForCliMetadata,
			rootPath: pluginRoot,
			boundaryLabel: "plugin root",
			rejectHardlinks: candidate.origin !== "bundled",
			skipLexicalRootCheck: true
		});
		if (!opened.ok) {
			pushPluginLoadError("plugin entry path escapes plugin root or fails alias checks");
			continue;
		}
		const safeSource = opened.path;
		fs.closeSync(opened.fd);
		const safeImportSource = toSafeImportPath(safeSource);
		let mod = null;
		try {
			mod = profilePluginLoaderSync({
				phase: "cli-metadata",
				pluginId: record.id,
				source: safeSource,
				run: () => getJiti(safeSource)(safeImportSource)
			});
		} catch (err) {
			recordPluginError({
				logger,
				registry,
				record,
				seenIds,
				pluginId,
				origin: candidate.origin,
				phase: "load",
				error: err,
				logPrefix: `[plugins] ${record.id} failed to load from ${record.source}: `,
				diagnosticMessagePrefix: "failed to load plugin: "
			});
			continue;
		}
		const resolved = resolvePluginModuleExport(mod);
		const definition = resolved.definition;
		const register = resolved.register;
		if (definition?.id && definition.id !== record.id) {
			pushPluginLoadError(`plugin id mismatch (config uses "${record.id}", export uses "${definition.id}")`);
			continue;
		}
		record.name = definition?.name ?? record.name;
		record.description = definition?.description ?? record.description;
		record.version = definition?.version ?? record.version;
		const manifestKind = record.kind;
		const exportKind = definition?.kind;
		if (manifestKind && exportKind && !kindsEqual(manifestKind, exportKind)) registry.diagnostics.push({
			level: "warn",
			pluginId: record.id,
			source: record.source,
			message: `plugin kind mismatch (manifest uses "${String(manifestKind)}", export uses "${String(exportKind)}")`
		});
		record.kind = definition?.kind ?? record.kind;
		if (pluginId !== dreamingEngineId) {
			const memoryDecision = resolveMemorySlotDecision({
				id: record.id,
				kind: record.kind,
				slot: memorySlot,
				selectedId: selectedMemoryPluginId
			});
			if (!memoryDecision.enabled) {
				record.enabled = false;
				record.status = "disabled";
				record.error = memoryDecision.reason;
				markPluginActivationDisabled(record, memoryDecision.reason);
				registry.plugins.push(record);
				seenIds.set(pluginId, candidate.origin);
				continue;
			}
			if (memoryDecision.selected && hasKind(record.kind, "memory")) {
				selectedMemoryPluginId = record.id;
				record.memorySlotSelected = true;
			}
		}
		if (typeof register !== "function") {
			logger.error(`[plugins] ${record.id} missing register/activate export`);
			pushPluginLoadError("plugin export missing register/activate");
			continue;
		}
		const api = buildPluginApi({
			id: record.id,
			name: record.name,
			version: record.version,
			description: record.description,
			source: record.source,
			rootDir: record.rootDir,
			registrationMode: "cli-metadata",
			config: cfg,
			pluginConfig: validatedConfig.value,
			runtime: {},
			logger,
			resolvePath: (input) => resolveUserPath(input),
			handlers: { registerCli: (registrar, opts) => registerCli(record, registrar, opts) }
		});
		const registrySnapshot = snapshotPluginRegistry(registry);
		try {
			runPluginRegisterSync(register, api);
			registry.plugins.push(record);
			seenIds.set(pluginId, candidate.origin);
		} catch (err) {
			restorePluginRegistry(registry, registrySnapshot);
			recordPluginError({
				logger,
				registry,
				record,
				seenIds,
				pluginId,
				origin: candidate.origin,
				phase: "register",
				error: err,
				logPrefix: `[plugins] ${record.id} failed during register from ${record.source}: `,
				diagnosticMessagePrefix: "plugin failed during register: "
			});
		}
	}
	return registry;
}
function safeRealpathOrResolve(value) {
	try {
		return fs.realpathSync(value);
	} catch {
		return path.resolve(value);
	}
}
function resolveCliMetadataEntrySource(rootDir) {
	for (const basename of CLI_METADATA_ENTRY_BASENAMES) {
		const candidate = path.join(rootDir, basename);
		if (fs.existsSync(candidate)) return candidate;
	}
	return null;
}
//#endregion
export { resolveRuntimePluginRegistry as a, loadEnabledBundleMcpConfig as c, readBundleJsonObject as d, resolveCompatibleRuntimePluginRegistry as i, inspectBundleServerRuntimeSupport as l, loadEnclawedPluginCliRegistry as n, extractMcpServerMap as o, loadEnclawedPlugins as r, inspectBundleMcpRuntimeSupport as s, isPluginRegistryLoadInFlight as t, loadEnabledBundleConfig as u };
