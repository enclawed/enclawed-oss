import "./session-binding-service-Dy45eAgg.js";
import "./conversation-binding-3o_84I1E.js";
import "./session-Bo6gzrPU.js";
import "./pairing-store-f0EMbN2m.js";
import "./dm-policy-shared-DX-_B8DN.js";
import "./binding-registry-DIar6pSU.js";
import "./binding-targets-BcUq23PW.js";
import "./binding-routing-CF48GUmH.js";
import "./thread-bindings-policy-s3DnUDZm.js";
import "./pairing-labels-DTCLDke2.js";
//#region src/channels/session-meta.ts
let inboundSessionRuntimePromise = null;
function loadInboundSessionRuntime() {
	inboundSessionRuntimePromise ??= import("./inbound.runtime-ZDwKN-Gp.js");
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
