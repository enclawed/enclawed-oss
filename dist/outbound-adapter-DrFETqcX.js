import { a as shouldLogVerbose } from "./globals-CFCun_tB.js";
import { a as chunkText } from "./chunk-KCkZBnAo.js";
import "./runtime-env-COg6YcJg.js";
import "./reply-chunking-C849W8gd.js";
import { t as resolveWhatsAppOutboundTarget } from "./resolve-outbound-target-Bp0VkQDy.js";
import { n as normalizeWhatsAppPayloadText } from "./outbound-media-contract-BldsMByo.js";
import { t as createWhatsAppOutboundBase } from "./outbound-base-Du0ysHma.js";
//#region extensions/whatsapp/src/outbound-adapter.ts
let whatsAppSendModulePromise;
function loadWhatsAppSendModule() {
	whatsAppSendModulePromise ??= import("./send-L5vDQrcW.js");
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
