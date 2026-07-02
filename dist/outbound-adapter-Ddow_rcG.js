import { a as shouldLogVerbose } from "./globals-CYDryU7g.js";
import { a as chunkText } from "./chunk-CuX0qnHJ.js";
import "./runtime-env-CUR54nHA.js";
import "./reply-chunking-jYoZZ7NC.js";
import { t as resolveWhatsAppOutboundTarget } from "./resolve-outbound-target-Cs3xieeK.js";
import { n as normalizeWhatsAppPayloadText } from "./outbound-media-contract-YRgu31r3.js";
import { t as createWhatsAppOutboundBase } from "./outbound-base-J520yiU5.js";
//#region extensions/whatsapp/src/outbound-adapter.ts
let whatsAppSendModulePromise;
function loadWhatsAppSendModule() {
	whatsAppSendModulePromise ??= import("./send-IvnJ1vpm.js");
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
