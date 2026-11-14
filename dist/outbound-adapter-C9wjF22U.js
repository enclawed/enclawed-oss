import { a as shouldLogVerbose } from "./globals-BG7h_vab.js";
import { a as chunkText } from "./chunk-wo_Ip6dX.js";
import "./runtime-env-CFGG-NFF.js";
import "./reply-chunking-Bj9RNpwI.js";
import { t as resolveWhatsAppOutboundTarget } from "./resolve-outbound-target-CtOZyDLa.js";
import { n as normalizeWhatsAppPayloadText } from "./outbound-media-contract-DBwbsI1k.js";
import { t as createWhatsAppOutboundBase } from "./outbound-base-CmvELMho.js";
//#region extensions/whatsapp/src/outbound-adapter.ts
let whatsAppSendModulePromise;
function loadWhatsAppSendModule() {
	whatsAppSendModulePromise ??= import("./send-BwwTLPm1.js");
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
