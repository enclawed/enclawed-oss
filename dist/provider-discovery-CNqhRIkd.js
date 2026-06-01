import { r as normalizeProviderId } from "./provider-id-JqYiEozY.js";
import "./model-selection-DYKhuAoE.js";
//#region src/plugins/provider-discovery.ts
const DISCOVERY_ORDER = [
	"simple",
	"profile",
	"paired",
	"late"
];
let providerRuntimePromise;
function loadProviderRuntime() {
	providerRuntimePromise ??= import("./plugins/provider-discovery.runtime.js");
	return providerRuntimePromise;
}
function resolveProviderCatalogHook(provider) {
	return provider.catalog ?? provider.discovery;
}
async function resolvePluginDiscoveryProviders(params) {
	return (await loadProviderRuntime()).resolvePluginDiscoveryProvidersRuntime(params).filter((provider) => resolveProviderCatalogHook(provider));
}
function groupPluginDiscoveryProvidersByOrder(providers) {
	const grouped = {
		simple: [],
		profile: [],
		paired: [],
		late: []
	};
	for (const provider of providers) grouped[resolveProviderCatalogHook(provider)?.order ?? "late"].push(provider);
	for (const order of DISCOVERY_ORDER) grouped[order].sort((a, b) => a.label.localeCompare(b.label));
	return grouped;
}
function normalizePluginDiscoveryResult(params) {
	const result = params.result;
	if (!result) return {};
	if ("provider" in result) {
		const normalized = {};
		for (const providerId of [
			params.provider.id,
			...params.provider.aliases ?? [],
			...params.provider.hookAliases ?? []
		]) {
			const normalizedKey = normalizeProviderId(providerId);
			if (!normalizedKey) continue;
			normalized[normalizedKey] = result.provider;
		}
		return normalized;
	}
	const normalized = {};
	for (const [key, value] of Object.entries(result.providers)) {
		const normalizedKey = normalizeProviderId(key);
		if (!normalizedKey || !value) continue;
		normalized[normalizedKey] = value;
	}
	return normalized;
}
function runProviderCatalog(params) {
	return resolveProviderCatalogHook(params.provider)?.run({
		config: params.config,
		agentDir: params.agentDir,
		workspaceDir: params.workspaceDir,
		env: params.env,
		resolveProviderApiKey: params.resolveProviderApiKey,
		resolveProviderAuth: params.resolveProviderAuth
	});
}
//#endregion
export { runProviderCatalog as i, normalizePluginDiscoveryResult as n, resolvePluginDiscoveryProviders as r, groupPluginDiscoveryProvidersByOrder as t };
