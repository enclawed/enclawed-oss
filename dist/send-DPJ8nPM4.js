import { i as getChildLogger } from "./logger-K1GaCajM.js";
import { t as createSubsystemLogger } from "./subsystem-BCgIuXto.js";
import { t as formatCliCommand } from "./command-format-Dyt7cO_V.js";
import { t as redactIdentifier } from "./redact-identifier-Bi4QsxoM.js";
import { t as loadWebMedia } from "./web-media-DrlSe7E8.js";
import { n as normalizePollInput } from "./polls-Dk8aYlEx.js";
import { a as generateSecureUuid } from "./secure-random-BS1VAixN.js";
import { t as resolveMarkdownTableMode } from "./markdown-tables-cmjIEZ-F.js";
import { t as convertMarkdownTables } from "./tables-B1ybk-bZ.js";
import "./core-UU0-jm9g.js";
import "./runtime-env-COg6YcJg.js";
import { t as requireRuntimeConfig } from "./plugin-config-runtime-BcUNnNXZ.js";
import "./web-media-CQE3tyAf.js";
import "./cli-runtime-C4BYE0ee.js";
import "./logging-core-CHmJ27RF.js";
import "./markdown-table-runtime-Ch25TOpc.js";
import { r as resolveDefaultWhatsAppAccountId } from "./account-ids-BQIx1g4z.js";
import { a as resolveWhatsAppAccount, s as resolveWhatsAppMediaMaxBytes } from "./accounts-fwCguyqz.js";
import { t as getRegisteredWhatsAppConnectionController } from "./connection-controller-registry-CdSf1IpK.js";
import { i as markdownToWhatsApp, o as toWhatsappJid } from "./text-runtime-C9H4ItR2.js";
import { a as resolveWhatsAppOutboundMediaUrls, i as prepareWhatsAppOutboundMedia, n as normalizeWhatsAppPayloadText } from "./outbound-media-contract-BldsMByo.js";
//#region extensions/whatsapp/src/outbound-media.runtime.ts
async function loadOutboundMediaFromUrl(mediaUrl, options = {}) {
	const readFile = options.mediaAccess?.readFile ?? options.mediaReadFile;
	const localRoots = options.mediaAccess?.localRoots?.length && options.mediaAccess.localRoots.length > 0 ? options.mediaAccess.localRoots : options.mediaLocalRoots && options.mediaLocalRoots.length > 0 ? options.mediaLocalRoots : void 0;
	return await loadWebMedia(mediaUrl, readFile ? {
		...options.maxBytes !== void 0 ? { maxBytes: options.maxBytes } : {},
		localRoots: "any",
		readFile,
		hostReadCapability: true
	} : {
		...options.maxBytes !== void 0 ? { maxBytes: options.maxBytes } : {},
		...localRoots ? { localRoots } : {}
	});
}
//#endregion
//#region extensions/whatsapp/src/send.ts
const outboundLog = createSubsystemLogger("gateway/channels/whatsapp").child("outbound");
function resolveOutboundWhatsAppAccountId(params) {
	const explicitAccountId = params.accountId?.trim();
	if (explicitAccountId) return explicitAccountId;
	return resolveDefaultWhatsAppAccountId(params.cfg);
}
function requireOutboundActiveWebListener(params) {
	const resolvedAccountId = resolveOutboundWhatsAppAccountId(params) ?? resolveDefaultWhatsAppAccountId(params.cfg);
	const listener = getRegisteredWhatsAppConnectionController(resolvedAccountId)?.getActiveListener() ?? null;
	if (!listener) throw new Error(`No active WhatsApp Web listener (account: ${resolvedAccountId}). Start the gateway, then link WhatsApp with: ${formatCliCommand(`enclawed channels login --channel whatsapp --account ${resolvedAccountId}`)}.`);
	return {
		accountId: resolvedAccountId,
		listener
	};
}
async function sendMessageWhatsApp(to, body, options) {
	let text = options.preserveLeadingWhitespace ? body : normalizeWhatsAppPayloadText(body);
	const jid = toWhatsappJid(to);
	const primaryMediaUrl = resolveWhatsAppOutboundMediaUrls(options)[0];
	if (!text && !primaryMediaUrl) return {
		messageId: "",
		toJid: jid
	};
	const correlationId = generateSecureUuid();
	const startedAt = Date.now();
	const cfg = requireRuntimeConfig(options.cfg, "WhatsApp send");
	const { listener: active, accountId: resolvedAccountId } = requireOutboundActiveWebListener({
		cfg,
		accountId: options.accountId
	});
	const account = resolveWhatsAppAccount({
		cfg,
		accountId: resolvedAccountId ?? options.accountId
	});
	const tableMode = resolveMarkdownTableMode({
		cfg,
		channel: "whatsapp",
		accountId: resolvedAccountId ?? options.accountId
	});
	text = convertMarkdownTables(text ?? "", tableMode);
	text = markdownToWhatsApp(text);
	const redactedTo = redactIdentifier(to);
	const logger = getChildLogger({
		module: "web-outbound",
		correlationId,
		to: redactedTo
	});
	try {
		const redactedJid = redactIdentifier(jid);
		let mediaBuffer;
		let mediaType;
		let documentFileName;
		let visibleTextAfterVoice;
		if (primaryMediaUrl) {
			const media = await prepareWhatsAppOutboundMedia(await loadOutboundMediaFromUrl(primaryMediaUrl, {
				maxBytes: resolveWhatsAppMediaMaxBytes(account),
				mediaAccess: options.mediaAccess,
				mediaLocalRoots: options.mediaLocalRoots,
				mediaReadFile: options.mediaReadFile
			}), primaryMediaUrl);
			const caption = text || void 0;
			mediaBuffer = media.buffer;
			mediaType = media.mimetype;
			if (media.kind === "audio" && caption) {
				visibleTextAfterVoice = caption;
				text = "";
			} else if (media.kind === "document") {
				text = caption ?? "";
				documentFileName = media.fileName;
			} else text = caption ?? "";
		}
		outboundLog.info(`Sending message -> ${redactedJid}${primaryMediaUrl ? " (media)" : ""}`);
		logger.info({
			jid: redactedJid,
			hasMedia: Boolean(primaryMediaUrl)
		}, "sending message");
		await active.sendComposingTo(to);
		const accountId = Boolean(options.accountId?.trim()) ? resolvedAccountId : void 0;
		const sendOptions = options.gifPlayback || accountId || documentFileName || options.quotedMessageKey ? {
			...options.gifPlayback ? { gifPlayback: true } : {},
			...documentFileName ? { fileName: documentFileName } : {},
			...options.quotedMessageKey ? { quotedMessageKey: options.quotedMessageKey } : {},
			accountId
		} : void 0;
		const result = sendOptions ? await active.sendMessage(to, text, mediaBuffer, mediaType, sendOptions) : await active.sendMessage(to, text, mediaBuffer, mediaType);
		if (visibleTextAfterVoice) if (sendOptions) await active.sendMessage(to, visibleTextAfterVoice, void 0, void 0, sendOptions);
		else await active.sendMessage(to, visibleTextAfterVoice, void 0, void 0);
		const messageId = result?.messageId ?? "unknown";
		const durationMs = Date.now() - startedAt;
		outboundLog.info(`Sent message ${messageId} -> ${redactedJid}${primaryMediaUrl ? " (media)" : ""} (${durationMs}ms)`);
		logger.info({
			jid: redactedJid,
			messageId
		}, "sent message");
		return {
			messageId,
			toJid: jid
		};
	} catch (err) {
		logger.error({
			err: String(err),
			to: redactedTo,
			hasMedia: Boolean(primaryMediaUrl)
		}, "failed to send via web session");
		throw err;
	}
}
async function sendTypingWhatsApp(to, options) {
	const { listener: active } = requireOutboundActiveWebListener({
		cfg: requireRuntimeConfig(options.cfg, "WhatsApp typing send"),
		accountId: options.accountId
	});
	await active.sendComposingTo(to);
}
async function sendReactionWhatsApp(chatJid, messageId, emoji, options) {
	const correlationId = generateSecureUuid();
	const { listener: active } = requireOutboundActiveWebListener({
		cfg: requireRuntimeConfig(options.cfg, "WhatsApp reaction"),
		accountId: options.accountId
	});
	const redactedChatJid = redactIdentifier(chatJid);
	const logger = getChildLogger({
		module: "web-outbound",
		correlationId,
		chatJid: redactedChatJid,
		messageId
	});
	try {
		const redactedJid = redactIdentifier(toWhatsappJid(chatJid));
		outboundLog.info(`Sending reaction "${emoji}" -> message ${messageId}`);
		logger.info({
			chatJid: redactedJid,
			messageId,
			emoji
		}, "sending reaction");
		await active.sendReaction(chatJid, messageId, emoji, options.fromMe ?? false, options.participant);
		outboundLog.info(`Sent reaction "${emoji}" -> message ${messageId}`);
		logger.info({
			chatJid: redactedJid,
			messageId,
			emoji
		}, "sent reaction");
	} catch (err) {
		logger.error({
			err: String(err),
			chatJid: redactedChatJid,
			messageId,
			emoji
		}, "failed to send reaction via web session");
		throw err;
	}
}
async function sendPollWhatsApp(to, poll, options) {
	const correlationId = generateSecureUuid();
	const startedAt = Date.now();
	const { listener: active } = requireOutboundActiveWebListener({
		cfg: requireRuntimeConfig(options.cfg, "WhatsApp poll"),
		accountId: options.accountId
	});
	const redactedTo = redactIdentifier(to);
	const logger = getChildLogger({
		module: "web-outbound",
		correlationId,
		to: redactedTo
	});
	try {
		const jid = toWhatsappJid(to);
		const redactedJid = redactIdentifier(jid);
		const normalized = normalizePollInput(poll, { maxOptions: 12 });
		outboundLog.info(`Sending poll -> ${redactedJid}`);
		logger.info({
			jid: redactedJid,
			optionCount: normalized.options.length,
			maxSelections: normalized.maxSelections
		}, "sending poll");
		const messageId = (await active.sendPoll(to, normalized))?.messageId ?? "unknown";
		const durationMs = Date.now() - startedAt;
		outboundLog.info(`Sent poll ${messageId} -> ${redactedJid} (${durationMs}ms)`);
		logger.info({
			jid: redactedJid,
			messageId
		}, "sent poll");
		return {
			messageId,
			toJid: jid
		};
	} catch (err) {
		logger.error({
			err: String(err),
			to: redactedTo
		}, "failed to send poll via web session");
		throw err;
	}
}
//#endregion
export { sendTypingWhatsApp as i, sendPollWhatsApp as n, sendReactionWhatsApp as r, sendMessageWhatsApp as t };
