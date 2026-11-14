import { a as loadConfig } from "./io-BQZoqQ8o.js";
import "./store-CrJC04MB.js";
import { i as resolveMainSessionKey } from "./main-session-chHaIIel.js";
import { u as resolveStorePath } from "./paths-qq5OwN7H.js";
import "./reset-6n7VVY6i.js";
import "./session-key-CgjHE0H4.js";
import { t as deliveryContextFromSession } from "./delivery-context.shared-riPuMkGn.js";
import { t as loadSessionStore } from "./store-load-CZDjfQnz.js";
import "./transcript-DK_GA30x.js";
import { t as parseSessionThreadInfo } from "./thread-info-w_dyJHWf.js";
import "./targets-B8TxaK48.js";
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
