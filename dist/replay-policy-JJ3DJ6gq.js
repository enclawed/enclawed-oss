import { i as normalizeLowercaseStringOrEmpty } from "./string-coerce-BUSzWgUA.js";
import "./text-runtime-BRbvmj_h.js";
//#region extensions/github-copilot/replay-policy.ts
function buildGithubCopilotReplayPolicy(modelId) {
	return normalizeLowercaseStringOrEmpty(modelId).includes("claude") ? { dropThinkingBlocks: true } : {};
}
//#endregion
export { buildGithubCopilotReplayPolicy as t };
