import { a as toToolDefinitions } from "./pi-tool-definition-adapter--G7g-Whg.js";
import { t as createAgentToolResultMiddlewareRunner } from "./tool-result-middleware-COoHofgr.js";
//#region src/agents/pi-embedded-runner/tool-split.ts
function splitSdkTools(options) {
	const { tools, hookContext } = options;
	const resultMiddleware = options.resultMiddleware ?? createAgentToolResultMiddlewareRunner({
		runtime: "pi",
		...hookContext?.agentId ? { agentId: hookContext.agentId } : {},
		...hookContext?.sessionId ? { sessionId: hookContext.sessionId } : {},
		...hookContext?.sessionKey ? { sessionKey: hookContext.sessionKey } : {},
		...hookContext?.runId ? { runId: hookContext.runId } : {}
	});
	return {
		builtInTools: [],
		customTools: toToolDefinitions(tools, {
			...hookContext ? { hookContext } : {},
			resultMiddleware
		})
	};
}
/**
* The `tools` allowlist for pi's createAgentSession: the built-in names plus
* every custom tool's name. pi applies the allowlist to custom tools too, so
* leaving them out would start the session with no tools at all.
*/
function sdkActiveToolNames(builtInTools, customTools) {
	return [...builtInTools, ...customTools.map((tool) => tool.name)];
}
//#endregion
export { splitSdkTools as n, sdkActiveToolNames as t };
