import { t as createPluginRuntimeStore } from "./runtime-store-BT7oTp8V.js";
import "./channel-policy-C02m4wT2.js";
import "./channel-reply-pipeline-DdDkbtPJ.js";
import "./outbound-media-BtoqW6Em.js";
import "./ssrf-runtime-9LvoQ5Lf.js";
import "./media-runtime-B8-vTWvp.js";
import "./channel-config-primitives-CyMeF3dm.js";
import "./channel-actions-BGxn5OtH.js";
import "./channel-feedback-CPult3sd.js";
import "./channel-inbound-DXWx_PVI.js";
import "./channel-lifecycle-B8KI6zKm.js";
import "./channel-pairing-zOJ_Klee.js";
import "./channel-status-lBa-A1_e.js";
import "./webhook-request-guards-BYfyt29F.js";
import "./webhook-targets-DsABjk4P.js";
import "./bundled-channel-config-schema-BecpJfDJ.js";
//#region extensions/googlechat/src/runtime.ts
const { setRuntime: setGoogleChatRuntime, getRuntime: getGoogleChatRuntime } = createPluginRuntimeStore({
	pluginId: "googlechat",
	errorMessage: "Google Chat runtime not initialized"
});
//#endregion
export { setGoogleChatRuntime as n, getGoogleChatRuntime as t };
