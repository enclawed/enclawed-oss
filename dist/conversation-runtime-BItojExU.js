import "./session-binding-service-D8iwGjrM.js";
import "./conversation-binding-Dr2M6-K6.js";
import "./session-DvOQBvZI.js";
import "./pairing-store-LZO5lxHI.js";
import "./dm-policy-shared-DioTCxGL.js";
import "./binding-registry-p0joxGp3.js";
import "./binding-targets-BThePZsK.js";
import "./binding-routing-WSkWfZVs.js";
import "./thread-bindings-policy-DErtLNPQ.js";
import "./pairing-labels-CiNXiVAS.js";
//#region src/channels/session-meta.ts
let inboundSessionRuntimePromise = null;
function loadInboundSessionRuntime() {
	inboundSessionRuntimePromise ??= import("./inbound.runtime-DfYyvobn.js");
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
