import "./hook-runner-global-B18jmw-H.js";
import { t as createPluginRecord } from "./status.test-helpers-CDOm_4Kf.js";
//#region src/plugins/hooks.test-helpers.ts
function createMockPluginRegistry(hooks) {
	return {
		plugins: (hooks.length > 0 ? [...new Set(hooks.map((hook) => hook.pluginId ?? "test-plugin"))] : ["test-plugin"]).map((pluginId) => createPluginRecord({
			id: pluginId,
			name: "Test Plugin",
			source: "test",
			hookCount: hooks.filter((hook) => (hook.pluginId ?? "test-plugin") === pluginId).length
		})),
		hooks,
		typedHooks: hooks.map((h) => ({
			pluginId: h.pluginId ?? "test-plugin",
			hookName: h.hookName,
			handler: h.handler,
			priority: 0,
			source: "test"
		})),
		tools: [],
		channels: [],
		channelSetups: [],
		providers: [],
		speechProviders: [],
		mediaUnderstandingProviders: [],
		imageGenerationProviders: [],
		videoGenerationProviders: [],
		musicGenerationProviders: [],
		webSearchProviders: [],
		httpRoutes: [],
		gatewayHandlers: {},
		cliRegistrars: [],
		services: [],
		commands: [],
		diagnostics: []
	};
}
function addTestHook(params) {
	params.registry.typedHooks.push({
		pluginId: params.pluginId,
		hookName: params.hookName,
		handler: params.handler,
		priority: params.priority ?? 0,
		source: "test"
	});
}
//#endregion
export { createMockPluginRegistry as n, addTestHook as t };
