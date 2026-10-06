import { t as createPluginRuntimeStore } from "./runtime-store-CHYakTD0.js";
import "./channel-policy-DfIhxgaQ.js";
import "./inbound-reply-dispatch-CaDhebRh.js";
import "./ssrf-runtime-DcbzcBnU.js";
import "./channel-pairing-BXQZOLtw.js";
//#region extensions/nextcloud-talk/src/runtime.ts
const { setRuntime: setNextcloudTalkRuntime, getRuntime: getNextcloudTalkRuntime } = createPluginRuntimeStore({
	pluginId: "nextcloud-talk",
	errorMessage: "Nextcloud Talk runtime not initialized"
});
//#endregion
export { setNextcloudTalkRuntime as n, getNextcloudTalkRuntime as t };
