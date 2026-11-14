import { n as readSessionUpdatedAt } from "./store-CrJC04MB.js";
import "./sessions-DSXY7ybN.js";
import { u as resolveStorePath } from "./paths-qq5OwN7H.js";
import { a as resolveEnvelopeFormatOptions } from "./envelope-DMDdhtgP.js";
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
