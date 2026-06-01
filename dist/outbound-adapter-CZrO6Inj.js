import { a as shouldLogVerbose } from "./globals-CYDryU7g.js";
import { a as chunkText } from "./chunk-CuX0qnHJ.js";
import "./runtime-env-C_ySh74d.js";
import "./reply-chunking-Blnq5PAI.js";
import { t as resolveWhatsAppOutboundTarget } from "./resolve-outbound-target-CpeVQbKu.js";
import { n as normalizeWhatsAppPayloadText } from "./outbound-media-contract-N-kM2nqr.js";
import { t as createWhatsAppOutboundBase } from "./outbound-base-Drn9iiSQ.js";
//#region extensions/whatsapp/src/outbound-adapter.ts
let whatsAppSendModulePromise;
function loadWhatsAppSendModule() {
	whatsAppSendModulePromise ??= import("./send-Dvl46uEI.js");
	return whatsAppSendModulePromise;
}
function normalizeOutboundText(text) {
	return normalizeWhatsAppPayloadText(text);
}
const whatsappOutbound = createWhatsAppOutboundBase({
	chunker: chunkText,
	sendMessageWhatsApp: async (to, text, options) => await (await loadWhatsAppSendModule()).sendMessageWhatsApp(to, normalizeOutboundText(text), { ...options }),
	sendPollWhatsApp: async (to, poll, options) => await (await loadWhatsAppSendModule()).sendPollWhatsApp(to, poll, options),
	shouldLogVerbose: () => shouldLogVerbose(),
	resolveTarget: ({ to, allowFrom, mode }) => resolveWhatsAppOutboundTarget({
		to,
		allowFrom,
		mode
	}),
	normalizeText: normalizeOutboundText,
	skipEmptyText: true
});
//#endregion
export { whatsappOutbound as t };
