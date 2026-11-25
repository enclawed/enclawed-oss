import { s as resolveManifestCommandAliasOwnerInRegistry } from "./manifest-DFuFURyO.js";
import { t as loadPluginManifestRegistry } from "./manifest-registry-DPuL2Q87.js";
//#region src/plugins/manifest-command-aliases.runtime.ts
function resolveManifestCommandAliasOwner(params) {
	const registry = params.registry ?? loadPluginManifestRegistry({
		config: params.config,
		workspaceDir: params.workspaceDir,
		env: params.env
	});
	return resolveManifestCommandAliasOwnerInRegistry({
		command: params.command,
		registry
	});
}
//#endregion
export { resolveManifestCommandAliasOwner as t };
