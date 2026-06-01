import { i as listRegisteredMemoryEmbeddingProviders, n as getRegisteredMemoryEmbeddingProvider } from "./memory-embedding-providers-BTTCMWj7.js";
import { n as resolvePluginCapabilityProviders, t as resolvePluginCapabilityProvider } from "./capability-provider-runtime-p47O9Kn-.js";
//#region src/plugins/memory-embedding-provider-runtime.ts
function listRegisteredMemoryEmbeddingProviderAdapters() {
	return listRegisteredMemoryEmbeddingProviders().map((entry) => entry.adapter);
}
function listMemoryEmbeddingProviders(cfg) {
	const registered = listRegisteredMemoryEmbeddingProviderAdapters();
	const merged = new Map(registered.map((adapter) => [adapter.id, adapter]));
	for (const adapter of resolvePluginCapabilityProviders({
		key: "memoryEmbeddingProviders",
		cfg
	})) if (!merged.has(adapter.id)) merged.set(adapter.id, adapter);
	return [...merged.values()];
}
function getMemoryEmbeddingProvider(id, cfg) {
	const registered = getRegisteredMemoryEmbeddingProvider(id);
	if (registered) return registered.adapter;
	return resolvePluginCapabilityProvider({
		key: "memoryEmbeddingProviders",
		providerId: id,
		cfg
	});
}
//#endregion
export { listMemoryEmbeddingProviders as n, listRegisteredMemoryEmbeddingProviderAdapters as r, getMemoryEmbeddingProvider as t };
