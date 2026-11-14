import "./file-lock-DQrANSNS.js";
import { t as createPluginRuntimeStore } from "./runtime-store-SC3Rt2c0.js";
import "./channel-policy-DcSxZKdH.js";
import "./channel-reply-pipeline-XOZSifYp.js";
import "./inbound-reply-dispatch-DUyLhnDq.js";
import "./outbound-media-DRXNuBzA.js";
import "./ssrf-runtime-6jw1bI8U.js";
import "./media-runtime-iB-rMkdD.js";
import "./channel-lifecycle-BHEepGIy.js";
import "./channel-pairing-BuuLA8_N.js";
import "./channel-targets-DnXbOaCg.js";
import "./channel-status-x8z0n2NX.js";
import "./webhook-ingress-iqXJ0gsJ.js";
//#region extensions/msteams/src/runtime.ts
const { setRuntime: setMSTeamsRuntime, getRuntime: getMSTeamsRuntime } = createPluginRuntimeStore({
	pluginId: "msteams",
	errorMessage: "MSTeams runtime not initialized"
});
//#endregion
export { setMSTeamsRuntime as n, getMSTeamsRuntime as t };
