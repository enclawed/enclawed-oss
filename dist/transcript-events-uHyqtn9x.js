import { s as normalizeOptionalString } from "./string-coerce-BUSzWgUA.js";
//#region src/sessions/pi-transcript-state.ts
/**
* pi-coding-agent >= 0.87 persists its prompt and tool state in the session
* transcript as `role: "system"` message entries: structured prompt sections
* (`sections`, e.g. preamble and the workspace cwd) and tool declarations
* (`toolsAdded` / `toolsRemoved`, with full parameter schemas). They are
* request-building state, not conversation: Enclawed replaces the prompt at
* request time, and surfaces that show history (chat history, the HTTP/SSE
* history API, live transcript events, MCP and the sessions_history tool) must
* not expose or count them. Enclawed's own synthetic system markers (for
* example compaction dividers tagged with `__enclawed`) carry none of these
* fields and are unaffected.
*
* Leaf module: no imports, so any history surface can use it.
*/
function isPiTranscriptStateMessage(message) {
	if (!message || typeof message !== "object" || Array.isArray(message)) return false;
	const record = message;
	if (record.role !== "system") return false;
	return "sections" in record || "toolsAdded" in record || "toolsRemoved" in record;
}
//#endregion
//#region src/sessions/transcript-events.ts
const SESSION_TRANSCRIPT_LISTENERS = /* @__PURE__ */ new Set();
function onSessionTranscriptUpdate(listener) {
	SESSION_TRANSCRIPT_LISTENERS.add(listener);
	return () => {
		SESSION_TRANSCRIPT_LISTENERS.delete(listener);
	};
}
function emitSessionTranscriptUpdate(update) {
	const normalized = typeof update === "string" ? { sessionFile: update } : {
		sessionFile: update.sessionFile,
		sessionKey: update.sessionKey,
		message: update.message,
		messageId: update.messageId
	};
	const trimmed = normalizeOptionalString(normalized.sessionFile);
	if (!trimmed) return;
	if (normalized.message !== void 0 && isPiTranscriptStateMessage(normalized.message)) return;
	const nextUpdate = {
		sessionFile: trimmed,
		...normalizeOptionalString(normalized.sessionKey) ? { sessionKey: normalizeOptionalString(normalized.sessionKey) } : {},
		...normalized.message !== void 0 ? { message: normalized.message } : {},
		...normalizeOptionalString(normalized.messageId) ? { messageId: normalizeOptionalString(normalized.messageId) } : {}
	};
	for (const listener of SESSION_TRANSCRIPT_LISTENERS) try {
		listener(nextUpdate);
	} catch {}
}
//#endregion
export { onSessionTranscriptUpdate as n, isPiTranscriptStateMessage as r, emitSessionTranscriptUpdate as t };
