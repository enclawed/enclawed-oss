import { t as createPluginRuntimeStore } from "./runtime-store-BT7oTp8V.js";
import "./channel-policy-C02m4wT2.js";
import "./inbound-reply-dispatch-KfZYGt0E.js";
import "./ssrf-runtime-9LvoQ5Lf.js";
import "./channel-pairing-zOJ_Klee.js";
//#region extensions/nextcloud-talk/src/runtime.ts
const { setRuntime: setNextcloudTalkRuntime, getRuntime: getNextcloudTalkRuntime } = createPluginRuntimeStore({
	pluginId: "nextcloud-talk",
	errorMessage: "Nextcloud Talk runtime not initialized"
});
//#endregion
export { setNextcloudTalkRuntime as n, getNextcloudTalkRuntime as t };
