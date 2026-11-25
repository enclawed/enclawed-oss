import { s as normalizeOptionalString } from "./string-coerce-BUSzWgUA.js";
import { n as getBundledChannelPlugin } from "./bundled-BF24hsTG.js";
import { a as normalizeAnyChannelId } from "./registry--Iw3_C4j.js";
import { n as listLoadedChannelPlugins, t as getLoadedChannelPluginById } from "./registry-loaded-DQojGv-9.js";
//#region src/channels/plugins/registry.ts
function listChannelPlugins() {
	return listLoadedChannelPlugins();
}
function getLoadedChannelPlugin(id) {
	const resolvedId = normalizeOptionalString(id) ?? "";
	if (!resolvedId) return;
	return getLoadedChannelPluginById(resolvedId);
}
function getChannelPlugin(id) {
	const resolvedId = normalizeOptionalString(id) ?? "";
	if (!resolvedId) return;
	return getLoadedChannelPlugin(resolvedId) ?? getBundledChannelPlugin(resolvedId);
}
function normalizeChannelId(raw) {
	return normalizeAnyChannelId(raw);
}
//#endregion
export { normalizeChannelId as i, getLoadedChannelPlugin as n, listChannelPlugins as r, getChannelPlugin as t };
