import { t as createPluginRuntimeStore } from "./runtime-store-C0t_5nBG.js";
import "./channel-policy-BQX-yGZ6.js";
import "./inbound-reply-dispatch-BUbKEpIP.js";
import "./ssrf-runtime-g42yz-N7.js";
import "./channel-pairing-BhE-ja9z.js";
//#region extensions/nextcloud-talk/src/runtime.ts
const { setRuntime: setNextcloudTalkRuntime, getRuntime: getNextcloudTalkRuntime } = createPluginRuntimeStore({
	pluginId: "nextcloud-talk",
	errorMessage: "Nextcloud Talk runtime not initialized"
});
//#endregion
export { setNextcloudTalkRuntime as n, getNextcloudTalkRuntime as t };
