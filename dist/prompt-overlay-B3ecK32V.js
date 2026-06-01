import { h as isGpt5ModelId, m as GPT5_FRIENDLY_PROMPT_OVERLAY, p as GPT5_BEHAVIOR_CONTRACT, v as resolveGpt5PromptOverlayMode, y as resolveGpt5SystemPromptContribution } from "./provider-model-shared-B5LoHGGO.js";
//#region extensions/openai/prompt-overlay.ts
const OPENAI_PROVIDER_IDS = new Set(["openai", "openai-codex"]);
const OPENAI_FRIENDLY_PROMPT_OVERLAY = GPT5_FRIENDLY_PROMPT_OVERLAY;
const OPENAI_GPT5_BEHAVIOR_CONTRACT = GPT5_BEHAVIOR_CONTRACT;
function resolveOpenAIPromptOverlayMode(pluginConfig) {
	return resolveGpt5PromptOverlayMode(void 0, pluginConfig);
}
function shouldApplyOpenAIPromptOverlay(params) {
	return OPENAI_PROVIDER_IDS.has(params.modelProviderId ?? "") && isGpt5ModelId(params.modelId);
}
function resolveOpenAISystemPromptContribution(params) {
	return resolveGpt5SystemPromptContribution({
		config: params.config,
		legacyPluginConfig: params.mode === void 0 ? params.legacyPluginConfig : { personality: params.mode },
		modelId: params.modelId,
		enabled: shouldApplyOpenAIPromptOverlay({
			modelProviderId: params.modelProviderId,
			modelId: params.modelId
		})
	});
}
//#endregion
export { shouldApplyOpenAIPromptOverlay as a, resolveOpenAISystemPromptContribution as i, OPENAI_GPT5_BEHAVIOR_CONTRACT as n, resolveOpenAIPromptOverlayMode as r, OPENAI_FRIENDLY_PROMPT_OVERLAY as t };
