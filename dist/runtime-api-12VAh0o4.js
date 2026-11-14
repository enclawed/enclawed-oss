import { t as createPluginRuntimeStore } from "./runtime-store-SC3Rt2c0.js";
import "./channel-policy-DcSxZKdH.js";
import "./inbound-reply-dispatch-DUyLhnDq.js";
import "./ssrf-runtime-6jw1bI8U.js";
import "./channel-pairing-BuuLA8_N.js";
//#region extensions/nextcloud-talk/src/runtime.ts
const { setRuntime: setNextcloudTalkRuntime, getRuntime: getNextcloudTalkRuntime } = createPluginRuntimeStore({
	pluginId: "nextcloud-talk",
	errorMessage: "Nextcloud Talk runtime not initialized"
});
//#endregion
export { setNextcloudTalkRuntime as n, getNextcloudTalkRuntime as t };
