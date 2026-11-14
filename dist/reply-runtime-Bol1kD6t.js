import { r as logVerbose } from "./globals-BG7h_vab.js";
import { f as resolveDefaultModelForAgent } from "./model-selection-DBbD8v5w.js";
import { t as requireApiKey } from "./model-auth-runtime-shared-BY5ycfWX.js";
import "./tokens-DaFD6x8I.js";
import "./heartbeat-ebnVH_C_.js";
import { r as getApiKeyForModel } from "./model-auth-DYU4pFYJ.js";
import "./chunk-wo_Ip6dX.js";
import { n as resolveModelAsync } from "./model-pOENWxWA.js";
import "./dispatch-BQrXzm4w.js";
import "./inbound-dedupe-CdBTDCK1.js";
import "./provider-dispatcher-BNLDfniL.js";
import "./get-reply-Bd4_4J6L.js";
import "./abort-J4CFi2n8.js";
import "./btw-command-BD3NPKiY.js";
import { t as prepareModelForSimpleCompletion } from "./simple-completion-transport-BGrmO48t.js";
import { completeSimple } from "@mariozechner/pi-ai/compat";
//#region src/auto-reply/reply/conversation-label-generator.ts
const DEFAULT_MAX_LABEL_LENGTH = 128;
const TIMEOUT_MS = 15e3;
function isTextContentBlock(block) {
	return block.type === "text";
}
async function generateConversationLabel(params) {
	const { userMessage, prompt, cfg, agentId, agentDir } = params;
	const maxLength = typeof params.maxLength === "number" && Number.isFinite(params.maxLength) && params.maxLength > 0 ? Math.floor(params.maxLength) : DEFAULT_MAX_LABEL_LENGTH;
	const modelRef = resolveDefaultModelForAgent({
		cfg,
		agentId
	});
	const resolved = await resolveModelAsync(modelRef.provider, modelRef.model, agentDir, cfg);
	if (!resolved.model) {
		logVerbose(`conversation-label-generator: failed to resolve model ${modelRef.provider}/${modelRef.model}`);
		return null;
	}
	const completionModel = prepareModelForSimpleCompletion({
		model: resolved.model,
		cfg
	});
	const apiKey = requireApiKey(await getApiKeyForModel({
		model: completionModel,
		cfg,
		agentDir
	}), modelRef.provider);
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
	try {
		const text = (await completeSimple(completionModel, { messages: [{
			role: "user",
			content: `${prompt}\n\n${userMessage}`,
			timestamp: Date.now()
		}] }, {
			apiKey,
			maxTokens: 100,
			temperature: .3,
			signal: controller.signal
		})).content.filter(isTextContentBlock).map((block) => block.text).join("").trim();
		if (!text) return null;
		return text.slice(0, maxLength);
	} finally {
		clearTimeout(timeout);
	}
}
//#endregion
export { generateConversationLabel as t };
