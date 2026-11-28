import { t as createPluginRuntimeStore } from "./runtime-store-BB6XAlAZ.js";
import "./channel-policy-Ctp9oB3r.js";
import "./channel-reply-pipeline-D4UX6vLk.js";
import "./outbound-media-CIs-2VgK.js";
import "./ssrf-runtime--F8sIg90.js";
import "./media-runtime-Bt3j39I8.js";
import "./channel-config-primitives-i7JkgGQo.js";
import "./channel-actions-SdxWkv4T.js";
import "./channel-feedback-B9SrwT6a.js";
import "./channel-inbound-mhRu3Pat.js";
import "./channel-lifecycle-0JiIN4BM.js";
import "./channel-pairing-B36f8s4J.js";
import "./channel-status-Zsg2xhRW.js";
import "./webhook-request-guards-BO8Vg1CD.js";
import "./webhook-targets-U84kLyfn.js";
import "./bundled-channel-config-schema-DhjrGfy0.js";
//#region extensions/googlechat/src/runtime.ts
const { setRuntime: setGoogleChatRuntime, getRuntime: getGoogleChatRuntime } = createPluginRuntimeStore({
	pluginId: "googlechat",
	errorMessage: "Google Chat runtime not initialized"
});
//#endregion
export { setGoogleChatRuntime as n, getGoogleChatRuntime as t };
