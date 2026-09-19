import { i as normalizeLowercaseStringOrEmpty } from "./string-coerce-BUSzWgUA.js";
import { r as normalizeChatChannelId } from "./ids-BArxFn_a.js";
import { n as normalizeAccountId } from "./account-id-6Mvnxe99.js";
import { c as normalizeAgentId } from "./session-key-D8SZau-8.js";
import { t as getLoadedChannelPluginForRead } from "./registry-loaded-read-DaCp-CLf.js";
import { i as listRouteBindings } from "./bindings-CQlzwnhb.js";
import { h as mapAllowFromEntries } from "./channel-config-helpers-D7nTNM6O.js";
import { t as readChannelAllowFromStoreEntriesSync } from "./allow-from-store-read-BYQgiyTk.js";
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
