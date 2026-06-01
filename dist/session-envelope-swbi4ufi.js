import { n as readSessionUpdatedAt } from "./store-BojxuYyw.js";
import "./sessions-BhMvlzjx.js";
import { u as resolveStorePath } from "./paths-Lozvxyih.js";
import { a as resolveEnvelopeFormatOptions } from "./envelope-s3gOWN3j.js";
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
