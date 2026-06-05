import { t as createPluginRuntimeStore } from "./runtime-store-83AZ6T_p.js";
import "./channel-policy-DBrWfvvg.js";
import "./inbound-reply-dispatch-Dp9cVaWZ.js";
import "./ssrf-runtime-DqMve8F8.js";
import "./channel-pairing-DMiPQjvN.js";
//#region extensions/nextcloud-talk/src/runtime.ts
const { setRuntime: setNextcloudTalkRuntime, getRuntime: getNextcloudTalkRuntime } = createPluginRuntimeStore({
	pluginId: "nextcloud-talk",
	errorMessage: "Nextcloud Talk runtime not initialized"
});
//#endregion
export { setNextcloudTalkRuntime as n, getNextcloudTalkRuntime as t };
