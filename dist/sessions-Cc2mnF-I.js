import { a as loadConfig } from "./io-B2MO_b-F.js";
import "./store-BQvp3QbG.js";
import { i as resolveMainSessionKey } from "./main-session-B05dvjBJ.js";
import { u as resolveStorePath } from "./paths-CPbkMJ31.js";
import "./reset-pybUzyAN.js";
import "./session-key-CgtZWC0U.js";
import { t as deliveryContextFromSession } from "./delivery-context.shared-DYLFvPVv.js";
import { t as loadSessionStore } from "./store-load-DOa6JKcY.js";
import { a as parseSessionThreadInfo } from "./transcript-GIIOjbwx.js";
import "./targets-CzQ8GCtZ.js";
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
