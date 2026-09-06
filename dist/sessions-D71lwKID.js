import { a as loadConfig } from "./io-BPigC1a6.js";
import "./store-BkF3pYvh.js";
import { i as resolveMainSessionKey } from "./main-session-DhfOziPO.js";
import { u as resolveStorePath } from "./paths-Lozvxyih.js";
import "./reset-CW6oxcW9.js";
import "./session-key-DeW3t56v.js";
import { t as deliveryContextFromSession } from "./delivery-context.shared-CIWKeEct.js";
import { t as loadSessionStore } from "./store-load-NgoHF_53.js";
import "./transcript-CGYEmALb.js";
import { t as parseSessionThreadInfo } from "./thread-info-nMwa1sVF.js";
import "./targets-Dsi1NGMI.js";
//#region src/config/sessions/main-session.runtime.ts
function resolveMainSessionKeyFromConfig() {
	return resolveMainSessionKey(loadConfig());
}
//#endregion
//#region src/config/sessions/delivery-info.ts
function extractDeliveryInfo(sessionKey) {
	const hasRoutableDeliveryContext = (context) => Boolean(context?.channel && context?.to);
	const { baseSessionKey, threadId } = parseSessionThreadInfo(sessionKey);
	if (!sessionKey || !baseSessionKey) return {
		deliveryContext: void 0,
		threadId
	};
	let deliveryContext;
	try {
		const store = loadSessionStore(resolveStorePath(loadConfig().session?.store));
		let entry = store[sessionKey];
		let storedDeliveryContext = deliveryContextFromSession(entry);
		if (!hasRoutableDeliveryContext(storedDeliveryContext) && baseSessionKey !== sessionKey) {
			entry = store[baseSessionKey];
			storedDeliveryContext = deliveryContextFromSession(entry);
		}
		if (hasRoutableDeliveryContext(storedDeliveryContext)) deliveryContext = {
			channel: storedDeliveryContext.channel,
			to: storedDeliveryContext.to,
			accountId: storedDeliveryContext.accountId,
			threadId: storedDeliveryContext.threadId != null ? String(storedDeliveryContext.threadId) : void 0
		};
	} catch {}
	return {
		deliveryContext,
		threadId
	};
}
//#endregion
export { resolveMainSessionKeyFromConfig as n, extractDeliveryInfo as t };
