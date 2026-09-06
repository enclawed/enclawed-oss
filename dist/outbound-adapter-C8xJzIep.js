import { a as shouldLogVerbose } from "./globals-CYDryU7g.js";
import { a as chunkText } from "./chunk-CJDk7P8-.js";
import "./runtime-env-CcpPjvux.js";
import "./reply-chunking-Dt6F2WSq.js";
import { t as resolveWhatsAppOutboundTarget } from "./resolve-outbound-target-CHuBug7f.js";
import { n as normalizeWhatsAppPayloadText } from "./outbound-media-contract-Dc34xX9x.js";
import { t as createWhatsAppOutboundBase } from "./outbound-base-CzQb3ZJW.js";
//#region extensions/whatsapp/src/outbound-adapter.ts
let whatsAppSendModulePromise;
function loadWhatsAppSendModule() {
	whatsAppSendModulePromise ??= import("./send-DTgQre2k.js");
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
