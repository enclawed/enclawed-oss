import { i as normalizeLowercaseStringOrEmpty } from "./string-coerce-BUSzWgUA.js";
import "./text-runtime-BRbvmj_h.js";
//#region extensions/whatsapp/src/group-session-contract.ts
function resolveLegacyGroupSessionKey(ctx) {
	const from = typeof ctx.From === "string" ? ctx.From.trim() : "";
	const normalized = normalizeLowercaseStringOrEmpty(from);
	if (!from || from.includes(":") || !normalized.endsWith("@g.us")) return null;
	return {
		key: `whatsapp:group:${normalized}`,
		channel: "whatsapp",
		id: normalized,
		chatType: "group"
	};
}
//#endregion
export { resolveLegacyGroupSessionKey as t };
