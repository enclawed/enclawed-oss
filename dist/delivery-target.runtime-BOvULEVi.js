import { i as normalizeLowercaseStringOrEmpty } from "./string-coerce-BUSzWgUA.js";
import { r as normalizeChatChannelId } from "./ids-DIOx3XOb.js";
import { n as normalizeAccountId } from "./account-id-BV5xNTUp.js";
import { c as normalizeAgentId } from "./session-key-BOC5unB4.js";
import { t as getLoadedChannelPluginForRead } from "./registry-loaded-read-CEuay_Tc.js";
import { i as listRouteBindings } from "./bindings-CnWs55RG.js";
import { h as mapAllowFromEntries } from "./channel-config-helpers-bOV5DWOp.js";
import { t as readChannelAllowFromStoreEntriesSync } from "./allow-from-store-read-C1m1rNQQ.js";
//#region src/routing/bound-account-read.ts
function normalizeBindingChannelId(raw) {
	const normalized = normalizeChatChannelId(raw);
	if (normalized) return normalized;
	return normalizeLowercaseStringOrEmpty(raw) || null;
}
function resolveNormalizedBindingMatch(binding) {
	if (!binding || typeof binding !== "object") return null;
	const match = binding.match;
	if (!match || typeof match !== "object") return null;
	const channelId = normalizeBindingChannelId(match.channel);
	if (!channelId) return null;
	const accountId = typeof match.accountId === "string" ? match.accountId.trim() : "";
	if (!accountId || accountId === "*") return null;
	return {
		agentId: normalizeAgentId(binding.agentId),
		accountId: normalizeAccountId(accountId),
		channelId
	};
}
function resolveFirstBoundAccountId(params) {
	const normalizedChannel = normalizeBindingChannelId(params.channelId);
	if (!normalizedChannel) return;
	const normalizedAgentId = normalizeAgentId(params.agentId);
	for (const binding of listRouteBindings(params.cfg)) {
		const resolved = resolveNormalizedBindingMatch(binding);
		if (resolved && resolved.channelId === normalizedChannel && resolved.agentId === normalizedAgentId) return resolved.accountId;
	}
}
//#endregion
export { getLoadedChannelPluginForRead, mapAllowFromEntries, readChannelAllowFromStoreEntriesSync, resolveFirstBoundAccountId };
