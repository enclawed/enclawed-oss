import { t as createPluginRuntimeStore } from "./runtime-store-83AZ6T_p.js";
import "./channel-policy-DBrWfvvg.js";
import "./channel-reply-pipeline-BRK5NcJe.js";
import "./outbound-media-ExGwB7vk.js";
import "./ssrf-runtime-DqMve8F8.js";
import "./media-runtime-CgNDNwow.js";
import "./channel-config-primitives-DVpsk09Z.js";
import "./channel-actions-DIMMaq6y.js";
import "./channel-feedback-iT7xWzbd.js";
import "./channel-inbound-BZsHA3Pp.js";
import "./channel-lifecycle-DV2pS9QV.js";
import "./channel-pairing-DMiPQjvN.js";
import "./channel-status-CKyzrO47.js";
import "./webhook-request-guards-DNwhOQWV.js";
import "./webhook-targets-DiuG8eKW.js";
import "./bundled-channel-config-schema-cODeQiEQ.js";
//#region extensions/googlechat/src/runtime.ts
const { setRuntime: setGoogleChatRuntime, getRuntime: getGoogleChatRuntime } = createPluginRuntimeStore({
	pluginId: "googlechat",
	errorMessage: "Google Chat runtime not initialized"
});
//#endregion
export { setGoogleChatRuntime as n, getGoogleChatRuntime as t };
