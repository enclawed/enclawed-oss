import { n as readSessionUpdatedAt } from "./store-eo7yB1I1.js";
import "./sessions-Dq3XJ_x5.js";
import { u as resolveStorePath } from "./paths-CADYkZ1j.js";
import { a as resolveEnvelopeFormatOptions } from "./envelope-DTSFWzJ1.js";
//#region src/channels/session-envelope.ts
function resolveInboundSessionEnvelopeContext(params) {
	const storePath = resolveStorePath(params.cfg.session?.store, { agentId: params.agentId });
	return {
		storePath,
		envelopeOptions: resolveEnvelopeFormatOptions(params.cfg),
		previousTimestamp: readSessionUpdatedAt({
			storePath,
			sessionKey: params.sessionKey
		})
	};
}
//#endregion
export { resolveInboundSessionEnvelopeContext as t };
