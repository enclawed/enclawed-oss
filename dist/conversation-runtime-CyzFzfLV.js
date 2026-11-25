import "./session-binding-service-By4Xx4Ms.js";
import "./conversation-binding-DqHYrDda.js";
import "./session-C1awWthP.js";
import "./pairing-store-COe6_Sfz.js";
import "./dm-policy-shared-B7zI6pKu.js";
import "./binding-registry-sqoBHD16.js";
import "./binding-targets-BhOAArU0.js";
import "./binding-routing-DkSQoHLw.js";
import "./thread-bindings-policy-DMdNWn-o.js";
import "./pairing-labels-DpTnBmuQ.js";
//#region src/channels/session-meta.ts
let inboundSessionRuntimePromise = null;
function loadInboundSessionRuntime() {
	inboundSessionRuntimePromise ??= import("./inbound.runtime-CiI1e3-C.js");
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
