import { S as truncateUtf16Safe } from "./utils-BcQ7uNrT.js";
import { t as createSubsystemLogger } from "./subsystem-BCgIuXto.js";
//#region src/agents/harness/tool-result-middleware.ts
const log = createSubsystemLogger("agents/harness");
const MAX_MIDDLEWARE_CONTENT_BLOCKS = 200;
const MAX_MIDDLEWARE_TEXT_CHARS = 1e5;
const MAX_MIDDLEWARE_IMAGE_DATA_CHARS = 5e6;
const MAX_MIDDLEWARE_DETAILS_BYTES = 1e5;
const MAX_MIDDLEWARE_DETAILS_DEPTH = 20;
const MAX_MIDDLEWARE_DETAILS_KEYS = 1e3;
function isRecord(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}
function isValidMiddlewareContentBlock(value) {
	if (!isRecord(value) || typeof value.type !== "string") return false;
	if (value.type === "text") return typeof value.text === "string" && value.text.length <= MAX_MIDDLEWARE_TEXT_CHARS;
	if (value.type === "image") return typeof value.mimeType === "string" && value.mimeType.trim().length > 0 && typeof value.data === "string" && value.data.length <= MAX_MIDDLEWARE_IMAGE_DATA_CHARS;
	return false;
}
function isValidMiddlewareDetails(value, state = {
	keys: 0,
	bytes: 0,
	seen: /* @__PURE__ */ new WeakSet()
}, depth = 0) {
	if (value === void 0 || value === null) return true;
	if (depth > MAX_MIDDLEWARE_DETAILS_DEPTH) return false;
	if (typeof value === "string") {
		state.bytes += value.length;
		return state.bytes <= MAX_MIDDLEWARE_DETAILS_BYTES;
	}
	if (typeof value === "number" || typeof value === "boolean") {
		state.bytes += String(value).length;
		return state.bytes <= MAX_MIDDLEWARE_DETAILS_BYTES;
	}
	if (typeof value !== "object") return false;
	if (state.seen.has(value)) return false;
	state.seen.add(value);
	if (Array.isArray(value)) {
		state.keys += value.length;
		if (state.keys > MAX_MIDDLEWARE_DETAILS_KEYS) return false;
		for (const entry of value) if (!isValidMiddlewareDetails(entry, state, depth + 1)) return false;
		return true;
	}
	for (const [key, entry] of Object.entries(value)) {
		state.keys += 1;
		state.bytes += key.length;
		if (state.keys > MAX_MIDDLEWARE_DETAILS_KEYS || state.bytes > MAX_MIDDLEWARE_DETAILS_BYTES) return false;
		if (!isValidMiddlewareDetails(entry, state, depth + 1)) return false;
	}
	return true;
}
function isValidMiddlewareToolResult(value) {
	if (!isRecord(value) || !Array.isArray(value.content)) return false;
	if (value.content.length > MAX_MIDDLEWARE_CONTENT_BLOCKS) return false;
	return value.content.every(isValidMiddlewareContentBlock) && isValidMiddlewareDetails(value.details);
}
function buildMiddlewareFailureResult() {
	return {
		content: [{
			type: "text",
			text: "Tool output unavailable due to post-processing error."
		}],
		details: {
			status: "error",
			middlewareError: true
		}
	};
}
function createAgentToolResultMiddlewareRunner(ctx, handlers) {
	const middlewareContext = {
		...ctx,
		harness: ctx.harness ?? ctx.runtime
	};
	let resolvedHandlers = handlers;
	let resolvedHandlersPromise;
	const resolveHandlers = async () => {
		if (resolvedHandlers) return resolvedHandlers;
		resolvedHandlersPromise ??= import("./agent-tool-result-middleware-loader-DyTXPuBh.js").then(({ loadAgentToolResultMiddlewaresForRuntime }) => loadAgentToolResultMiddlewaresForRuntime({ runtime: ctx.runtime }));
		resolvedHandlers = await resolvedHandlersPromise;
		return resolvedHandlers;
	};
	return { async applyToolResultMiddleware(event) {
		let current = event.result;
		const handlers = await resolveHandlers();
		const originalWithinBounds = handlers.length === 0 || isValidMiddlewareToolResult(event.result);
		for (const handler of handlers) try {
			const next = await handler({
				...event,
				result: current
			}, middlewareContext);
			const candidate = next?.result ?? current;
			if (!next?.result && !originalWithinBounds && candidate === event.result) continue;
			if (isValidMiddlewareToolResult(candidate)) current = candidate;
			else {
				log.warn(`[${ctx.runtime}] discarded invalid tool result middleware output for ${truncateUtf16Safe(event.toolName, 120)}`);
				return buildMiddlewareFailureResult();
			}
		} catch {
			log.warn(`[${ctx.runtime}] tool result middleware failed for ${truncateUtf16Safe(event.toolName, 120)}`);
			return buildMiddlewareFailureResult();
		}
		return current;
	} };
}
//#endregion
export { createAgentToolResultMiddlewareRunner as t };
