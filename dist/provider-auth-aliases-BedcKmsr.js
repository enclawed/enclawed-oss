import { o as normalizeOptionalLowercaseString } from "./string-coerce-BUSzWgUA.js";
import { t as loadPluginManifestRegistry } from "./manifest-registry-DwVSF2gb.js";
import { r as normalizeProviderId } from "./provider-id-JqYiEozY.js";
//#region src/agents/provider-auth-aliases.ts
const PROVIDER_AUTH_ALIAS_ORIGIN_PRIORITY = {
	config: 0,
	bundled: 1,
	global: 2,
	workspace: 3
};
function resolveProviderAuthAliasOriginPriority(origin) {
	if (!origin) return Number.MAX_SAFE_INTEGER;
	return PROVIDER_AUTH_ALIAS_ORIGIN_PRIORITY[origin] ?? Number.MAX_SAFE_INTEGER;
}
function normalizePluginConfigId(id) {
	return normalizeOptionalLowercaseString(id) ?? "";
}
function hasPluginId(list, pluginId) {
	return Array.isArray(list) && list.some((entry) => normalizePluginConfigId(entry) === pluginId);
}
function findPluginEntry(entries, pluginId) {
	if (!entries || typeof entries !== "object" || Array.isArray(entries)) return;
	for (const [key, value] of Object.entries(entries)) {
		if (normalizePluginConfigId(key) !== pluginId) continue;
		return value && typeof value === "object" && !Array.isArray(value) ? value : {};
	}
}
function isWorkspacePluginTrustedForAuthAliases(plugin, config) {
	const pluginsConfig = config?.plugins;
	if (pluginsConfig?.enabled === false) return false;
	const pluginId = normalizePluginConfigId(plugin.id);
	if (!pluginId || hasPluginId(pluginsConfig?.deny, pluginId)) return false;
	const entry = findPluginEntry(pluginsConfig?.entries, pluginId);
	if (entry?.enabled === false) return false;
	if (entry?.enabled === true || hasPluginId(pluginsConfig?.allow, pluginId)) return true;
	return normalizePluginConfigId(pluginsConfig?.slots?.contextEngine) === pluginId;
}
function shouldUsePluginAuthAliases(plugin, params) {
	if (plugin.origin !== "workspace" || params?.includeUntrustedWorkspacePlugins === true) return true;
	return isWorkspacePluginTrustedForAuthAliases(plugin, params?.config);
}
function resolveProviderAuthAliasMap(params) {
	const registry = loadPluginManifestRegistry({
		config: params?.config,
		workspaceDir: params?.workspaceDir,
		env: params?.env
	});
	const preferredAliases = /* @__PURE__ */ new Map();
	const aliases = Object.create(null);
	for (const plugin of registry.plugins) {
		if (!shouldUsePluginAuthAliases(plugin, params)) continue;
		for (const [alias, target] of Object.entries(plugin.providerAuthAliases ?? {}).toSorted(([left], [right]) => left.localeCompare(right))) {
			const normalizedAlias = normalizeProviderId(alias);
			const normalizedTarget = normalizeProviderId(target);
			if (normalizedAlias && normalizedTarget) {
				const existing = preferredAliases.get(normalizedAlias);
				if (!existing || resolveProviderAuthAliasOriginPriority(plugin.origin) < resolveProviderAuthAliasOriginPriority(existing.origin)) preferredAliases.set(normalizedAlias, {
					origin: plugin.origin,
					target: normalizedTarget
				});
			}
		}
	}
	for (const [alias, candidate] of preferredAliases) aliases[alias] = candidate.target;
	return aliases;
}
function resolveProviderIdForAuth(provider, params) {
	const normalized = normalizeProviderId(provider);
	if (!normalized) return normalized;
	return resolveProviderAuthAliasMap(params)[normalized] ?? normalized;
}
//#endregion
export { resolveProviderIdForAuth as n, resolveProviderAuthAliasMap as t };
