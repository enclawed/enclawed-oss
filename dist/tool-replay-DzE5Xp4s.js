import { AsyncLocalStorage } from "node:async_hooks";
//#region src/agents/tool-replay.ts
const TOOL_REPLAY_KEY = Symbol.for("enclawed.tool-replay");
/** Marks a tool that can re-run itself on a recorded wire exchange. */
const TOOL_WIRE_REPLAY = Symbol.for("enclawed.tool-replay.wire");
/**
* A tool's own declaration of what a call produces outside it: a function
* from the call's parameters to its observation (`ToolObservation`), or null
* when it cannot be determined. Set on the tool object by the tool's owner,
* which knows exactly what the tool sends; the wrapper puts it on each call's
* replay context as `observe`. It must keep exactly what leaves the tool and
* drop only what never does.
*/
const TOOL_OBSERVATION = Symbol.for("enclawed.tool-observation");
function toolReplaySlot() {
	const globals = globalThis;
	let slot = globals[TOOL_REPLAY_KEY];
	if (!slot) {
		slot = { als: new AsyncLocalStorage() };
		globals[TOOL_REPLAY_KEY] = slot;
	}
	return slot;
}
/** Run `fn` as one tool call's replay context. */
function runInToolReplayContext(call, fn) {
	return toolReplaySlot().als.run(call, fn);
}
/** The replay context of the tool call running now, if any. */
function currentToolReplayCall() {
	return toolReplaySlot().als.getStore();
}
/**
* The context of `toolCallId` for a wire-replay tool: what to do with its
* network exchange. `replay` carries the recorded exchange; `record` asks the
* tool to store it on the call (`call.wire`).
*/
function wireReplayFor(toolName, toolCallId) {
	const call = currentToolReplayCall();
	if (!call || call.toolCallId !== toolCallId || call.toolName !== toolName || !call.wireReplay) return;
	const directive = call.directive;
	if (directive?.kind === "replay" && directive.outcome.wire !== void 0) return {
		mode: "replay",
		wire: directive.outcome.wire
	};
	if (directive?.kind === "record") return {
		mode: "record",
		call,
		refresh: directive.refresh === true
	};
}
/**
* A recorded outcome the wrapper reproduces itself (no execute), or null when
* the tool must run (no replay directive, or a wire replay the tool performs).
*/
function resolveDirectReplay(call) {
	const directive = call.directive;
	if (directive?.kind !== "replay") return null;
	if (call.wireReplay && directive.outcome.wire !== void 0) return null;
	return directive.outcome;
}
/** A copy of a recorded result, so a consumer mutating it cannot alter the record. */
function cloneReplayResult(value) {
	try {
		return structuredClone(value);
	} catch {
		return value;
	}
}
//#endregion
export { runInToolReplayContext as a, resolveDirectReplay as i, TOOL_WIRE_REPLAY as n, wireReplayFor as o, cloneReplayResult as r, TOOL_OBSERVATION as t };
