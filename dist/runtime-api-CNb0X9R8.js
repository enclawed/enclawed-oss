import { t as createPluginRuntimeStore } from "./runtime-store-BT7oTp8V.js";
import "./channel-policy-Lbd6vG46.js";
import "./inbound-reply-dispatch-SHCTFS2X.js";
import "./ssrf-runtime-DWegA4vN.js";
import "./channel-pairing-DIV-o5ud.js";
//#region extensions/nextcloud-talk/src/runtime.ts
const { setRuntime: setNextcloudTalkRuntime, getRuntime: getNextcloudTalkRuntime } = createPluginRuntimeStore({
	pluginId: "nextcloud-talk",
	errorMessage: "Nextcloud Talk runtime not initialized"
});
//#endregion
export { setNextcloudTalkRuntime as n, getNextcloudTalkRuntime as t };
