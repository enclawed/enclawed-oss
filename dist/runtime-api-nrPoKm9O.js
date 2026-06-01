import { t as createPluginRuntimeStore } from "./runtime-store-83AZ6T_p.js";
import "./channel-policy-CdRqk-3-.js";
import "./channel-reply-pipeline-D9DE5wk_.js";
import "./outbound-media-BM-j5nFb.js";
import "./ssrf-runtime-Dax1gqLT.js";
import "./media-runtime-PTcxKZ17.js";
import "./channel-config-primitives-BfimXfK5.js";
import "./channel-actions-DMyixEbu.js";
import "./channel-feedback-CZzltw2Y.js";
import "./channel-inbound-B7ctqE9N.js";
import "./channel-lifecycle-DV2pS9QV.js";
import "./channel-pairing-DA3C8ymT.js";
import "./channel-status-CKyzrO47.js";
import "./webhook-request-guards-DNwhOQWV.js";
import "./webhook-targets-DiuG8eKW.js";
import "./bundled-channel-config-schema-BJRVkSLJ.js";
//#region extensions/googlechat/src/runtime.ts
const { setRuntime: setGoogleChatRuntime, getRuntime: getGoogleChatRuntime } = createPluginRuntimeStore({
	pluginId: "googlechat",
	errorMessage: "Google Chat runtime not initialized"
});
//#endregion
export { setGoogleChatRuntime as n, getGoogleChatRuntime as t };
