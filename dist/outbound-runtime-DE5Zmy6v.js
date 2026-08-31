import "./deliver-DqeU4N-T.js";
import { o as isSingleUseReplyToMode } from "./reply-threading-DpSyw8e8.js";
import "./session-context-DJOJqwuW.js";
import "./identity-CnPME7eg.js";
//#region src/infra/outbound/reply-policy.ts
function createReplyToFanout(params) {
	const replyToId = params.replyToId ?? void 0;
	if (!replyToId) return () => void 0;
	if (!(params.replyToIdSource !== "explicit" && params.replyToMode !== void 0 && isSingleUseReplyToMode(params.replyToMode))) return () => replyToId;
	let current = replyToId;
	return () => {
		const value = current;
		current = void 0;
		return value;
	};
}
//#endregion
export { createReplyToFanout as t };
