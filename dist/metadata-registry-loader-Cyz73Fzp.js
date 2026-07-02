import { r as hasExplicitPluginIdScope } from "./channel-configured-7JLVCmjD.js";
import { r as loadEnclawedPlugins } from "./loader-DgpvJ8g0.js";
import { i as resolvePluginRuntimeLoadContext, t as buildPluginRuntimeLoadOptions } from "./load-context--3-QIWz1.js";
//#region src/plugins/runtime/metadata-registry-loader.ts
function loadPluginMetadataRegistrySnapshot(options) {
	return loadEnclawedPlugins(buildPluginRuntimeLoadOptions(resolvePluginRuntimeLoadContext(options), {
		throwOnLoadError: true,
		cache: false,
		activate: false,
		mode: "validate",
		loadModules: options?.loadModules,
		...hasExplicitPluginIdScope(options?.onlyPluginIds) ? { onlyPluginIds: options?.onlyPluginIds } : {}
	}));
}
//#endregion
export { loadPluginMetadataRegistrySnapshot as t };
