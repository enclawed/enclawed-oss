import "./session-binding-service-d9-ZGmtt.js";
import "./conversation-binding-DwmHX3lI.js";
import "./session-lksLguvu.js";
import "./pairing-store-Cl1cZ2Nn.js";
import "./dm-policy-shared-UR4p8dxW.js";
import "./binding-registry-BS8kgpMs.js";
import "./binding-targets-D-OSu6Dz.js";
import "./binding-routing-BXNbLFh-.js";
import "./thread-bindings-policy-69lcQr29.js";
import "./pairing-labels-3w2RdYGG.js";
//#region src/channels/session-meta.ts
let inboundSessionRuntimePromise = null;
function loadInboundSessionRuntime() {
	inboundSessionRuntimePromise ??= import("./inbound.runtime-CjrYxXZU.js");
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
