import { i as loadPluginManifest } from "./manifest-CWMW2Is2.js";
import { n as discoverEnclawedPlugins } from "./discovery-DIELPEbp.js";
//#region src/plugins/channel-catalog-registry.ts
function listChannelCatalogEntries(params = {}) {
	return discoverEnclawedPlugins({
		workspaceDir: params.workspaceDir,
		env: params.env
	}).candidates.flatMap((candidate) => {
		if (params.origin && candidate.origin !== params.origin) return [];
		const channel = candidate.packageManifest?.channel;
		if (!channel?.id) return [];
		const manifest = loadPluginManifest(candidate.rootDir, candidate.origin !== "bundled");
		if (!manifest.ok) return [];
		return [{
			pluginId: manifest.manifest.id,
			origin: candidate.origin,
			packageName: candidate.packageName,
			workspaceDir: candidate.workspaceDir,
			rootDir: candidate.rootDir,
			channel,
			...candidate.packageManifest?.install ? { install: candidate.packageManifest.install } : {}
		}];
	});
}
//#endregion
export { listChannelCatalogEntries as t };
