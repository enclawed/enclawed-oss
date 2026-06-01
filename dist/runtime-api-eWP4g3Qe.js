import "./file-lock-Bkax43rt.js";
import { t as createPluginRuntimeStore } from "./runtime-store-83AZ6T_p.js";
import "./channel-policy-CdRqk-3-.js";
import "./channel-reply-pipeline-D9DE5wk_.js";
import "./inbound-reply-dispatch-Dr_9i-5F.js";
import "./outbound-media-BM-j5nFb.js";
import "./ssrf-runtime-Dax1gqLT.js";
import "./media-runtime-PTcxKZ17.js";
import "./channel-lifecycle-DV2pS9QV.js";
import "./channel-pairing-DA3C8ymT.js";
import "./channel-targets-Q3mrcPoO.js";
import "./channel-status-CKyzrO47.js";
import "./webhook-ingress-B3JS-8GF.js";
//#region extensions/msteams/src/runtime.ts
const { setRuntime: setMSTeamsRuntime, getRuntime: getMSTeamsRuntime } = createPluginRuntimeStore({
	pluginId: "msteams",
	errorMessage: "MSTeams runtime not initialized"
});
//#endregion
export { setMSTeamsRuntime as n, getMSTeamsRuntime as t };
