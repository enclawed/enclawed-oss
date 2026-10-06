import { t as loadPluginManifestRegistry } from "./manifest-registry-B1LtZC7a.js";
import { n as isChannelVisibleInSetup } from "./exposure-DuKl8SgJ.js";
import { c as listChatChannels } from "./registry-BRuATCor.js";
import { S as resolveDefaultAgentId, x as resolveAgentWorkspaceDir } from "./agent-scope-5o1jve-2.js";
import { t as applyPluginAutoEnable } from "./plugin-auto-enable-BE3SC6M5.js";
import { t as normalizeChannelMeta } from "./meta-normalization-ByGspHOn.js";
import { n as listSetupDiscoveryChannelPluginCatalogEntries, r as listTrustedChannelPluginCatalogEntries } from "./trusted-catalog-SnHJdFzC.js";
//#region src/commands/channel-setup/discovery.ts
function shouldShowChannelInSetup(meta) {
	return isChannelVisibleInSetup(meta);
}
function resolveWorkspaceDir(cfg, workspaceDir) {
	return workspaceDir ?? resolveAgentWorkspaceDir(cfg, resolveDefaultAgentId(cfg));
}
function listManifestInstalledChannelIds(params) {
	const resolvedConfig = applyPluginAutoEnable({
		config: params.cfg,
		env: params.env ?? process.env
	}).config;
	const workspaceDir = resolveWorkspaceDir(resolvedConfig, params.workspaceDir);
	return new Set(loadPluginManifestRegistry({
		config: resolvedConfig,
		workspaceDir,
		env: params.env ?? process.env
	}).plugins.flatMap((plugin) => plugin.channels));
}
function isCatalogChannelInstalled(params) {
	return listManifestInstalledChannelIds(params).has(params.entry.id);
}
function resolveChannelSetupEntries(params) {
	const workspaceDir = resolveWorkspaceDir(params.cfg, params.workspaceDir);
	const manifestInstalledIds = listManifestInstalledChannelIds({
		cfg: params.cfg,
		workspaceDir,
		env: params.env
	});
	const installedPluginIds = new Set(params.installedPlugins.map((plugin) => plugin.id));
	const installedCatalogEntriesSource = listTrustedChannelPluginCatalogEntries({
		cfg: params.cfg,
		workspaceDir,
		env: params.env
	});
	const installableCatalogEntriesSource = listSetupDiscoveryChannelPluginCatalogEntries({
		cfg: params.cfg,
		workspaceDir,
		env: params.env
	});
	const installedCatalogEntries = installedCatalogEntriesSource.filter((entry) => !installedPluginIds.has(entry.id) && manifestInstalledIds.has(entry.id) && shouldShowChannelInSetup(entry.meta)).map((entry) => ({
		...entry,
		meta: normalizeChannelMeta({
			id: entry.id,
			meta: entry.meta
		})
	}));
	const installableCatalogEntries = installableCatalogEntriesSource.filter((entry) => !installedPluginIds.has(entry.id) && !manifestInstalledIds.has(entry.id) && shouldShowChannelInSetup(entry.meta)).map((entry) => ({
		...entry,
		meta: normalizeChannelMeta({
			id: entry.id,
			meta: entry.meta
		})
	}));
	const metaById = /* @__PURE__ */ new Map();
	for (const meta of listChatChannels()) metaById.set(meta.id, normalizeChannelMeta({
		id: meta.id,
		meta
	}));
	for (const plugin of params.installedPlugins) metaById.set(plugin.id, normalizeChannelMeta({
		id: plugin.id,
		meta: plugin.meta,
		existing: metaById.get(plugin.id)
	}));
	for (const entry of installedCatalogEntries) if (!metaById.has(entry.id)) metaById.set(entry.id, normalizeChannelMeta({
		id: entry.id,
		meta: entry.meta,
		existing: metaById.get(entry.id)
	}));
	for (const entry of installableCatalogEntries) if (!metaById.has(entry.id)) metaById.set(entry.id, normalizeChannelMeta({
		id: entry.id,
		meta: entry.meta,
		existing: metaById.get(entry.id)
	}));
	return {
		entries: Array.from(metaById, ([id, meta]) => ({
			id,
			meta
		})).filter((entry) => shouldShowChannelInSetup(entry.meta)),
		installedCatalogEntries,
		installableCatalogEntries,
		installedCatalogById: new Map(installedCatalogEntries.map((entry) => [entry.id, entry])),
		installableCatalogById: new Map(installableCatalogEntries.map((entry) => [entry.id, entry]))
	};
}
//#endregion
export { shouldShowChannelInSetup as i, listManifestInstalledChannelIds as n, resolveChannelSetupEntries as r, isCatalogChannelInstalled as t };
