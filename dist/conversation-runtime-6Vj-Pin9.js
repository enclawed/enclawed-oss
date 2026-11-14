import "./session-binding-service-B8FEUcTX.js";
import "./conversation-binding-Cu7asLNC.js";
import "./session-Cwqfnkxs.js";
import "./pairing-store-A3UzXuZ-.js";
import "./dm-policy-shared-B5VD9XJg.js";
import "./binding-registry-C6BTDy1A.js";
import "./binding-targets-_aWwNgWN.js";
import "./binding-routing-CHrsaEG2.js";
import "./thread-bindings-policy-kVgugXrX.js";
import "./pairing-labels-CSPyrad8.js";
//#region src/channels/session-meta.ts
let inboundSessionRuntimePromise = null;
function loadInboundSessionRuntime() {
	inboundSessionRuntimePromise ??= import("./inbound.runtime-Yqo8pg10.js");
	return inboundSessionRuntimePromise;
}
async function recordInboundSessionMetaSafe(params) {
	const runtime = await loadInboundSessionRuntime();
	const storePath = runtime.resolveStorePath(params.cfg.session?.store, { agentId: params.agentId });
	try {
		await runtime.recordSessionMetaFromInbound({
			storePath,
			sessionKey: params.sessionKey,
			ctx: params.ctx
		});
	} catch (err) {
		params.onError?.(err);
	}
}
//#endregion
export { recordInboundSessionMetaSafe as t };
