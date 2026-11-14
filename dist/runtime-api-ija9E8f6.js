import { t as createPluginRuntimeStore } from "./runtime-store-SC3Rt2c0.js";
import "./channel-policy-DcSxZKdH.js";
import "./channel-reply-pipeline-XOZSifYp.js";
import "./outbound-media-DRXNuBzA.js";
import "./ssrf-runtime-6jw1bI8U.js";
import "./media-runtime-iB-rMkdD.js";
import "./channel-config-primitives-B5oKvJiJ.js";
import "./channel-actions-C2ZLNfns.js";
import "./channel-feedback-8V5NPDk3.js";
import "./channel-inbound-BKoBCbFT.js";
import "./channel-lifecycle-BHEepGIy.js";
import "./channel-pairing-BuuLA8_N.js";
import "./channel-status-x8z0n2NX.js";
import "./webhook-request-guards-KtSadGF8.js";
import "./webhook-targets-ltZk7Tmh.js";
import "./bundled-channel-config-schema-DDO83frm.js";
//#region extensions/googlechat/src/runtime.ts
const { setRuntime: setGoogleChatRuntime, getRuntime: getGoogleChatRuntime } = createPluginRuntimeStore({
	pluginId: "googlechat",
	errorMessage: "Google Chat runtime not initialized"
});
//#endregion
export { setGoogleChatRuntime as n, getGoogleChatRuntime as t };
