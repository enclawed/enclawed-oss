import "./file-lock-Bkax43rt.js";
import { t as createPluginRuntimeStore } from "./runtime-store-83AZ6T_p.js";
import "./channel-policy-DBrWfvvg.js";
import "./channel-reply-pipeline-BRK5NcJe.js";
import "./inbound-reply-dispatch-Dp9cVaWZ.js";
import "./outbound-media-ExGwB7vk.js";
import "./ssrf-runtime-DqMve8F8.js";
import "./media-runtime-CgNDNwow.js";
import "./channel-lifecycle-DV2pS9QV.js";
import "./channel-pairing-DMiPQjvN.js";
import "./channel-targets-B3S4_hlh.js";
import "./channel-status-CKyzrO47.js";
import "./webhook-ingress-B3JS-8GF.js";
//#region extensions/msteams/src/runtime.ts
const { setRuntime: setMSTeamsRuntime, getRuntime: getMSTeamsRuntime } = createPluginRuntimeStore({
	pluginId: "msteams",
	errorMessage: "MSTeams runtime not initialized"
});
//#endregion
export { setMSTeamsRuntime as n, getMSTeamsRuntime as t };
