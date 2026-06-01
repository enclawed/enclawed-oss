import { t as createPluginRuntimeStore } from "./runtime-store-83AZ6T_p.js";
//#region extensions/feishu/src/runtime.ts
const { setRuntime: setFeishuRuntime, getRuntime: getFeishuRuntime } = createPluginRuntimeStore({
	pluginId: "feishu",
	errorMessage: "Feishu runtime not initialized"
});
//#endregion
export { setFeishuRuntime as n, getFeishuRuntime as t };
