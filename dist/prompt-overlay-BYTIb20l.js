import { _ as renderGpt5PromptOverlay, p as GPT5_BEHAVIOR_CONTRACT, y as resolveGpt5SystemPromptContribution } from "./provider-model-shared-B5LoHGGO.js";
//#region extensions/codex/prompt-overlay.ts
const CODEX_GPT5_BEHAVIOR_CONTRACT = GPT5_BEHAVIOR_CONTRACT;
function resolveCodexSystemPromptContribution(params) {
	return resolveGpt5SystemPromptContribution(params);
}
function renderCodexPromptOverlay(params) {
	return renderGpt5PromptOverlay(params);
}
//#endregion
export { renderCodexPromptOverlay as n, resolveCodexSystemPromptContribution as r, CODEX_GPT5_BEHAVIOR_CONTRACT as t };
