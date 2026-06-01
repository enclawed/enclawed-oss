import { o as normalizeOptionalLowercaseString, s as normalizeOptionalString } from "./string-coerce-BUSzWgUA.js";
import { n as resolvePluginCapabilityProviders } from "./capability-provider-runtime-p47O9Kn-.js";
import { n as normalizeCapabilityProviderId, t as buildCapabilityProviderMaps } from "./provider-registry-shared-CMQGTcI6.js";
import { t as resolveConfiguredCapabilityProvider } from "./provider-selection-runtime-B0ys7F6d.js";
import { randomUUID } from "node:crypto";
//#region src/realtime-voice/provider-types.ts
const REALTIME_VOICE_AUDIO_FORMAT_G711_ULAW_8KHZ = {
	encoding: "g711_ulaw",
	sampleRateHz: 8e3,
	channels: 1
};
const REALTIME_VOICE_AUDIO_FORMAT_PCM16_24KHZ = {
	encoding: "pcm16",
	sampleRateHz: 24e3,
	channels: 1
};
//#endregion
//#region src/realtime-voice/agent-consult-tool.ts
const REALTIME_VOICE_AGENT_CONSULT_TOOL_NAME = "enclawed_agent_consult";
const REALTIME_VOICE_AGENT_CONSULT_TOOL_POLICIES = [
	"safe-read-only",
	"owner",
	"none"
];
const REALTIME_VOICE_AGENT_CONSULT_TOOL = {
	type: "function",
	name: REALTIME_VOICE_AGENT_CONSULT_TOOL_NAME,
	description: "Ask the full Enclawed agent for deeper reasoning, current information, or tool-backed help before speaking.",
	parameters: {
		type: "object",
		properties: {
			question: {
				type: "string",
				description: "The concrete question or task the user asked."
			},
			context: {
				type: "string",
				description: "Optional relevant context or transcript summary."
			},
			responseStyle: {
				type: "string",
				description: "Optional style hint for the spoken answer."
			}
		},
		required: ["question"]
	}
};
function buildRealtimeVoiceAgentConsultWorkingResponse(audienceLabel = "person") {
	return {
		status: "working",
		tool: REALTIME_VOICE_AGENT_CONSULT_TOOL_NAME,
		message: `Tell the ${audienceLabel} briefly that you are checking, then wait for the final Enclawed result before answering with the actual result.`
	};
}
const SAFE_READ_ONLY_TOOLS = [
	"read",
	"web_search",
	"web_fetch",
	"x_search",
	"memory_search",
	"memory_get"
];
function isRealtimeVoiceAgentConsultToolPolicy(value) {
	return typeof value === "string" && REALTIME_VOICE_AGENT_CONSULT_TOOL_POLICIES.includes(value);
}
function resolveRealtimeVoiceAgentConsultToolPolicy(value, fallback) {
	const normalized = normalizeOptionalLowercaseString(value);
	return isRealtimeVoiceAgentConsultToolPolicy(normalized) ? normalized : fallback;
}
function resolveRealtimeVoiceAgentConsultTools(policy, customTools = []) {
	const tools = /* @__PURE__ */ new Map();
	if (policy !== "none") tools.set(REALTIME_VOICE_AGENT_CONSULT_TOOL.name, REALTIME_VOICE_AGENT_CONSULT_TOOL);
	for (const tool of customTools) if (!tools.has(tool.name)) tools.set(tool.name, tool);
	return [...tools.values()];
}
function resolveRealtimeVoiceAgentConsultToolsAllow(policy) {
	if (policy === "owner") return;
	if (policy === "safe-read-only") return [...SAFE_READ_ONLY_TOOLS];
	return [];
}
function parseRealtimeVoiceAgentConsultArgs(args) {
	const question = readConsultStringArg(args, "question");
	if (!question) throw new Error("question required");
	return {
		question,
		context: readConsultStringArg(args, "context"),
		responseStyle: readConsultStringArg(args, "responseStyle")
	};
}
function buildRealtimeVoiceAgentConsultChatMessage(args) {
	const parsed = parseRealtimeVoiceAgentConsultArgs(args);
	return [
		parsed.question,
		parsed.context ? `Context:\n${parsed.context}` : void 0,
		parsed.responseStyle ? `Spoken style:\n${parsed.responseStyle}` : void 0
	].filter(Boolean).join("\n\n");
}
function buildRealtimeVoiceAgentConsultPrompt(params) {
	const parsed = parseRealtimeVoiceAgentConsultArgs(params.args);
	const assistantLabel = params.assistantLabel ?? "Agent";
	const questionSourceLabel = params.questionSourceLabel ?? params.userLabel.toLowerCase();
	const transcript = params.transcript.slice(-12).map((entry) => `${entry.role === "assistant" ? assistantLabel : params.userLabel}: ${entry.text}`).join("\n");
	return [
		`You are helping an Enclawed realtime voice agent during ${params.surface}.`,
		`Answer the ${questionSourceLabel}'s question with the strongest useful reasoning and available tools.`,
		"Return only the concise answer the realtime voice agent should speak next.",
		"Do not include markdown, citations unless needed, tool logs, or private reasoning.",
		parsed.responseStyle ? `Spoken style: ${parsed.responseStyle}` : void 0,
		transcript ? `Recent transcript:\n${transcript}` : void 0,
		parsed.context ? `Additional context:\n${parsed.context}` : void 0,
		`Question:\n${parsed.question}`
	].filter(Boolean).join("\n\n");
}
function collectRealtimeVoiceAgentConsultVisibleText(payloads) {
	const chunks = [];
	for (const payload of payloads) {
		if (payload.isError || payload.isReasoning) continue;
		const text = normalizeOptionalString(payload.text);
		if (text) chunks.push(text);
	}
	return chunks.length > 0 ? chunks.join("\n\n").trim() : null;
}
function readConsultStringArg(args, key) {
	if (!args || typeof args !== "object" || Array.isArray(args)) return;
	return normalizeOptionalString(args[key]);
}
//#endregion
//#region src/realtime-voice/agent-consult-runtime.ts
function resolveRealtimeVoiceAgentSandboxSessionKey(agentId, sessionKey) {
	const trimmed = sessionKey.trim();
	if (trimmed.toLowerCase().startsWith("agent:")) return trimmed;
	return `agent:${agentId}:${trimmed}`;
}
async function consultRealtimeVoiceAgent(params) {
	const agentId = params.agentId ?? "main";
	const agentDir = params.agentRuntime.resolveAgentDir(params.cfg, agentId);
	const workspaceDir = params.agentRuntime.resolveAgentWorkspaceDir(params.cfg, agentId);
	await params.agentRuntime.ensureAgentWorkspace({ dir: workspaceDir });
	const storePath = params.agentRuntime.session.resolveStorePath(params.cfg.session?.store, { agentId });
	const sessionStore = params.agentRuntime.session.loadSessionStore(storePath);
	const now = Date.now();
	const existing = sessionStore[params.sessionKey];
	const sessionId = existing?.sessionId?.trim() || randomUUID();
	sessionStore[params.sessionKey] = {
		...existing,
		sessionId,
		updatedAt: now
	};
	await params.agentRuntime.session.saveSessionStore(storePath, sessionStore);
	const sessionFile = params.agentRuntime.session.resolveSessionFilePath(sessionId, sessionStore[params.sessionKey], { agentId });
	const result = await params.agentRuntime.runEmbeddedPiAgent({
		sessionId,
		sessionKey: params.sessionKey,
		sandboxSessionKey: resolveRealtimeVoiceAgentSandboxSessionKey(agentId, params.sessionKey),
		agentId,
		messageProvider: params.messageProvider,
		sessionFile,
		workspaceDir,
		config: params.cfg,
		prompt: buildRealtimeVoiceAgentConsultPrompt({
			args: params.args,
			transcript: params.transcript,
			surface: params.surface,
			userLabel: params.userLabel,
			assistantLabel: params.assistantLabel,
			questionSourceLabel: params.questionSourceLabel
		}),
		provider: params.provider,
		model: params.model,
		thinkLevel: params.thinkLevel ?? "high",
		verboseLevel: "off",
		reasoningLevel: "off",
		toolResultFormat: "plain",
		toolsAllow: params.toolsAllow,
		timeoutMs: params.timeoutMs ?? params.agentRuntime.resolveAgentTimeoutMs({ cfg: params.cfg }),
		runId: `${params.runIdPrefix}:${Date.now()}`,
		lane: params.lane,
		extraSystemPrompt: params.extraSystemPrompt ?? "You are a behind-the-scenes consultant for a live voice agent. Be accurate, brief, and speakable.",
		agentDir
	});
	const text = collectRealtimeVoiceAgentConsultVisibleText(result.payloads ?? []);
	if (!text) {
		const reason = result.meta?.aborted ? "agent run aborted" : "agent returned no speakable text";
		params.logger.warn(`[realtime-voice] agent consult produced no answer: ${reason}`);
		return { text: params.fallbackText ?? "I need a moment to verify that before answering." };
	}
	return { text };
}
//#endregion
//#region src/realtime-voice/provider-registry.ts
function normalizeRealtimeVoiceProviderId(providerId) {
	return normalizeCapabilityProviderId(providerId);
}
function resolveRealtimeVoiceProviderEntries(cfg) {
	return resolvePluginCapabilityProviders({
		key: "realtimeVoiceProviders",
		cfg
	});
}
function buildProviderMaps(cfg) {
	return buildCapabilityProviderMaps(resolveRealtimeVoiceProviderEntries(cfg));
}
function listRealtimeVoiceProviders(cfg) {
	return [...buildProviderMaps(cfg).canonical.values()];
}
function getRealtimeVoiceProvider(providerId, cfg) {
	const normalized = normalizeRealtimeVoiceProviderId(providerId);
	if (!normalized) return;
	return buildProviderMaps(cfg).aliases.get(normalized);
}
function canonicalizeRealtimeVoiceProviderId(providerId, cfg) {
	const normalized = normalizeRealtimeVoiceProviderId(providerId);
	if (!normalized) return;
	return getRealtimeVoiceProvider(normalized, cfg)?.id ?? normalized;
}
//#endregion
//#region src/realtime-voice/provider-resolver.ts
function resolveConfiguredRealtimeVoiceProvider(params) {
	const cfgForResolve = params.cfgForResolve ?? params.cfg ?? {};
	const providers = params.providers ?? listRealtimeVoiceProviders(params.cfg);
	const resolution = resolveConfiguredCapabilityProvider({
		configuredProviderId: params.configuredProviderId,
		providerConfigs: params.providerConfigs,
		cfg: params.cfg,
		cfgForResolve,
		getConfiguredProvider: (providerId) => params.providers?.find((entry) => entry.id === providerId) ?? getRealtimeVoiceProvider(providerId, params.cfg),
		listProviders: () => providers,
		resolveProviderConfig: ({ provider, cfg, rawConfig }) => {
			const rawConfigWithModel = params.defaultModel && rawConfig.model === void 0 ? {
				...rawConfig,
				model: params.defaultModel
			} : rawConfig;
			return provider.resolveConfig?.({
				cfg,
				rawConfig: rawConfigWithModel
			}) ?? rawConfigWithModel;
		},
		isProviderConfigured: ({ provider, cfg, providerConfig }) => provider.isConfigured({
			cfg,
			providerConfig
		})
	});
	if (!resolution.ok && resolution.code === "missing-configured-provider") throw new Error(`Realtime voice provider "${resolution.configuredProviderId}" is not registered`);
	if (!resolution.ok && resolution.code === "no-registered-provider") throw new Error(params.noRegisteredProviderMessage ?? "No realtime voice provider registered");
	if (!resolution.ok) throw new Error(`Realtime voice provider "${resolution.provider?.id}" is not configured`);
	return {
		provider: resolution.provider,
		providerConfig: resolution.providerConfig
	};
}
//#endregion
//#region src/realtime-voice/session-runtime.ts
function createRealtimeVoiceBridgeSession(params) {
	let bridge;
	const requireBridge = () => {
		if (!bridge) throw new Error("Realtime voice bridge is not ready");
		return bridge;
	};
	const session = {
		get bridge() {
			return requireBridge();
		},
		acknowledgeMark: () => requireBridge().acknowledgeMark(),
		close: () => requireBridge().close(),
		connect: () => requireBridge().connect(),
		sendAudio: (audio) => requireBridge().sendAudio(audio),
		sendUserMessage: (text) => requireBridge().sendUserMessage?.(text),
		handleBargeIn: (options) => requireBridge().handleBargeIn?.(options),
		setMediaTimestamp: (ts) => requireBridge().setMediaTimestamp(ts),
		submitToolResult: (callId, result, options) => requireBridge().submitToolResult(callId, result, options),
		triggerGreeting: (instructions) => requireBridge().triggerGreeting?.(instructions)
	};
	const canSendAudio = () => params.audioSink.isOpen?.() ?? true;
	bridge = params.provider.createBridge({
		providerConfig: params.providerConfig,
		audioFormat: params.audioFormat,
		instructions: params.instructions,
		tools: params.tools,
		onAudio: (audio) => {
			if (canSendAudio()) params.audioSink.sendAudio(audio);
		},
		onClearAudio: () => {
			if (canSendAudio()) params.audioSink.clearAudio?.();
		},
		onMark: (markName) => {
			if (!canSendAudio() || params.markStrategy === "ignore") return;
			if (params.markStrategy === "ack-immediately") {
				bridge?.acknowledgeMark();
				return;
			}
			if (params.markStrategy === void 0 || params.markStrategy === "transport") params.audioSink.sendMark?.(markName);
		},
		onTranscript: params.onTranscript,
		onToolCall: (event) => {
			if (!bridge) return;
			params.onToolCall?.(event, session);
		},
		onReady: () => {
			if (!bridge) return;
			if (params.triggerGreetingOnReady) bridge.triggerGreeting?.(params.initialGreetingInstructions);
			params.onReady?.(session);
		},
		onError: params.onError,
		onClose: params.onClose
	});
	return session;
}
//#endregion
//#region src/realtime-voice/audio-codec.ts
const TELEPHONY_SAMPLE_RATE = 8e3;
const RESAMPLE_FILTER_TAPS = 31;
const RESAMPLE_CUTOFF_GUARD = .94;
function clamp16(value) {
	return Math.max(-32768, Math.min(32767, value));
}
function sinc(x) {
	if (x === 0) return 1;
	return Math.sin(Math.PI * x) / (Math.PI * x);
}
function sampleBandlimited(input, inputSamples, srcPos, cutoffCyclesPerSample) {
	const half = Math.floor(RESAMPLE_FILTER_TAPS / 2);
	const center = Math.floor(srcPos);
	let weighted = 0;
	let weightSum = 0;
	for (let tap = -half; tap <= half; tap += 1) {
		const sampleIndex = center + tap;
		if (sampleIndex < 0 || sampleIndex >= inputSamples) continue;
		const distance = sampleIndex - srcPos;
		const lowPass = 2 * cutoffCyclesPerSample * sinc(2 * cutoffCyclesPerSample * distance);
		const tapIndex = tap + half;
		const coeff = lowPass * (.5 - .5 * Math.cos(2 * Math.PI * tapIndex / (RESAMPLE_FILTER_TAPS - 1)));
		weighted += input.readInt16LE(sampleIndex * 2) * coeff;
		weightSum += coeff;
	}
	if (weightSum === 0) {
		const nearest = Math.max(0, Math.min(inputSamples - 1, Math.round(srcPos)));
		return input.readInt16LE(nearest * 2);
	}
	return weighted / weightSum;
}
function resamplePcm(input, inputSampleRate, outputSampleRate) {
	if (inputSampleRate === outputSampleRate) return input;
	const inputSamples = Math.floor(input.length / 2);
	if (inputSamples === 0) return Buffer.alloc(0);
	const ratio = inputSampleRate / outputSampleRate;
	const outputSamples = Math.floor(inputSamples / ratio);
	const output = Buffer.alloc(outputSamples * 2);
	const maxCutoff = .5;
	const downsampleCutoff = ratio > 1 ? maxCutoff / ratio : maxCutoff;
	const cutoffCyclesPerSample = Math.max(.01, downsampleCutoff * RESAMPLE_CUTOFF_GUARD);
	for (let i = 0; i < outputSamples; i += 1) {
		const sample = Math.round(sampleBandlimited(input, inputSamples, i * ratio, cutoffCyclesPerSample));
		output.writeInt16LE(clamp16(sample), i * 2);
	}
	return output;
}
function resamplePcmTo8k(input, inputSampleRate) {
	return resamplePcm(input, inputSampleRate, TELEPHONY_SAMPLE_RATE);
}
function pcmToMulaw(pcm) {
	const samples = Math.floor(pcm.length / 2);
	const mulaw = Buffer.alloc(samples);
	for (let i = 0; i < samples; i += 1) mulaw[i] = linearToMulaw(pcm.readInt16LE(i * 2));
	return mulaw;
}
function mulawToPcm(mulaw) {
	const pcm = Buffer.alloc(mulaw.length * 2);
	for (let i = 0; i < mulaw.length; i += 1) pcm.writeInt16LE(clamp16(mulawToLinear(mulaw[i] ?? 0)), i * 2);
	return pcm;
}
function convertPcmToMulaw8k(pcm, inputSampleRate) {
	return pcmToMulaw(resamplePcmTo8k(pcm, inputSampleRate));
}
function linearToMulaw(sample) {
	const BIAS = 132;
	const CLIP = 32635;
	const sign = sample < 0 ? 128 : 0;
	if (sample < 0) sample = -sample;
	if (sample > CLIP) sample = CLIP;
	sample += BIAS;
	let exponent = 7;
	for (let expMask = 16384; (sample & expMask) === 0 && exponent > 0; exponent -= 1) expMask >>= 1;
	const mantissa = sample >> exponent + 3 & 15;
	return ~(sign | exponent << 4 | mantissa) & 255;
}
function mulawToLinear(value) {
	const muLaw = ~value & 255;
	const sign = muLaw & 128;
	const exponent = muLaw >> 4 & 7;
	let sample = ((muLaw & 15) << 3) + 132 << exponent;
	sample -= 132;
	return sign ? -sample : sample;
}
//#endregion
export { resolveRealtimeVoiceAgentConsultTools as C, REALTIME_VOICE_AUDIO_FORMAT_PCM16_24KHZ as E, resolveRealtimeVoiceAgentConsultToolPolicy as S, REALTIME_VOICE_AUDIO_FORMAT_G711_ULAW_8KHZ as T, buildRealtimeVoiceAgentConsultPrompt as _, resamplePcmTo8k as a, isRealtimeVoiceAgentConsultToolPolicy as b, canonicalizeRealtimeVoiceProviderId as c, normalizeRealtimeVoiceProviderId as d, consultRealtimeVoiceAgent as f, buildRealtimeVoiceAgentConsultChatMessage as g, REALTIME_VOICE_AGENT_CONSULT_TOOL_POLICIES as h, resamplePcm as i, getRealtimeVoiceProvider as l, REALTIME_VOICE_AGENT_CONSULT_TOOL_NAME as m, mulawToPcm as n, createRealtimeVoiceBridgeSession as o, REALTIME_VOICE_AGENT_CONSULT_TOOL as p, pcmToMulaw as r, resolveConfiguredRealtimeVoiceProvider as s, convertPcmToMulaw8k as t, listRealtimeVoiceProviders as u, buildRealtimeVoiceAgentConsultWorkingResponse as v, resolveRealtimeVoiceAgentConsultToolsAllow as w, parseRealtimeVoiceAgentConsultArgs as x, collectRealtimeVoiceAgentConsultVisibleText as y };
