import { u as normalizeE164 } from "./utils-CrVQlOZJ.js";
import "./account-id-BV5xNTUp.js";
import { i as normalizeChannelId } from "./registry-DAV2wQ3B.js";
import { u as resolveStorePath } from "./paths-Lozvxyih.js";
import { t as loadSessionStore } from "./store-load-BbG7SOzr.js";
import { o as readChannelAllowFromStoreSync } from "./pairing-store-C4OVpJo4.js";
import { t as createPluginRuntimeStore } from "./runtime-store-BT7oTp8V.js";
import "./account-resolution-C-IQLWnK.js";
import "./channel-pairing-DIV-o5ud.js";
import "./channel-targets-C7wpb82c.js";
import "./session-store-runtime-DAI6Gz6C.js";
import { r as resolveDefaultWhatsAppAccountId } from "./account-ids-B3V6IFcG.js";
import { a as resolveWhatsAppAccount } from "./accounts-B2pFLJdv.js";
//#region extensions/whatsapp/src/runtime.ts
const { setRuntime: setWhatsAppRuntime, getRuntime: getWhatsAppRuntime } = createPluginRuntimeStore({
	pluginId: "whatsapp",
	errorMessage: "WhatsApp runtime not initialized"
});
//#endregion
//#region extensions/whatsapp/src/heartbeat-recipients.ts
function getSessionRecipients(cfg) {
	if ((cfg.session?.scope ?? "per-sender") === "global") return [];
	const store = loadSessionStore(resolveStorePath(cfg.session?.store));
	const isGroupKey = (key) => key.includes(":group:") || key.includes(":channel:") || key.includes("@g.us");
	const isCronKey = (key) => key.startsWith("cron:");
	const recipients = Object.entries(store).filter(([key]) => key !== "global" && key !== "unknown").filter(([key]) => !isGroupKey(key) && !isCronKey(key)).map(([_, entry]) => ({
		to: normalizeChannelId(entry?.lastChannel) === "whatsapp" && entry?.lastTo ? normalizeE164(entry.lastTo) : "",
		updatedAt: entry?.updatedAt ?? 0
	})).filter(({ to }) => to.length > 1).toSorted((a, b) => b.updatedAt - a.updatedAt);
	const seen = /* @__PURE__ */ new Set();
	return recipients.filter((recipient) => {
		if (seen.has(recipient.to)) return false;
		seen.add(recipient.to);
		return true;
	});
}
function resolveWhatsAppHeartbeatRecipients(cfg, opts = {}) {
	if (opts.to) return {
		recipients: [normalizeE164(opts.to)],
		source: "flag"
	};
	const sessionRecipients = getSessionRecipients(cfg);
	const resolvedAccountId = opts.accountId?.trim() || resolveDefaultWhatsAppAccountId(cfg) || "default";
	const configuredAllowFrom = (resolveWhatsAppAccount({
		cfg,
		accountId: resolvedAccountId
	}).allowFrom ?? []).filter((value) => value !== "*").map(normalizeE164);
	const storeAllowFrom = readChannelAllowFromStoreSync("whatsapp", process.env, resolvedAccountId).map(normalizeE164);
	const unique = (list) => [...new Set(list.filter(Boolean))];
	const allowFrom = unique([...configuredAllowFrom, ...storeAllowFrom]);
	if (opts.all) return {
		recipients: unique([...sessionRecipients.map((entry) => entry.to), ...allowFrom]),
		source: "all"
	};
	if (allowFrom.length > 0) {
		const allowSet = new Set(allowFrom);
		const authorizedSessionRecipients = sessionRecipients.map((entry) => entry.to).filter((recipient) => allowSet.has(recipient));
		if (authorizedSessionRecipients.length === 1) return {
			recipients: [authorizedSessionRecipients[0]],
			source: "session-single"
		};
		if (authorizedSessionRecipients.length > 1) return {
			recipients: authorizedSessionRecipients,
			source: "session-ambiguous"
		};
		return {
			recipients: allowFrom,
			source: "allowFrom"
		};
	}
	if (sessionRecipients.length === 1) return {
		recipients: [sessionRecipients[0].to],
		source: "session-single"
	};
	if (sessionRecipients.length > 1) return {
		recipients: sessionRecipients.map((entry) => entry.to),
		source: "session-ambiguous"
	};
	return {
		recipients: allowFrom,
		source: "allowFrom"
	};
}
//#endregion
export { getWhatsAppRuntime as n, setWhatsAppRuntime as r, resolveWhatsAppHeartbeatRecipients as t };
