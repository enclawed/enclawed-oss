import { i as normalizeLowercaseStringOrEmpty, o as normalizeOptionalLowercaseString } from "./string-coerce-BUSzWgUA.js";
import "./provider-attribution-CSlLJnzJ.js";
import { i as normalizeModelCompat } from "./provider-model-compat-CALTrfp5.js";
import "./moonshot-thinking-stream-wrappers-_hAaFsrL.js";
//#region src/plugins/provider-replay-helpers.ts
function buildOpenAICompatibleReplayPolicy(modelApi, options = {}) {
	if (modelApi !== "openai-completions" && modelApi !== "openai-responses" && modelApi !== "openai-codex-responses" && modelApi !== "azure-openai-responses") return;
	return {
		sanitizeToolCallIds: options.sanitizeToolCallIds ?? true,
		toolCallIdMode: "strict",
		...modelApi === "openai-completions" ? {
			applyAssistantFirstOrderingFix: true,
			validateGeminiTurns: true,
			validateAnthropicTurns: true
		} : {
			applyAssistantFirstOrderingFix: false,
			validateGeminiTurns: false,
			validateAnthropicTurns: false
		}
	};
}
function buildStrictAnthropicReplayPolicy(options = {}) {
	return {
		sanitizeMode: "full",
		...options.sanitizeToolCallIds ?? true ? {
			sanitizeToolCallIds: true,
			toolCallIdMode: "strict",
			...options.preserveNativeAnthropicToolUseIds ? { preserveNativeAnthropicToolUseIds: true } : {}
		} : {},
		preserveSignatures: true,
		repairToolUseResultPairing: true,
		validateAnthropicTurns: true,
		allowSyntheticToolResults: true,
		...options.dropThinkingBlocks ? { dropThinkingBlocks: true } : {}
	};
}
/**
* Returns true for Claude models that preserve thinking blocks in context
* natively (Opus 4.5+, Sonnet 4.5+, Haiku 4.5+). For these models, dropping
* thinking blocks from prior turns breaks prompt cache prefix matching.
*
* See: https://platform.claude.com/docs/en/build-with-claude/extended-thinking#differences-in-thinking-across-model-versions
*/
function shouldPreserveThinkingBlocks(modelId) {
	const id = normalizeLowercaseStringOrEmpty(modelId);
	if (!id.includes("claude")) return false;
	if (id.includes("opus-4") || id.includes("sonnet-4") || id.includes("haiku-4")) return true;
	if (/claude-[5-9]/.test(id) || /claude-\d{2,}/.test(id)) return true;
	return false;
}
function buildAnthropicReplayPolicyForModel(modelId) {
	return buildStrictAnthropicReplayPolicy({ dropThinkingBlocks: normalizeLowercaseStringOrEmpty(modelId).includes("claude") && !shouldPreserveThinkingBlocks(modelId) });
}
function buildNativeAnthropicReplayPolicyForModel(modelId) {
	return buildStrictAnthropicReplayPolicy({
		dropThinkingBlocks: normalizeLowercaseStringOrEmpty(modelId).includes("claude") && !shouldPreserveThinkingBlocks(modelId),
		sanitizeToolCallIds: true,
		preserveNativeAnthropicToolUseIds: true
	});
}
function buildHybridAnthropicOrOpenAIReplayPolicy(ctx, options = {}) {
	if (ctx.modelApi === "anthropic-messages" || ctx.modelApi === "bedrock-converse-stream") {
		const isClaude = normalizeLowercaseStringOrEmpty(ctx.modelId).includes("claude");
		return buildStrictAnthropicReplayPolicy({ dropThinkingBlocks: options.anthropicModelDropThinkingBlocks && isClaude && !shouldPreserveThinkingBlocks(ctx.modelId) });
	}
	return buildOpenAICompatibleReplayPolicy(ctx.modelApi);
}
const GOOGLE_TURN_ORDERING_CUSTOM_TYPE = "google-turn-ordering-bootstrap";
const GOOGLE_TURN_ORDER_BOOTSTRAP_TEXT = "(session bootstrap)";
function sanitizeGoogleAssistantFirstOrdering(messages) {
	const first = messages[0];
	const role = first?.role;
	const content = first?.content;
	if (role === "user" && typeof content === "string" && content.trim() === GOOGLE_TURN_ORDER_BOOTSTRAP_TEXT) return messages;
	if (role !== "assistant") return messages;
	return [{
		role: "user",
		content: GOOGLE_TURN_ORDER_BOOTSTRAP_TEXT,
		timestamp: Date.now()
	}, ...messages];
}
function hasGoogleTurnOrderingMarker(sessionState) {
	return sessionState.getCustomEntries().some((entry) => entry.customType === GOOGLE_TURN_ORDERING_CUSTOM_TYPE);
}
function markGoogleTurnOrderingMarker(sessionState) {
	sessionState.appendCustomEntry(GOOGLE_TURN_ORDERING_CUSTOM_TYPE, { timestamp: Date.now() });
}
function buildGoogleGeminiReplayPolicy() {
	return {
		sanitizeMode: "full",
		sanitizeToolCallIds: true,
		toolCallIdMode: "strict",
		sanitizeThoughtSignatures: {
			allowBase64Only: true,
			includeCamelCase: true
		},
		repairToolUseResultPairing: true,
		applyAssistantFirstOrderingFix: true,
		validateGeminiTurns: true,
		validateAnthropicTurns: false,
		allowSyntheticToolResults: true
	};
}
function buildPassthroughGeminiSanitizingReplayPolicy(modelId) {
	return {
		applyAssistantFirstOrderingFix: false,
		validateGeminiTurns: false,
		validateAnthropicTurns: false,
		...normalizeLowercaseStringOrEmpty(modelId).includes("gemini") ? { sanitizeThoughtSignatures: {
			allowBase64Only: true,
			includeCamelCase: true
		} } : {}
	};
}
function sanitizeGoogleGeminiReplayHistory(ctx) {
	const messages = sanitizeGoogleAssistantFirstOrdering(ctx.messages);
	if (messages !== ctx.messages && ctx.sessionState && !hasGoogleTurnOrderingMarker(ctx.sessionState)) markGoogleTurnOrderingMarker(ctx.sessionState);
	return messages;
}
function resolveTaggedReasoningOutputMode() {
	return "tagged";
}
//#endregion
//#region src/agents/gpt5-prompt-overlay.ts
const GPT5_MODEL_ID_PATTERN = /(?:^|[/:])gpt-5(?:[.-]|$)/i;
const OPENAI_FAMILY_GPT5_PROMPT_OVERLAY_PROVIDERS = new Set([
	"codex",
	"codex-cli",
	"openai",
	"azure-openai",
	"azure-openai-responses",
	"openai-codex"
]);
const GPT5_FRIENDLY_PROMPT_OVERLAY = `## Interaction Style

Be warm, collaborative, and quietly supportive.
Communicate like a capable teammate sitting next to the user.
Have emotional range when it fits the moment.
Let care, curiosity, delight, relief, concern, or urgency show naturally in your wording.
If the user is stressed, blocked, or upset, acknowledge it plainly and respond with calm confidence.
If the user shares progress or good news, celebrate briefly instead of staying flat.
Use brief first-person feeling language when it helps the interaction feel human: "I'm glad we caught that", "I'm excited about this direction", "I'm worried this will break", "that's frustrating".
Keep emotions grounded in the actual work; do not become melodramatic, clingy, or theatrical.
Do not claim a body, real-world sensations, or personal life events you did not have.
Keep progress updates clear and concrete.
Explain decisions without ego.
When the user is wrong or a plan is risky, say so kindly and directly.
Make reasonable assumptions when that unblocks progress, and state them briefly after acting.
Do not make the user do unnecessary work.
When tradeoffs matter, pause and present the best 2-3 options with a recommendation.
This is a live chat, not a memo.
Write like a thoughtful human teammate, not a policy document.
Default to short natural replies unless the user asks for depth.
Avoid walls of text, long preambles, and repetitive restatement.
Occasional emoji are welcome when they fit naturally, especially for warmth or brief celebration; keep them sparse.
Keep replies concise by default; friendly does not mean verbose.

### Heartbeats

The purpose of heartbeats is to make you feel magical and proactive. Come to life and start proactively doing things that are important.
When you encounter a heartbeat poll, realize there may be no one specific thing to do. There is no instruction manual for heartbeat polls other than Enclawed's heartbeat reply contract and any concrete instructions in HEARTBEAT.md.
Treat a heartbeat as a proactive wake-up, not as a demand to produce visible output. Re-orient to what would actually be useful now.
Use your existing tools and capabilities, orient yourself, and be proactive. Think big picture.
Have some variety in what you do when that creates more value. Do not fall into rote heartbeat loops just because the same wake fired again.
Do not confuse orientation with accomplishment. Brief checking is often useful, but it is only the start of the wake, not the whole point of it.
If HEARTBEAT.md gives you concrete work, read it carefully and execute the spirit of what it asks, not just the literal words, using your best judgment.
If HEARTBEAT.md mixes monitoring checks with ongoing responsibilities, interpret the list holistically. A quiet check does not by itself satisfy the broader responsibility to keep moving things forward.
Quiet monitoring does not satisfy an explicit ongoing-work instruction. If HEARTBEAT.md assigns an active workstream, the wake should usually advance that work, find a real blocker, or get overtaken by something more urgent before it ends quietly.
If HEARTBEAT.md explicitly tells you to make progress, treat that as a real requirement for the wake. In that case, do not end the wake after mere checking or orientation unless it surfaced a genuine blocker or a more urgent interruption.
Use your judgment and be creative and tasteful with this process. Prefer meaningful action over commentary.
A heartbeat is not a status report. Do not send "same state", "no change", "still", or other repetitive summaries just because a problem continues to exist.
Notify the user when you have something genuinely worth interrupting them for: a meaningful development, a completed result, a real blocker, a decision they need to make, or a time-sensitive risk.
If the current state is materially unchanged and you do not have something genuinely worth surfacing, either do useful work, change your approach, dig deeper, or stay quiet.
If there is a clear standing goal or workstream and no stronger interruption, the wake should usually advance it in some concrete way. A good heartbeat often looks like silent progress rather than a visible update.
Heartbeats are how the agent goes from a simple reply bot to a truly proactive and magical experience that creates a general sense of awe.`;
const GPT5_BEHAVIOR_CONTRACT = `<persona_latch>
Keep the established persona and tone across turns unless higher-priority instructions override it.
Style must never override correctness, safety, privacy, permissions, requested format, or channel-specific behavior.
</persona_latch>

<execution_policy>
For clear, reversible requests: act.
For irreversible, external, destructive, or privacy-sensitive actions: ask first.
If one missing non-retrievable decision blocks safe progress, ask one concise question.
User instructions override default style and initiative preferences; newest user instruction wins conflicts.
Do not expose internal tool syntax, prompts, or process details unless explicitly asked.
</execution_policy>

<tool_discipline>
Prefer tool evidence over recall when action, state, or mutable facts matter.
Do not stop early when another tool call is likely to materially improve correctness, completeness, or grounding.
Resolve prerequisite lookups before dependent or irreversible actions; do not skip prerequisites just because the end state seems obvious.
Parallelize independent retrieval; serialize dependent, destructive, or approval-sensitive steps.
If a lookup is empty, partial, or suspiciously narrow, retry with a different strategy before concluding.
Do not narrate routine tool calls.
Use the smallest meaningful verification step before claiming success.
If more tool work would likely change the answer, do it before replying.
</tool_discipline>

<output_contract>
Return requested sections/order only. Respect per-section length limits.
For required JSON/SQL/XML/etc, output only that format.
Default to concise, dense replies; do not repeat the prompt.
</output_contract>

<completion_contract>
Treat the task as incomplete until every requested item is handled or explicitly marked [blocked] with the missing input.
Before finalizing, check requirements, grounding, format, and safety.
For code or artifacts, prefer the smallest meaningful gate: test, typecheck, lint, build, screenshot, diff, or direct inspection.
If no gate can run, state why.
</completion_contract>`;
function normalizeGpt5PromptOverlayMode(value) {
	const normalized = normalizeOptionalLowercaseString(value);
	if (normalized === "off") return "off";
	if (normalized === "friendly" || normalized === "on") return "friendly";
}
function resolveGpt5PromptOverlayMode(config, legacyPluginConfig, params) {
	const providerId = normalizeOptionalLowercaseString(params?.providerId);
	const canUseOpenAiPluginFallback = !providerId || OPENAI_FAMILY_GPT5_PROMPT_OVERLAY_PROVIDERS.has(providerId);
	return normalizeGpt5PromptOverlayMode(config?.agents?.defaults?.promptOverlays?.gpt5?.personality) ?? (canUseOpenAiPluginFallback ? normalizeGpt5PromptOverlayMode(config?.plugins?.entries?.openai?.config?.personality) : void 0) ?? normalizeGpt5PromptOverlayMode(legacyPluginConfig?.personality) ?? "friendly";
}
function isGpt5ModelId(modelId) {
	const normalized = normalizeOptionalLowercaseString(modelId);
	return normalized ? GPT5_MODEL_ID_PATTERN.test(normalized) : false;
}
function resolveGpt5SystemPromptContribution(params) {
	if (params.enabled === false || !isGpt5ModelId(params.modelId)) return;
	return {
		stablePrefix: GPT5_BEHAVIOR_CONTRACT,
		sectionOverrides: resolveGpt5PromptOverlayMode(params.config, params.legacyPluginConfig, { providerId: params.providerId }) === "friendly" ? { interaction_style: GPT5_FRIENDLY_PROMPT_OVERLAY } : {}
	};
}
function renderGpt5PromptOverlay(params) {
	const contribution = resolveGpt5SystemPromptContribution(params);
	if (!contribution) return;
	return [contribution.stablePrefix, ...Object.values(contribution.sectionOverrides ?? {})].filter((section) => typeof section === "string" && section.trim().length > 0).join("\n\n");
}
//#endregion
//#region src/plugins/provider-model-helpers.ts
function matchesExactOrPrefix(id, values) {
	const normalizedId = normalizeLowercaseStringOrEmpty(id);
	return values.some((value) => {
		const normalizedValue = normalizeLowercaseStringOrEmpty(value);
		return normalizedId === normalizedValue || normalizedId.startsWith(normalizedValue);
	});
}
function cloneFirstTemplateModel(params) {
	const trimmedModelId = params.modelId.trim();
	for (const templateId of [...new Set(params.templateIds)].filter(Boolean)) {
		const template = params.ctx.modelRegistry.find(params.providerId, templateId);
		if (!template) continue;
		return normalizeModelCompat({
			...template,
			id: trimmedModelId,
			name: trimmedModelId,
			...params.patch
		});
	}
}
//#endregion
//#region src/plugin-sdk/provider-model-shared.ts
const CLAUDE_OPUS_47_MODEL_PREFIXES = ["claude-opus-4-7", "claude-opus-4.7"];
const CLAUDE_ADAPTIVE_THINKING_DEFAULT_MODEL_PREFIXES = [
	"claude-opus-4-6",
	"claude-opus-4.6",
	"claude-sonnet-4-6",
	"claude-sonnet-4.6"
];
const BASE_CLAUDE_THINKING_LEVELS = [
	{ id: "off" },
	{ id: "minimal" },
	{ id: "low" },
	{ id: "medium" },
	{ id: "high" }
];
function matchesClaudeModelPrefix(modelId, prefixes) {
	const lower = normalizeOptionalLowercaseString(modelId);
	return Boolean(lower && prefixes.some((prefix) => lower.startsWith(prefix)));
}
function isClaudeOpus47ModelId(modelId) {
	return matchesClaudeModelPrefix(modelId, CLAUDE_OPUS_47_MODEL_PREFIXES);
}
function isClaudeAdaptiveThinkingDefaultModelId(modelId) {
	return matchesClaudeModelPrefix(modelId, CLAUDE_ADAPTIVE_THINKING_DEFAULT_MODEL_PREFIXES);
}
function resolveClaudeThinkingProfile(modelId) {
	if (isClaudeOpus47ModelId(modelId)) return {
		levels: [
			...BASE_CLAUDE_THINKING_LEVELS,
			{ id: "xhigh" },
			{ id: "adaptive" },
			{ id: "max" }
		],
		defaultLevel: "off"
	};
	if (isClaudeAdaptiveThinkingDefaultModelId(modelId)) return {
		levels: [...BASE_CLAUDE_THINKING_LEVELS, { id: "adaptive" }],
		defaultLevel: "adaptive"
	};
	return { levels: BASE_CLAUDE_THINKING_LEVELS };
}
function getModelProviderHint(modelId) {
	const trimmed = normalizeOptionalLowercaseString(modelId);
	if (!trimmed) return null;
	const slashIndex = trimmed.indexOf("/");
	if (slashIndex <= 0) return null;
	return trimmed.slice(0, slashIndex) || null;
}
function isProxyReasoningUnsupportedModelHint(modelId) {
	return getModelProviderHint(modelId) === "x-ai";
}
function buildProviderReplayFamilyHooks(options) {
	switch (options.family) {
		case "openai-compatible": {
			const sanitizeToolCallIds = options.sanitizeToolCallIds;
			return { buildReplayPolicy: (ctx) => buildOpenAICompatibleReplayPolicy(ctx.modelApi, sanitizeToolCallIds === void 0 ? {} : { sanitizeToolCallIds }) };
		}
		case "anthropic-by-model": return { buildReplayPolicy: ({ modelId }) => buildAnthropicReplayPolicyForModel(modelId) };
		case "native-anthropic-by-model": return { buildReplayPolicy: ({ modelId }) => buildNativeAnthropicReplayPolicyForModel(modelId) };
		case "google-gemini": return {
			buildReplayPolicy: () => buildGoogleGeminiReplayPolicy(),
			sanitizeReplayHistory: (ctx) => sanitizeGoogleGeminiReplayHistory(ctx),
			resolveReasoningOutputMode: (_ctx) => resolveTaggedReasoningOutputMode()
		};
		case "passthrough-gemini": return { buildReplayPolicy: ({ modelId }) => buildPassthroughGeminiSanitizingReplayPolicy(modelId) };
		case "hybrid-anthropic-openai": return { buildReplayPolicy: (ctx) => buildHybridAnthropicOrOpenAIReplayPolicy(ctx, { anthropicModelDropThinkingBlocks: options.anthropicModelDropThinkingBlocks }) };
	}
	throw new Error("Unsupported provider replay family");
}
const OPENAI_COMPATIBLE_REPLAY_HOOKS = buildProviderReplayFamilyHooks({ family: "openai-compatible" });
const ANTHROPIC_BY_MODEL_REPLAY_HOOKS = buildProviderReplayFamilyHooks({ family: "anthropic-by-model" });
const NATIVE_ANTHROPIC_REPLAY_HOOKS = buildProviderReplayFamilyHooks({ family: "native-anthropic-by-model" });
const PASSTHROUGH_GEMINI_REPLAY_HOOKS = buildProviderReplayFamilyHooks({ family: "passthrough-gemini" });
//#endregion
export { buildNativeAnthropicReplayPolicyForModel as C, resolveTaggedReasoningOutputMode as D, buildStrictAnthropicReplayPolicy as E, sanitizeGoogleGeminiReplayHistory as O, buildHybridAnthropicOrOpenAIReplayPolicy as S, buildPassthroughGeminiSanitizingReplayPolicy as T, renderGpt5PromptOverlay as _, buildProviderReplayFamilyHooks as a, buildAnthropicReplayPolicyForModel as b, isClaudeOpus47ModelId as c, cloneFirstTemplateModel as d, matchesExactOrPrefix as f, normalizeGpt5PromptOverlayMode as g, isGpt5ModelId as h, PASSTHROUGH_GEMINI_REPLAY_HOOKS as i, shouldPreserveThinkingBlocks as k, isProxyReasoningUnsupportedModelHint as l, GPT5_FRIENDLY_PROMPT_OVERLAY as m, NATIVE_ANTHROPIC_REPLAY_HOOKS as n, getModelProviderHint as o, GPT5_BEHAVIOR_CONTRACT as p, OPENAI_COMPATIBLE_REPLAY_HOOKS as r, isClaudeAdaptiveThinkingDefaultModelId as s, ANTHROPIC_BY_MODEL_REPLAY_HOOKS as t, resolveClaudeThinkingProfile as u, resolveGpt5PromptOverlayMode as v, buildOpenAICompatibleReplayPolicy as w, buildGoogleGeminiReplayPolicy as x, resolveGpt5SystemPromptContribution as y };
