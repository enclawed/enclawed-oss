import { c as listBundledChannelPluginIds, d as setBundledChannelRuntime, n as getBundledChannelPlugin } from "./bundled-CXs8skTy.js";
import { y as setActivePluginRegistry } from "./runtime-CO-f4q2v.js";
import { n as createTestRegistry } from "./channel-plugins-Bul8c1k9.js";
//#region src/commands/channel-test-registry.ts
function resolveChannelPluginsForTests(onlyPluginIds) {
	return (onlyPluginIds ?? listBundledChannelPluginIds()).flatMap((id) => {
		const plugin = getBundledChannelPlugin(id);
		return plugin ? [plugin] : [];
	});
}
function createChannelTestRuntime() {
	return { state: { resolveStateDir: (_env, homeDir) => (homeDir ?? (() => "/tmp"))() } };
}
function setChannelPluginRegistryForTests(onlyPluginIds) {
	const plugins = resolveChannelPluginsForTests(onlyPluginIds);
	const runtime = createChannelTestRuntime();
	for (const plugin of plugins) try {
		setBundledChannelRuntime(plugin.id, runtime);
	} catch {}
	setActivePluginRegistry(createTestRegistry(plugins.map((plugin) => ({
		pluginId: plugin.id,
		plugin,
		source: "test"
	}))));
}
function setDefaultChannelPluginRegistryForTests() {
	setChannelPluginRegistryForTests();
}
//#endregion
export { setDefaultChannelPluginRegistryForTests as t };
