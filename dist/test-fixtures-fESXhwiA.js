import "./safe-text-Dgr_ji_X.js";
import "./system-events-AQjBSiiK.js";
//#region src/agents/test-helpers/usage-fixtures.ts
const ZERO_USAGE_FIXTURE = {
	input: 0,
	output: 0,
	cacheRead: 0,
	cacheWrite: 0,
	totalTokens: 0,
	cost: {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
		total: 0
	}
};
//#endregion
//#region src/agents/test-helpers/agent-message-fixtures.ts
function castAgentMessage(message) {
	return message;
}
function makeAgentUserMessage(overrides) {
	return {
		role: "user",
		timestamp: 0,
		...overrides
	};
}
function makeAgentAssistantMessage(overrides) {
	return {
		role: "assistant",
		api: "openai-responses",
		provider: "openai",
		model: "test-model",
		usage: ZERO_USAGE_FIXTURE,
		stopReason: "stop",
		timestamp: 0,
		...overrides
	};
}
//#endregion
//#region src/test-utils/typed-cases.ts
function typedCases(cases) {
	return cases;
}
//#endregion
//#region src/plugin-sdk/test-helpers/bundled-plugin-paths.ts
const BUNDLED_PLUGIN_ROOT_DIR = "extensions";
const BUNDLED_PLUGIN_PATH_PREFIX = `${BUNDLED_PLUGIN_ROOT_DIR}/`;
const BUNDLED_PLUGIN_TEST_GLOB = `${BUNDLED_PLUGIN_ROOT_DIR}/**/*.test.ts`;
function bundledPluginRoot(pluginId) {
	return `${BUNDLED_PLUGIN_PATH_PREFIX}${pluginId}`;
}
function bundledPluginFile(pluginId, relativePath) {
	return `${bundledPluginRoot(pluginId)}/${relativePath}`;
}
function joinRoot(baseDir, relativePath) {
	return `${baseDir.replace(/\/$/, "")}/${relativePath}`;
}
function bundledPluginDirPrefix(pluginId, relativeDir) {
	return `${bundledPluginRoot(pluginId)}/${relativeDir.replace(/\/$/, "")}/`;
}
function bundledPluginRootAt(baseDir, pluginId) {
	return joinRoot(baseDir, bundledPluginRoot(pluginId));
}
function bundledPluginFileAt(baseDir, pluginId, relativePath) {
	return joinRoot(baseDir, bundledPluginFile(pluginId, relativePath));
}
function bundledDistPluginRoot(pluginId) {
	return `dist/${bundledPluginRoot(pluginId)}`;
}
function bundledDistPluginFile(pluginId, relativePath) {
	return `${bundledDistPluginRoot(pluginId)}/${relativePath}`;
}
function bundledDistPluginRootAt(baseDir, pluginId) {
	return joinRoot(baseDir, bundledDistPluginRoot(pluginId));
}
function bundledDistPluginFileAt(baseDir, pluginId, relativePath) {
	return joinRoot(baseDir, bundledDistPluginFile(pluginId, relativePath));
}
function installedPluginRoot(baseDir, pluginId) {
	return bundledPluginRootAt(baseDir, pluginId);
}
function repoInstallSpec(pluginId) {
	return `./${bundledPluginRoot(pluginId)}`;
}
//#endregion
//#region src/plugin-sdk/test-helpers/import-fresh.ts
async function importFreshModule(from, specifier) {
	return await import(
		/* @vite-ignore */
		new URL(specifier, from).href
);
}
//#endregion
export { castAgentMessage as _, bundledDistPluginFile as a, bundledDistPluginRootAt as c, bundledPluginFileAt as d, bundledPluginRoot as f, typedCases as g, repoInstallSpec as h, BUNDLED_PLUGIN_TEST_GLOB as i, bundledPluginDirPrefix as l, installedPluginRoot as m, BUNDLED_PLUGIN_PATH_PREFIX as n, bundledDistPluginFileAt as o, bundledPluginRootAt as p, BUNDLED_PLUGIN_ROOT_DIR as r, bundledDistPluginRoot as s, importFreshModule as t, bundledPluginFile as u, makeAgentAssistantMessage as v, makeAgentUserMessage as y };
