import { t as createSubsystemLogger } from "./subsystem-BCgIuXto.js";
import { a as loadConfig } from "./io-CvfgCuUT.js";
import { S as resolveDefaultAgentId, x as resolveAgentWorkspaceDir } from "./agent-scope-DVYmA2Mv.js";
import "./config-CU0pEPPr.js";
import { t as applyPluginAutoEnable } from "./plugin-auto-enable-Z9PTd5ri.js";
import "./logging-C1P63fZK.js";
//#region src/plugins/runtime/load-context.ts
const log = createSubsystemLogger("plugins");
function createPluginRuntimeLoaderLogger() {
	return {
		info: (message) => log.info(message),
		warn: (message) => log.warn(message),
		error: (message) => log.error(message),
		debug: (message) => log.debug(message)
	};
}
function resolvePluginRuntimeLoadContext(options) {
	const env = options?.env ?? process.env;
	const rawConfig = options?.config ?? loadConfig();
	const autoEnabled = applyPluginAutoEnable({
		config: rawConfig,
		env
	});
	const config = autoEnabled.config;
	const workspaceDir = options?.workspaceDir ?? resolveAgentWorkspaceDir(config, resolveDefaultAgentId(config));
	return {
		rawConfig,
		config,
		activationSourceConfig: options?.activationSourceConfig ?? rawConfig,
		autoEnabledReasons: autoEnabled.autoEnabledReasons,
		workspaceDir,
		env,
		logger: options?.logger ?? createPluginRuntimeLoaderLogger()
	};
}
function buildPluginRuntimeLoadOptions(context, overrides) {
	return buildPluginRuntimeLoadOptionsFromValues(context, overrides);
}
function buildPluginRuntimeLoadOptionsFromValues(values, overrides) {
	return {
		config: values.config,
		activationSourceConfig: values.activationSourceConfig,
		autoEnabledReasons: values.autoEnabledReasons,
		workspaceDir: values.workspaceDir,
		env: values.env,
		logger: values.logger,
		...overrides
	};
}
//#endregion
export { resolvePluginRuntimeLoadContext as i, buildPluginRuntimeLoadOptionsFromValues as n, createPluginRuntimeLoaderLogger as r, buildPluginRuntimeLoadOptions as t };
