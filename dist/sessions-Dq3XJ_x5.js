import { a as loadConfig } from "./io-Dzvn-wpi.js";
import "./store-eo7yB1I1.js";
import { i as resolveMainSessionKey } from "./main-session-DWqaDaEZ.js";
import { u as resolveStorePath } from "./paths-CADYkZ1j.js";
import "./reset-CcILeDDI.js";
import "./session-key-C6lvJcrM.js";
import { t as deliveryContextFromSession } from "./delivery-context.shared-B7S7hCmE.js";
import { t as loadSessionStore } from "./store-load-C5fhLNaT.js";
import "./transcript-CdDH2u9f.js";
import { t as parseSessionThreadInfo } from "./thread-info-C6jU7FZH.js";
import "./targets-BtW2-P1D.js";
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
