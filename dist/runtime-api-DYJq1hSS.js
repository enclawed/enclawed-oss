import "./file-lock-BAE3A2a1.js";
import { t as createPluginRuntimeStore } from "./runtime-store-BB6XAlAZ.js";
import "./channel-policy-Ctp9oB3r.js";
import "./channel-reply-pipeline-D4UX6vLk.js";
import "./inbound-reply-dispatch-BJv8X3xd.js";
import "./outbound-media-CIs-2VgK.js";
import "./ssrf-runtime--F8sIg90.js";
import "./media-runtime-Bt3j39I8.js";
import "./channel-lifecycle-0JiIN4BM.js";
import "./channel-pairing-B36f8s4J.js";
import "./channel-targets-BIrHTZ8G.js";
import "./channel-status-Zsg2xhRW.js";
import "./webhook-ingress-C8wafuLA.js";
//#region extensions/msteams/src/runtime.ts
const { setRuntime: setMSTeamsRuntime, getRuntime: getMSTeamsRuntime } = createPluginRuntimeStore({
	pluginId: "msteams",
	errorMessage: "MSTeams runtime not initialized"
});
//#endregion
export { setMSTeamsRuntime as n, getMSTeamsRuntime as t };
