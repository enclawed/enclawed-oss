import "./session-binding-service-D8iwGjrM.js";
import "./conversation-binding-BfcBHNcr.js";
import "./session-CgoR3gck.js";
import "./pairing-store-C4OVpJo4.js";
import "./dm-policy-shared-Cu5wU6lb.js";
import "./binding-registry-BFmHk6vN.js";
import "./binding-targets-CfQwzwm9.js";
import "./binding-routing-CVKkP8if.js";
import "./thread-bindings-policy-DKVJGy7n.js";
import "./pairing-labels-rH2M3_X4.js";
//#region src/channels/session-meta.ts
let inboundSessionRuntimePromise = null;
function loadInboundSessionRuntime() {
	inboundSessionRuntimePromise ??= import("./inbound.runtime-B_CoMJpv.js");
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
