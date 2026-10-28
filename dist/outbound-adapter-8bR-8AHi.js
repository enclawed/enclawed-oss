import { a as shouldLogVerbose } from "./globals-D8R_YQwt.js";
import { a as chunkText } from "./chunk-_i16mZcD.js";
import "./runtime-env-I1Ganeuv.js";
import "./reply-chunking-CGhb1HK5.js";
import { t as resolveWhatsAppOutboundTarget } from "./resolve-outbound-target-K_ka5TXN.js";
import { n as normalizeWhatsAppPayloadText } from "./outbound-media-contract-Bl_kg5Mg.js";
import { t as createWhatsAppOutboundBase } from "./outbound-base-CyelQxSv.js";
//#region extensions/whatsapp/src/outbound-adapter.ts
let whatsAppSendModulePromise;
function loadWhatsAppSendModule() {
	whatsAppSendModulePromise ??= import("./send-CfD14ZB3.js");
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
