import { n as normalizeAccountId } from "./account-id-BV5xNTUp.js";
import { t as resolveAccountEntry } from "./account-lookup-gMqEl4N_.js";
//#region src/config/context-visibility.ts
function resolveDefaultContextVisibility(cfg) {
	return cfg.channels?.defaults?.contextVisibility;
}
function resolveChannelContextVisibilityMode(params) {
	if (params.configuredContextVisibility) return params.configuredContextVisibility;
	const channelConfig = params.cfg.channels?.[params.channel];
	const accountId = normalizeAccountId(params.accountId);
	return resolveAccountEntry(channelConfig?.accounts, accountId)?.contextVisibility ?? channelConfig?.contextVisibility ?? resolveDefaultContextVisibility(params.cfg) ?? "all";
}
//#endregion
export { resolveDefaultContextVisibility as n, resolveChannelContextVisibilityMode as t };
