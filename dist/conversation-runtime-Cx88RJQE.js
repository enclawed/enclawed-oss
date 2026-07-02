import "./session-binding-service-D8iwGjrM.js";
import "./conversation-binding-Du1oT9nc.js";
import "./session-BisrWeZx.js";
import "./pairing-store-06vkVxSR.js";
import "./dm-policy-shared-WwSCqkD6.js";
import "./binding-registry-x-yuXD3E.js";
import "./binding-targets-Ddl5U1-Y.js";
import "./binding-routing-BN-7jdgi.js";
import "./thread-bindings-policy-C7l1qVrR.js";
import "./pairing-labels-BvPSVEdO.js";
//#region src/channels/session-meta.ts
let inboundSessionRuntimePromise = null;
function loadInboundSessionRuntime() {
	inboundSessionRuntimePromise ??= import("./inbound.runtime-C76K6uUs.js");
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
