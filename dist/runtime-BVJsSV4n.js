import { t as createPluginRuntimeStore } from "./runtime-store-83AZ6T_p.js";
//#region extensions/matrix/src/runtime.ts
const { setRuntime: setMatrixRuntime, getRuntime: getMatrixRuntime } = createPluginRuntimeStore({
	pluginId: "matrix",
	errorMessage: "Matrix runtime not initialized"
});
/**
* Read the current runtime config, falling back to `loadConfig()` when the
* host runtime did not populate the optional `current` accessor.
*
* Centralized here so Matrix command/CLI surfaces do not need to repeatedly
* narrow `runtime.config.current`.
*/
function readMatrixRuntimeConfig(runtime) {
	const r = runtime ?? getMatrixRuntime();
	const current = r.config.current;
	return current ? current() : r.config.loadConfig();
}
/**
* Replace the runtime config file, falling back to `writeConfigFile` when the
* host runtime did not populate the optional `replaceConfigFile` entry point.
*
* Centralized here so Matrix CLI/setup surfaces do not need to repeatedly
* narrow `runtime.config.replaceConfigFile`.
*/
async function matrixReplaceConfigFile(params, runtime) {
	const r = runtime ?? getMatrixRuntime();
	const replace = r.config.replaceConfigFile;
	if (replace) {
		await replace(params);
		return;
	}
	await r.config.writeConfigFile(params.nextConfig);
}
//#endregion
export { setMatrixRuntime as i, matrixReplaceConfigFile as n, readMatrixRuntimeConfig as r, getMatrixRuntime as t };
