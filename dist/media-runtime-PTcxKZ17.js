import { n as resolvePreferredEnclawedTmpDir } from "./tmp-enclawed-dir-BTrLrKyp.js";
import { a as shouldLogVerbose, r as logVerbose } from "./globals-CYDryU7g.js";
import "./mime-CwPaZfyo.js";
import "./image-ops-C48nAQih.js";
import { x as sendTextMediaPayload } from "./reply-payload-Dibp0yeY.js";
import "./local-roots-BLbskw3Q.js";
import "./store-C_p-c6nl.js";
import "./fetch-OzBqub2H.js";
import "./local-media-access-DgwZrHM7.js";
import "./resolve-C7HA0dVK.js";
import "./image-runtime-Vegx5Msw.js";
import { a as runCapability, i as resolveMediaAttachmentLocalRoots, l as isAudioAttachment, o as createMediaAttachmentCache, s as normalizeMediaAttachments, t as buildProviderRegistry } from "./runner-Cbs4XT_a.js";
import { d as runFfprobe, u as runFfmpeg } from "./runner.entries-DcPKMsQa.js";
import { a as chunkText } from "./chunk-CuX0qnHJ.js";
import "./audio-Dx4YYjpz.js";
import "./agent-media-payload-CuYEjkhL.js";
import { t as sanitizeForPlainText } from "./sanitize-text-OvRNGDUY.js";
import "./outbound-runtime-DxP_PG_O.js";
import "./outbound-attachment-DlZJs-lu.js";
import { n as encodePngRgba, r as fillPixel } from "./png-encode-BHp_Q3mb.js";
import { t as resolveChannelMediaMaxBytes } from "./media-limits-DiD06t5N.js";
import path from "node:path";
import fs, { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
//#region src/media/qr-image.ts
let qrCodeRuntimePromise$1 = null;
async function loadQrCodeRuntime$1() {
	if (!qrCodeRuntimePromise$1) qrCodeRuntimePromise$1 = Promise.all([import("qrcode-terminal/vendor/QRCode/index.js"), import("qrcode-terminal/vendor/QRCode/QRErrorCorrectLevel.js")]).then(([qrCodeModule, errorCorrectLevelModule]) => ({
		QRCode: qrCodeModule.default,
		QRErrorCorrectLevel: errorCorrectLevelModule.default
	}));
	return await qrCodeRuntimePromise$1;
}
async function createQrMatrix(input) {
	const { QRCode, QRErrorCorrectLevel } = await loadQrCodeRuntime$1();
	const qr = new QRCode(-1, QRErrorCorrectLevel.L);
	qr.addData(input);
	qr.make();
	return qr;
}
async function renderQrPngDataUrl(input, opts = {}) {
	return `data:image/png;base64,${await renderQrPngBase64(input, opts)}`;
}
async function renderQrPngBase64(input, opts = {}) {
	const { scale = 6, marginModules = 4 } = opts;
	const qr = await createQrMatrix(input);
	const modules = qr.getModuleCount();
	const size = (modules + marginModules * 2) * scale;
	const buf = Buffer.alloc(size * size * 4, 255);
	for (let row = 0; row < modules; row += 1) for (let col = 0; col < modules; col += 1) {
		if (!qr.isDark(row, col)) continue;
		const startX = (col + marginModules) * scale;
		const startY = (row + marginModules) * scale;
		for (let y = 0; y < scale; y += 1) {
			const pixelY = startY + y;
			for (let x = 0; x < scale; x += 1) fillPixel(buf, startX + x, pixelY, size, 0, 0, 0, 255);
		}
	}
	return encodePngRgba(buf, size, size).toString("base64");
}
//#endregion
//#region src/media/temp-files.ts
async function unlinkIfExists(filePath) {
	if (!filePath) return;
	try {
		await fs.unlink(filePath);
	} catch {}
}
//#endregion
//#region src/media-understanding/audio-transcription-runner.ts
async function runAudioTranscription(params) {
	const attachments = params.attachments ?? normalizeMediaAttachments(params.ctx);
	if (attachments.length === 0) return {
		transcript: void 0,
		attachments
	};
	const providerRegistry = buildProviderRegistry(params.providers, params.cfg);
	const cache = createMediaAttachmentCache(attachments, params.localPathRoots ? { localPathRoots: params.localPathRoots } : void 0);
	try {
		return {
			transcript: (await runCapability({
				capability: "audio",
				cfg: params.cfg,
				ctx: params.ctx,
				attachments: cache,
				media: attachments,
				agentDir: params.agentDir,
				providerRegistry,
				config: params.cfg.tools?.media?.audio,
				activeModel: params.activeModel
			})).outputs.find((entry) => entry.kind === "audio.transcription")?.text?.trim() || void 0,
			attachments
		};
	} finally {
		await cache.cleanup();
	}
}
//#endregion
//#region src/media-understanding/audio-preflight.ts
/**
* Transcribes the first audio attachment BEFORE mention checking.
* This allows voice notes to be processed in group chats with requireMention: true.
* Returns the transcript or undefined if transcription fails or no audio is found.
*/
async function transcribeFirstAudio(params) {
	const { ctx, cfg } = params;
	if ((cfg.tools?.media?.audio)?.enabled === false) return;
	const attachments = normalizeMediaAttachments(ctx);
	if (!attachments || attachments.length === 0) return;
	const firstAudio = attachments.find((att) => att && isAudioAttachment(att) && !att.alreadyTranscribed);
	if (!firstAudio) return;
	if (shouldLogVerbose()) logVerbose(`audio-preflight: transcribing attachment ${firstAudio.index} for mention check`);
	try {
		const { transcript } = await runAudioTranscription({
			ctx,
			cfg,
			attachments,
			agentDir: params.agentDir,
			providers: params.providers,
			activeModel: params.activeModel,
			localPathRoots: resolveMediaAttachmentLocalRoots({
				cfg,
				ctx
			})
		});
		if (!transcript) return;
		firstAudio.alreadyTranscribed = true;
		if (shouldLogVerbose()) logVerbose(`audio-preflight: transcribed ${transcript.length} chars from attachment ${firstAudio.index}`);
		return transcript;
	} catch (err) {
		if (shouldLogVerbose()) logVerbose(`audio-preflight: transcription failed: ${String(err)}`);
		return;
	}
}
//#endregion
//#region src/channels/plugins/outbound/direct-text-media.ts
function resolveScopedChannelMediaMaxBytes(params) {
	return resolveChannelMediaMaxBytes({
		cfg: params.cfg,
		resolveChannelLimitMb: params.resolveChannelLimitMb,
		accountId: params.accountId
	});
}
function createScopedChannelMediaMaxBytesResolver(channel) {
	return (params) => resolveScopedChannelMediaMaxBytes({
		cfg: params.cfg,
		accountId: params.accountId,
		resolveChannelLimitMb: ({ cfg, accountId }) => (cfg.channels?.[channel]?.accounts?.[accountId])?.mediaMaxMb ?? cfg.channels?.[channel]?.mediaMaxMb
	});
}
function createDirectTextMediaOutbound(params) {
	const sendDirect = async (sendParams) => {
		const send = params.resolveSender(sendParams.deps);
		const maxBytes = params.resolveMaxBytes({
			cfg: sendParams.cfg,
			accountId: sendParams.accountId
		});
		const result = await send(sendParams.to, sendParams.text, sendParams.buildOptions({
			cfg: sendParams.cfg,
			mediaUrl: sendParams.mediaUrl,
			mediaAccess: sendParams.mediaAccess,
			mediaLocalRoots: sendParams.mediaAccess?.localRoots,
			mediaReadFile: sendParams.mediaAccess?.readFile,
			accountId: sendParams.accountId,
			replyToId: sendParams.replyToId,
			maxBytes
		}));
		return {
			channel: params.channel,
			...result
		};
	};
	const outbound = {
		deliveryMode: "direct",
		chunker: chunkText,
		chunkerMode: "text",
		textChunkLimit: 4e3,
		sanitizeText: ({ text }) => sanitizeForPlainText(text),
		sendPayload: async (ctx) => await sendTextMediaPayload({
			channel: params.channel,
			ctx,
			adapter: outbound
		}),
		sendText: async ({ cfg, to, text, accountId, deps, replyToId }) => {
			return await sendDirect({
				cfg,
				to,
				text,
				accountId,
				deps,
				replyToId,
				buildOptions: params.buildTextOptions
			});
		},
		sendMedia: async ({ cfg, to, text, mediaUrl, mediaAccess, mediaLocalRoots, mediaReadFile, accountId, deps, replyToId }) => {
			return await sendDirect({
				cfg,
				to,
				text,
				mediaUrl,
				mediaAccess: mediaAccess ?? (mediaLocalRoots || mediaReadFile ? {
					...mediaLocalRoots?.length ? { localRoots: mediaLocalRoots } : {},
					...mediaReadFile ? { readFile: mediaReadFile } : {}
				} : void 0),
				accountId,
				deps,
				replyToId,
				buildOptions: params.buildMediaOptions
			});
		}
	};
	return outbound;
}
//#endregion
//#region src/media/video-dimensions.ts
function parsePositiveDimension(value) {
	if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) return;
	return value;
}
function parseFfprobeVideoDimensions(stdout) {
	const stream = JSON.parse(stdout).streams?.[0];
	const width = parsePositiveDimension(stream?.width);
	const height = parsePositiveDimension(stream?.height);
	return width && height ? {
		width,
		height
	} : void 0;
}
async function probeVideoDimensions(buffer) {
	try {
		return parseFfprobeVideoDimensions(await runFfprobe([
			"-v",
			"error",
			"-select_streams",
			"v:0",
			"-show_entries",
			"stream=width,height",
			"-of",
			"json",
			"pipe:0"
		], { input: buffer }));
	} catch {
		return;
	}
}
//#endregion
//#region src/media/qr-runtime.ts
let qrCodeRuntimePromise = null;
async function loadQrCodeRuntime() {
	if (!qrCodeRuntimePromise) qrCodeRuntimePromise = import("qrcode").then((mod) => mod.default ?? mod);
	return await qrCodeRuntimePromise;
}
function normalizeQrText(text) {
	if (typeof text !== "string") throw new TypeError("QR text must be a string.");
	if (text.length === 0) throw new Error("QR text must not be empty.");
	return text;
}
//#endregion
//#region src/media/qr-terminal.ts
async function renderQrTerminal(input, opts = {}) {
	return await (await loadQrCodeRuntime()).toString(normalizeQrText(input), {
		small: opts.small ?? true,
		type: "terminal"
	});
}
//#endregion
//#region src/media/audio-transcode.ts
const DEFAULT_OPUS_SAMPLE_RATE_HZ = 48e3;
const DEFAULT_OPUS_BITRATE = "64k";
const DEFAULT_OPUS_CHANNELS = 1;
const DEFAULT_TEMP_PREFIX = "audio-opus-";
const DEFAULT_OUTPUT_FILE_NAME = "voice.opus";
function normalizeAudioExtension(params) {
	const fromExtension = params.inputExtension?.trim();
	const normalized = (fromExtension ? fromExtension.startsWith(".") ? fromExtension : `.${fromExtension}` : path.extname(params.inputFileName ?? "")).toLowerCase();
	return /^\.[a-z0-9]{1,12}$/.test(normalized) ? normalized : ".audio";
}
function normalizeTempPrefix(value) {
	const sanitized = value?.trim().replace(/[^a-zA-Z0-9._-]/g, "-");
	if (!sanitized || sanitized === "." || sanitized === "..") return DEFAULT_TEMP_PREFIX;
	return sanitized.endsWith("-") ? sanitized : `${sanitized}-`;
}
function normalizeOutputFileName(value) {
	const baseName = path.basename(value?.trim() || DEFAULT_OUTPUT_FILE_NAME);
	if (/^[a-zA-Z0-9._-]{1,80}$/.test(baseName) && baseName !== "." && baseName !== "..") return baseName;
	return DEFAULT_OUTPUT_FILE_NAME;
}
async function transcodeAudioBufferToOpus(params) {
	const tempRoot = resolvePreferredEnclawedTmpDir();
	await mkdir(tempRoot, {
		recursive: true,
		mode: 448
	});
	const tempDir = await mkdtemp(path.join(tempRoot, normalizeTempPrefix(params.tempPrefix)));
	try {
		const inputPath = path.join(tempDir, `input${normalizeAudioExtension(params)}`);
		const outputPath = path.join(tempDir, normalizeOutputFileName(params.outputFileName));
		await writeFile(inputPath, params.audioBuffer, { mode: 384 });
		await runFfmpeg([
			"-hide_banner",
			"-loglevel",
			"error",
			"-y",
			"-i",
			inputPath,
			"-vn",
			"-sn",
			"-dn",
			"-c:a",
			"libopus",
			"-b:a",
			params.bitrate ?? DEFAULT_OPUS_BITRATE,
			"-ar",
			String(params.sampleRateHz ?? DEFAULT_OPUS_SAMPLE_RATE_HZ),
			"-ac",
			String(params.channels ?? DEFAULT_OPUS_CHANNELS),
			outputPath
		], { timeoutMs: params.timeoutMs });
		return await readFile(outputPath);
	} finally {
		await rm(tempDir, {
			recursive: true,
			force: true
		});
	}
}
//#endregion
export { createScopedChannelMediaMaxBytesResolver as a, unlinkIfExists as c, createDirectTextMediaOutbound as i, renderQrPngBase64 as l, renderQrTerminal as n, resolveScopedChannelMediaMaxBytes as o, probeVideoDimensions as r, transcribeFirstAudio as s, transcodeAudioBufferToOpus as t, renderQrPngDataUrl as u };
