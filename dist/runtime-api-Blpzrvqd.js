import "./file-lock-Bkax43rt.js";
import { t as createPluginRuntimeStore } from "./runtime-store-BT7oTp8V.js";
import "./channel-policy-C02m4wT2.js";
import "./channel-reply-pipeline-DdDkbtPJ.js";
import "./inbound-reply-dispatch-KfZYGt0E.js";
import "./outbound-media-BtoqW6Em.js";
import "./ssrf-runtime-9LvoQ5Lf.js";
import "./media-runtime-B8-vTWvp.js";
import "./channel-lifecycle-B8KI6zKm.js";
import "./channel-pairing-zOJ_Klee.js";
import "./channel-targets-CnVbNhnx.js";
import "./channel-status-lBa-A1_e.js";
import "./webhook-ingress-BF2faJ_O.js";
//#region extensions/msteams/src/runtime.ts
const { setRuntime: setMSTeamsRuntime, getRuntime: getMSTeamsRuntime } = createPluginRuntimeStore({
	pluginId: "msteams",
	errorMessage: "MSTeams runtime not initialized"
});
//#endregion
export { setMSTeamsRuntime as n, getMSTeamsRuntime as t };
