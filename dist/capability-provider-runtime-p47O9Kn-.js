import { t as loadPluginManifestRegistry } from "./manifest-registry-DwVSF2gb.js";
import { n as withBundledPluginEnablementCompat, r as withBundledPluginVitestCompat, t as withBundledPluginAllowlistCompat } from "./bundled-compat-CeMubMJc.js";
import { a as resolveRuntimePluginRegistry } from "./loader-C8wlZwIu.js";
//#region src/plugins/capability-provider-runtime.ts
const CAPABILITY_CONTRACT_KEY = {
	memoryEmbeddingProviders: "memoryEmbeddingProviders",
	speechProviders: "speechProviders",
	realtimeTranscriptionProviders: "realtimeTranscriptionProviders",
	realtimeVoiceProviders: "realtimeVoiceProviders",
	mediaUnderstandingProviders: "mediaUnderstandingProviders",
	imageGenerationProviders: "imageGenerationProviders",
	videoGenerationProviders: "videoGenerationProviders",
	musicGenerationProviders: "musicGenerationProviders"
};
function resolveBundledCapabilityCompatPluginIds(params) {
	const contractKey = CAPABILITY_CONTRACT_KEY[params.key];
	return loadPluginManifestRegistry({
		config: params.cfg,
		env: process.env
	}).plugins.filter((plugin) => plugin.origin === "bundled" && (plugin.contracts?.[contractKey]?.length ?? 0) > 0 && (!params.providerId || (plugin.contracts?.[contractKey] ?? []).includes(params.providerId))).map((plugin) => plugin.id).toSorted((left, right) => left.localeCompare(right));
}
function resolveCapabilityProviderConfig(params) {
	const pluginIds = params.pluginIds ?? resolveBundledCapabilityCompatPluginIds(params);
	return withBundledPluginVitestCompat({
		config: withBundledPluginEnablementCompat({
			config: withBundledPluginAllowlistCompat({
				config: params.cfg,
				pluginIds
			}),
			pluginIds
		}),
		pluginIds,
		env: process.env
	});
}
function findProviderById(entries, providerId) {
	const providerEntries = entries;
	for (const entry of providerEntries) if (entry.provider.id === providerId) return entry.provider;
}
function resolvePluginCapabilityProvider(params) {
	const activeProvider = findProviderById(resolveRuntimePluginRegistry()?.[params.key] ?? [], params.providerId);
	if (activeProvider) return activeProvider;
	const pluginIds = resolveBundledCapabilityCompatPluginIds({
		key: params.key,
		cfg: params.cfg,
		providerId: params.providerId
	});
	if (pluginIds.length === 0) return;
	const compatConfig = resolveCapabilityProviderConfig({
		key: params.key,
		cfg: params.cfg,
		pluginIds
	});
	return findProviderById(resolveRuntimePluginRegistry(compatConfig === void 0 ? void 0 : { config: compatConfig })?.[params.key] ?? [], params.providerId);
}
function resolvePluginCapabilityProviders(params) {
	const activeProviders = resolveRuntimePluginRegistry()?.[params.key] ?? [];
	if (activeProviders.length > 0 && params.key !== "memoryEmbeddingProviders") return activeProviders.map((entry) => entry.provider);
	const compatConfig = resolveCapabilityProviderConfig({
		key: params.key,
		cfg: params.cfg
	});
	const registry = resolveRuntimePluginRegistry(compatConfig === void 0 ? void 0 : { config: compatConfig });
	if (params.key !== "memoryEmbeddingProviders") return (registry?.[params.key] ?? []).map((entry) => entry.provider);
	const merged = /* @__PURE__ */ new Map();
	for (const entry of activeProviders) {
		const provider = entry.provider;
		if (provider.id) merged.set(provider.id, provider);
	}
	for (const entry of registry?.[params.key] ?? []) {
		const provider = entry.provider;
		if (provider.id && !merged.has(provider.id)) merged.set(provider.id, provider);
	}
	return [...merged.values()];
}
//#endregion
export { resolvePluginCapabilityProviders as n, resolvePluginCapabilityProvider as t };
