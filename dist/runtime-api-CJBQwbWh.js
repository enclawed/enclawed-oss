import "./file-lock-Bkax43rt.js";
import { t as createPluginRuntimeStore } from "./runtime-store-BT7oTp8V.js";
import "./channel-policy-Lbd6vG46.js";
import "./channel-reply-pipeline-EhueNhyd.js";
import "./inbound-reply-dispatch-SHCTFS2X.js";
import "./outbound-media-BowDSeTo.js";
import "./ssrf-runtime-DWegA4vN.js";
import "./media-runtime-jfomOIuq.js";
import "./channel-lifecycle-B8KI6zKm.js";
import "./channel-pairing-DIV-o5ud.js";
import "./channel-targets-C7wpb82c.js";
import "./channel-status-6EMauR4l.js";
import "./webhook-ingress-BF2faJ_O.js";
//#region extensions/msteams/src/runtime.ts
const { setRuntime: setMSTeamsRuntime, getRuntime: getMSTeamsRuntime } = createPluginRuntimeStore({
	pluginId: "msteams",
	errorMessage: "MSTeams runtime not initialized"
});
//#endregion
export { setMSTeamsRuntime as n, getMSTeamsRuntime as t };
