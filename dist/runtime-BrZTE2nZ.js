import { t as createPluginRuntimeStore } from "./runtime-store-83AZ6T_p.js";
import { _ as setEnclawedVersion } from "./sender-VizoFyMG.js";
//#region extensions/qqbot/src/bridge/runtime.ts
const { setRuntime: _setRuntime, getRuntime: getQQBotRuntime } = createPluginRuntimeStore({
	pluginId: "qqbot",
	errorMessage: "QQBot runtime not initialized"
});
/** Set the QQBot runtime and inject the framework version into the User-Agent. */
function setQQBotRuntime(runtime) {
	_setRuntime(runtime);
	setEnclawedVersion(runtime.version);
}
/** Type-narrowed getter for engine/ modules that need GatewayPluginRuntime. */
function getQQBotRuntimeForEngine() {
	return getQQBotRuntime();
}
//#endregion
export { getQQBotRuntimeForEngine as n, setQQBotRuntime as r, getQQBotRuntime as t };
