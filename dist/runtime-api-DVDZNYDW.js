import "./file-lock-DFAwYnsF.js";
import { t as createPluginRuntimeStore } from "./runtime-store-C0t_5nBG.js";
import "./channel-policy-BQX-yGZ6.js";
import "./channel-reply-pipeline-Cbp82Npz.js";
import "./inbound-reply-dispatch-BUbKEpIP.js";
import "./outbound-media-DcWW2BmN.js";
import "./ssrf-runtime-g42yz-N7.js";
import "./media-runtime-DybdZk30.js";
import "./channel-lifecycle-O_dpM6Q-.js";
import "./channel-pairing-BhE-ja9z.js";
import "./channel-targets-C0GYmRWg.js";
import "./channel-status-D02b9Rg_.js";
import "./webhook-ingress-Dwj9qd07.js";
//#region extensions/msteams/src/runtime.ts
const { setRuntime: setMSTeamsRuntime, getRuntime: getMSTeamsRuntime } = createPluginRuntimeStore({
	pluginId: "msteams",
	errorMessage: "MSTeams runtime not initialized"
});
//#endregion
export { setMSTeamsRuntime as n, getMSTeamsRuntime as t };
