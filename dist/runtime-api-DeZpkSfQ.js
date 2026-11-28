import { t as createPluginRuntimeStore } from "./runtime-store-BB6XAlAZ.js";
import "./channel-policy-Ctp9oB3r.js";
import "./inbound-reply-dispatch-BJv8X3xd.js";
import "./ssrf-runtime--F8sIg90.js";
import "./channel-pairing-B36f8s4J.js";
//#region extensions/nextcloud-talk/src/runtime.ts
const { setRuntime: setNextcloudTalkRuntime, getRuntime: getNextcloudTalkRuntime } = createPluginRuntimeStore({
	pluginId: "nextcloud-talk",
	errorMessage: "Nextcloud Talk runtime not initialized"
});
//#endregion
export { setNextcloudTalkRuntime as n, getNextcloudTalkRuntime as t };
