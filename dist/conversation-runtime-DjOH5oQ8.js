import "./session-binding-service-Cl5qdJHJ.js";
import "./conversation-binding-DZI0DQlD.js";
import "./session-D-FoRUvz.js";
import "./pairing-store-BTDKxast.js";
import "./dm-policy-shared-Dt-WdgFq.js";
import "./binding-registry-ve77lFJE.js";
import "./binding-targets-CfxM1Jzc.js";
import "./binding-routing-DFkdbHeY.js";
import "./thread-bindings-policy-noLQaXOc.js";
import "./pairing-labels-BkJZqz2i.js";
//#region src/channels/session-meta.ts
let inboundSessionRuntimePromise = null;
function loadInboundSessionRuntime() {
	inboundSessionRuntimePromise ??= import("./inbound.runtime-DF101Ib1.js");
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
