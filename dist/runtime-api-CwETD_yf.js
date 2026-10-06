import { t as createPluginRuntimeStore } from "./runtime-store-CHYakTD0.js";
import "./channel-policy-DfIhxgaQ.js";
import "./channel-reply-pipeline-B2m58agi.js";
import "./outbound-media-jglR-L7m.js";
import "./ssrf-runtime-DcbzcBnU.js";
import "./media-runtime-C7OYyRri.js";
import "./channel-config-primitives-C3WxUY8x.js";
import "./channel-actions-BUSUnPTt.js";
import "./channel-feedback-BOMZTn-y.js";
import "./channel-inbound-BMrCQUzu.js";
import "./channel-lifecycle-BF8fV_p_.js";
import "./channel-pairing-BXQZOLtw.js";
import "./channel-status-CDe2FHZk.js";
import "./webhook-request-guards-BoGT1AcX.js";
import "./webhook-targets-DkjJHWcs.js";
import "./bundled-channel-config-schema-VU9c-cIf.js";
//#region extensions/googlechat/src/runtime.ts
const { setRuntime: setGoogleChatRuntime, getRuntime: getGoogleChatRuntime } = createPluginRuntimeStore({
	pluginId: "googlechat",
	errorMessage: "Google Chat runtime not initialized"
});
//#endregion
export { setGoogleChatRuntime as n, getGoogleChatRuntime as t };
