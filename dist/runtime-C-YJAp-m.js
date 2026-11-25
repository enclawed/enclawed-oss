import { t as createPluginRuntimeStore } from "./runtime-store-C0t_5nBG.js";
//#region extensions/tlon/src/runtime.ts
const { setRuntime: setTlonRuntime, getRuntime: getTlonRuntime } = createPluginRuntimeStore({
	pluginId: "tlon",
	errorMessage: "Tlon runtime not initialized"
});
//#endregion
export { setTlonRuntime as n, getTlonRuntime as t };
