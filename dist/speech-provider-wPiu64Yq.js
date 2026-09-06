import { s as normalizeOptionalString } from "./string-coerce-BUSzWgUA.js";
import { c as normalizeResolvedSecretInputString } from "./types.secrets-B-g1z55T.js";
import { p as asObject } from "./shared-6piY2B-y.js";
import "./secret-input-CLk7ofM4.js";
import "./speech-B1Z4d6z2.js";
import { n as GRADIUM_VOICES, r as normalizeGradiumBaseUrl } from "./shared--wJ4H1_7.js";
import { t as gradiumTTS } from "./tts-BZi_M230.js";
//#region extensions/gradium/speech-provider.ts
function normalizeGradiumProviderConfig(rawConfig) {
	const raw = asObject(asObject(rawConfig.providers)?.gradium) ?? asObject(rawConfig.gradium);
	return {
		apiKey: normalizeResolvedSecretInputString({
			value: raw?.apiKey,
			path: "messages.tts.providers.gradium.apiKey"
		}),
		baseUrl: normalizeGradiumBaseUrl(normalizeOptionalString(raw?.baseUrl)),
		voiceId: normalizeOptionalString(raw?.voiceId) ?? "YTpq7expH9539ERJ"
	};
}
function readGradiumProviderConfig(config) {
	const defaults = normalizeGradiumProviderConfig({});
	return {
		apiKey: normalizeOptionalString(config.apiKey) ?? defaults.apiKey,
		baseUrl: normalizeGradiumBaseUrl(normalizeOptionalString(config.baseUrl) ?? defaults.baseUrl),
		voiceId: normalizeOptionalString(config.voiceId) ?? defaults.voiceId
	};
}
function parseDirectiveToken(ctx) {
	switch (ctx.key) {
		case "voice":
		case "voice_id":
		case "voiceid":
		case "gradium_voice":
		case "gradiumvoice":
			if (!ctx.policy.allowVoice) return { handled: true };
			return {
				handled: true,
				overrides: {
					...ctx.currentOverrides,
					voiceId: ctx.value
				}
			};
		default: return { handled: false };
	}
}
function buildGradiumSpeechProvider() {
	return {
		id: "gradium",
		label: "Gradium",
		autoSelectOrder: 30,
		voices: GRADIUM_VOICES.map((v) => v.id),
		resolveConfig: ({ rawConfig }) => normalizeGradiumProviderConfig(rawConfig),
		parseDirectiveToken,
		listVoices: async () => GRADIUM_VOICES.map((v) => ({
			id: v.id,
			name: v.name
		})),
		isConfigured: ({ providerConfig }) => Boolean(readGradiumProviderConfig(providerConfig).apiKey || process.env.GRADIUM_API_KEY),
		synthesize: async (req) => {
			const config = readGradiumProviderConfig(req.providerConfig);
			const overrides = req.providerOverrides ?? {};
			const apiKey = config.apiKey || process.env.GRADIUM_API_KEY;
			if (!apiKey) throw new Error("Gradium API key missing");
			const wantsVoiceNote = req.target === "voice-note";
			const outputFormat = wantsVoiceNote ? "opus" : "wav";
			return {
				audioBuffer: await gradiumTTS({
					text: req.text,
					apiKey,
					baseUrl: config.baseUrl,
					voiceId: normalizeOptionalString(overrides.voiceId) ?? config.voiceId,
					outputFormat,
					timeoutMs: req.timeoutMs
				}),
				outputFormat,
				fileExtension: wantsVoiceNote ? ".opus" : ".wav",
				voiceCompatible: wantsVoiceNote
			};
		},
		synthesizeTelephony: async (req) => {
			const config = readGradiumProviderConfig(req.providerConfig);
			const apiKey = config.apiKey || process.env.GRADIUM_API_KEY;
			if (!apiKey) throw new Error("Gradium API key missing");
			const outputFormat = "ulaw_8000";
			return {
				audioBuffer: await gradiumTTS({
					text: req.text,
					apiKey,
					baseUrl: config.baseUrl,
					voiceId: config.voiceId,
					outputFormat,
					timeoutMs: req.timeoutMs
				}),
				outputFormat,
				sampleRate: 8e3
			};
		}
	};
}
//#endregion
export { buildGradiumSpeechProvider as t };
