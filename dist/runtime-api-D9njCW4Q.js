import "./file-lock-BUY2i0LK.js";
import { t as createPluginRuntimeStore } from "./runtime-store-CHYakTD0.js";
import "./channel-policy-DfIhxgaQ.js";
import "./channel-reply-pipeline-B2m58agi.js";
import "./inbound-reply-dispatch-CaDhebRh.js";
import "./outbound-media-jglR-L7m.js";
import "./ssrf-runtime-DcbzcBnU.js";
import "./media-runtime-C7OYyRri.js";
import "./channel-lifecycle-BF8fV_p_.js";
import "./channel-pairing-BXQZOLtw.js";
import "./channel-targets-B4Cuu8Fs.js";
import "./channel-status-CDe2FHZk.js";
import "./webhook-ingress-Bua0eRIA.js";
//#region extensions/msteams/src/runtime.ts
const { setRuntime: setMSTeamsRuntime, getRuntime: getMSTeamsRuntime } = createPluginRuntimeStore({
	pluginId: "msteams",
	errorMessage: "MSTeams runtime not initialized"
});
//#endregion
export { setMSTeamsRuntime as n, getMSTeamsRuntime as t };
