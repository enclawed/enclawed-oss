import { n as getDiagnosticSessionState } from "./diagnostic-session-state-Dy1E5JMH.js";
import { c as logToolLoopAction } from "./diagnostic-njmJTsiP.js";
import { n as recordToolCall, r as recordToolCallOutcome, t as detectToolCallLoop } from "./tool-loop-detection-jXon7frV.js";
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
