import { a as shouldLogVerbose } from "./globals-BfxXPQT_.js";
import { a as chunkText } from "./chunk-Dr68iyYW.js";
import "./runtime-env-DsOJgfhk.js";
import "./reply-chunking-CorBGfZ3.js";
import { t as resolveWhatsAppOutboundTarget } from "./resolve-outbound-target-PxqZXmui.js";
import { n as normalizeWhatsAppPayloadText } from "./outbound-media-contract-DiHKIdZO.js";
import { t as createWhatsAppOutboundBase } from "./outbound-base-urEyqsql.js";
//#region extensions/whatsapp/src/outbound-adapter.ts
let whatsAppSendModulePromise;
function loadWhatsAppSendModule() {
	whatsAppSendModulePromise ??= import("./send-BOd2eqfF.js");
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
