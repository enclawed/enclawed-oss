import { r as normalizeProviderId } from "./provider-id-JqYiEozY.js";
import { r as streamWithPayloadPatch } from "./moonshot-thinking-stream-wrappers-BEDMtsHT.js";
import "./provider-stream-shared-emBXIITC.js";
import "./provider-model-shared-Cw7Df4po.js";
import { t as isFireworksKimiModelId } from "./model-id-BDol6I42.js";
import { streamSimple } from "@mariozechner/pi-ai/compat";
//#region extensions/fireworks/stream.ts
function isFireworksProviderId(providerId) {
	const normalized = normalizeProviderId(providerId);
	return normalized === "fireworks" || normalized === "fireworks-ai";
}
function createFireworksKimiThinkingDisabledWrapper(baseStreamFn) {
	const underlying = baseStreamFn ?? streamSimple;
	return (model, context, options) => streamWithPayloadPatch(underlying, model, context, options, (payloadObj) => {
		payloadObj.thinking = { type: "disabled" };
		delete payloadObj.reasoning;
		delete payloadObj.reasoning_effort;
		delete payloadObj.reasoningEffort;
	});
}
function wrapFireworksProviderStream(ctx) {
	if (!isFireworksProviderId(ctx.provider) || ctx.model?.api !== "openai-completions" || !isFireworksKimiModelId(ctx.modelId)) return;
	return createFireworksKimiThinkingDisabledWrapper(ctx.streamFn);
}
//#endregion
export { wrapFireworksProviderStream as n, createFireworksKimiThinkingDisabledWrapper as t };
