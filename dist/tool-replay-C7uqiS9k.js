import { AsyncLocalStorage } from "node:async_hooks";
//#region src/agents/tool-replay.ts
const TOOL_REPLAY_KEY = Symbol.for("enclawed.tool-replay");
/** Marks a tool that can re-run itself on a recorded wire exchange. */
const TOOL_WIRE_REPLAY = Symbol.for("enclawed.tool-replay.wire");
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
export { wireReplayFor as a, runInToolReplayContext as i, cloneReplayResult as n, resolveDirectReplay as r, TOOL_WIRE_REPLAY as t };
