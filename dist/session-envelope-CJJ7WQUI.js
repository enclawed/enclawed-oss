import { n as readSessionUpdatedAt } from "./store-D4aRtgSD.js";
import "./sessions-BGiO5uqq.js";
import { u as resolveStorePath } from "./paths-BGNVd2ln.js";
import { a as resolveEnvelopeFormatOptions } from "./envelope-BXvc7x5C.js";
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
