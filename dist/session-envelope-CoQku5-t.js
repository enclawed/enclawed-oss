import { n as readSessionUpdatedAt } from "./store-BQvp3QbG.js";
import "./sessions-Cc2mnF-I.js";
import { u as resolveStorePath } from "./paths-CPbkMJ31.js";
import { a as resolveEnvelopeFormatOptions } from "./envelope-Cm_OlshI.js";
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
