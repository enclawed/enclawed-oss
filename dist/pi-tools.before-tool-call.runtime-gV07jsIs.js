import { n as getDiagnosticSessionState } from "./diagnostic-session-state-cim8x6Os.js";
import { c as logToolLoopAction } from "./diagnostic-DYzj-rdV.js";
import { n as recordToolCall, r as recordToolCallOutcome, t as detectToolCallLoop } from "./tool-loop-detection-CJBjVSU6.js";
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
