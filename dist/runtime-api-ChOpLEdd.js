import { t as createPluginRuntimeStore } from "./runtime-store-BT7oTp8V.js";
import "./channel-policy-Lbd6vG46.js";
import "./channel-reply-pipeline-EhueNhyd.js";
import "./outbound-media-BowDSeTo.js";
import "./ssrf-runtime-DWegA4vN.js";
import "./media-runtime-jfomOIuq.js";
import "./channel-config-primitives-DJS8DEvB.js";
import "./channel-actions-oH33N_Jt.js";
import "./channel-feedback-JFWjnwdO.js";
import "./channel-inbound-DHN9_KgT.js";
import "./channel-lifecycle-B8KI6zKm.js";
import "./channel-pairing-DIV-o5ud.js";
import "./channel-status-6EMauR4l.js";
import "./webhook-request-guards-BYfyt29F.js";
import "./webhook-targets-DsABjk4P.js";
import "./bundled-channel-config-schema-ChyQ8Zep.js";
//#region extensions/googlechat/src/runtime.ts
const { setRuntime: setGoogleChatRuntime, getRuntime: getGoogleChatRuntime } = createPluginRuntimeStore({
	pluginId: "googlechat",
	errorMessage: "Google Chat runtime not initialized"
});
//#endregion
export { setGoogleChatRuntime as n, getGoogleChatRuntime as t };
