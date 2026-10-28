import { o as updateSessionStore } from "./store-eo7yB1I1.js";
import { n as mergeSessionEntry } from "./types-BBvDQ1eb.js";
import { h as hasInternalRuntimeContext } from "./sanitize-user-facing-text-B5AP2eg1.js";
import { t as formatAgentInternalEventsForPrompt } from "./internal-events-C9mhM6zX.js";
//#region src/agents/command/attempt-execution.shared.ts
async function persistSessionEntry(params) {
	const persisted = await updateSessionStore(params.storePath, (store) => {
		const merged = mergeSessionEntry(store[params.sessionKey], params.entry);
		for (const field of params.clearedFields ?? []) if (!Object.hasOwn(params.entry, field)) Reflect.deleteProperty(merged, field);
		store[params.sessionKey] = merged;
		return merged;
	});
	params.sessionStore[params.sessionKey] = persisted;
}
function prependInternalEventContext(body, events) {
	if (hasInternalRuntimeContext(body)) return body;
	const renderedEvents = formatAgentInternalEventsForPrompt(events);
	if (!renderedEvents) return body;
	return [renderedEvents, body].filter(Boolean).join("\n\n");
}
//#endregion
export { prependInternalEventContext as n, persistSessionEntry as t };
