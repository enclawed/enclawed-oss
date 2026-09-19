import { n as getDiagnosticSessionState } from "./diagnostic-session-state-CmAgieb8.js";
import { c as logToolLoopAction } from "./diagnostic-CMxDD9Ft.js";
import { n as recordToolCall, r as recordToolCallOutcome, t as detectToolCallLoop } from "./tool-loop-detection-CuZIcG8m.js";
//#region src/agents/pi-tools.before-tool-call.runtime.ts
const beforeToolCallRuntime = {
	getDiagnosticSessionState,
	logToolLoopAction,
	detectToolCallLoop,
	recordToolCall,
	recordToolCallOutcome
};
//#endregion
export { beforeToolCallRuntime };
