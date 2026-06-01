import { c as normalizeOptionalStringifiedId } from "./string-coerce-BUSzWgUA.js";
import { t as buildAgentSessionKey } from "./resolve-route-C6pTQjkz.js";
//#region src/infra/outbound/base-session-key.ts
function buildOutboundBaseSessionKey(params) {
	return buildAgentSessionKey({
		agentId: params.agentId,
		channel: params.channel,
		accountId: params.accountId,
		peer: params.peer,
		dmScope: params.cfg.session?.dmScope ?? "main",
		identityLinks: params.cfg.session?.identityLinks
	});
}
//#endregion
//#region src/infra/outbound/thread-id.ts
function normalizeOutboundThreadId(value) {
	return normalizeOptionalStringifiedId(value);
}
//#endregion
export { buildOutboundBaseSessionKey as n, normalizeOutboundThreadId as t };
