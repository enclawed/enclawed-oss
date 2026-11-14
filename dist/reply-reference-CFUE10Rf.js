import { s as normalizeOptionalString } from "./string-coerce-BUSzWgUA.js";
//#region src/auto-reply/reply/reply-reference.ts
function isSingleUseReplyToMode(mode) {
	return mode === "first" || mode === "batched";
}
function createReplyReferencePlanner(options) {
	let hasReplied = options.hasReplied ?? false;
	const allowReference = options.allowReference !== false;
	const existingId = normalizeOptionalString(options.existingId);
	const startId = normalizeOptionalString(options.startId);
	const use = () => {
		if (!allowReference) return;
		if (options.replyToMode === "off") return;
		const id = existingId ?? startId;
		if (!id) return;
		if (options.replyToMode === "all") {
			hasReplied = true;
			return id;
		}
		if (isSingleUseReplyToMode(options.replyToMode) && hasReplied) return;
		hasReplied = true;
		return id;
	};
	const peek = () => {
		if (!allowReference) return;
		if (options.replyToMode === "off") return;
		const id = existingId ?? startId;
		if (!id) return;
		if (options.replyToMode === "all") return id;
		if (isSingleUseReplyToMode(options.replyToMode) && hasReplied) return;
		return id;
	};
	const markSent = () => {
		hasReplied = true;
	};
	return {
		use,
		peek,
		markSent,
		hasReplied: () => hasReplied
	};
}
//#endregion
export { isSingleUseReplyToMode as n, createReplyReferencePlanner as t };
