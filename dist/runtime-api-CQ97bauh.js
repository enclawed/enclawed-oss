import { t as createPluginRuntimeStore } from "./runtime-store-C0t_5nBG.js";
import "./channel-policy-BQX-yGZ6.js";
import "./channel-reply-pipeline-Cbp82Npz.js";
import "./outbound-media-DcWW2BmN.js";
import "./ssrf-runtime-g42yz-N7.js";
import "./media-runtime-DybdZk30.js";
import "./channel-config-primitives-BP3nOrGJ.js";
import "./channel-actions-DX1QzDSE.js";
import "./channel-feedback-BzpxIAGw.js";
import "./channel-inbound-Bc_9l32t.js";
import "./channel-lifecycle-O_dpM6Q-.js";
import "./channel-pairing-BhE-ja9z.js";
import "./channel-status-D02b9Rg_.js";
import "./webhook-request-guards-D3BmVrKy.js";
import "./webhook-targets-mSTh_suy.js";
import "./bundled-channel-config-schema-B52Nc7J6.js";
//#region extensions/googlechat/src/runtime.ts
const { setRuntime: setGoogleChatRuntime, getRuntime: getGoogleChatRuntime } = createPluginRuntimeStore({
	pluginId: "googlechat",
	errorMessage: "Google Chat runtime not initialized"
});
//#endregion
export { setGoogleChatRuntime as n, getGoogleChatRuntime as t };
