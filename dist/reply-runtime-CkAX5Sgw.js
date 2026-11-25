import { r as logVerbose } from "./globals-BfxXPQT_.js";
import { f as resolveDefaultModelForAgent } from "./model-selection-D0i1_wAd.js";
import { t as requireApiKey } from "./model-auth-runtime-shared-DrbAE6uP.js";
import "./tokens-BUtm7jL_.js";
import "./heartbeat-BdoVcXVm.js";
import { r as getApiKeyForModel } from "./model-auth-DAHQP3vK.js";
import { n as withEnclawedClientIdentity } from "./pi-client-identity-11K4vgyf.js";
import "./chunk-Dr68iyYW.js";
import { n as resolveModelAsync } from "./model-RchFaDx0.js";
import "./dispatch-BCIAaw5m.js";
import "./inbound-dedupe-BD4U5ufk.js";
import "./provider-dispatcher-DAONmMq1.js";
import "./get-reply-BH2D2Ew5.js";
import "./abort-CdxL_URP.js";
import "./btw-command-ufs-6zlE.js";
import { t as prepareModelForSimpleCompletion } from "./simple-completion-transport-BaAIhIlQ.js";
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
		}] }, withEnclawedClientIdentity({
			apiKey,
			maxTokens: 100,
			temperature: .3,
			signal: controller.signal
		}))).content.filter(isTextContentBlock).map((block) => block.text).join("").trim();
		if (!text) return null;
		return text.slice(0, maxLength);
	} finally {
		clearTimeout(timeout);
	}
}
//#endregion
export { generateConversationLabel as t };
