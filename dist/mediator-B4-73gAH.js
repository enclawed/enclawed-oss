import { F as mediateMediaBatch, P as createPluginConfigReader, Q as setOutboundEmitter, U as getMediaScramblers, Z as setLlmCompleter, at as mergeEgressConfig, b as currentToolReplayCall, dt as getEgressStages, et as runEgressPipeline, it as defaultEgressConfig, l as getActionBatcher, lt as createLedgerStore, nt as STAGE_IDS, ot as resolveStageMode, p as unmappedToolReason, st as createAuditBuffer, tt as DEFAULT_STAGE_MODES, ut as monotonicNow } from "./src-Bv_GP2Sj.js";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { createHash, randomBytes } from "node:crypto";
//#region extensions/egress-mediator/src/action-batching.ts
/**
* Declared mappings built into the monitor: tools whose observation is a
* function of their parameters alone. `web_fetch` is a plain GET of its URL
* (the batcher keys it on the request line actually sent: no fragment, no
* bare "?"); its other parameters (`extractMode`, `maxChars`) only shape the
* text returned to the model, so they are dropped.
*/
const BUILTIN_OBSERVATIONS = new Map([["web_fetch", (params) => typeof params.url === "string" ? {
	type: "http",
	method: "GET",
	url: params.url
} : null]]);
/** A declaration that the call sends nothing at all: there is nothing to batch. */
const NO_REQUEST = "no-request";
/** Accept a host-declared observation only in a shape the batcher keys exactly. */
function validObservation(value) {
	if (!value || typeof value !== "object") return null;
	const a = value;
	const str = (k) => typeof a[k] === "string";
	switch (a.type) {
		case "http": {
			const shape = (r) => typeof r.method === "string" && typeof r.url === "string" && (r.body === void 0 || typeof r.body === "string");
			const also = a.also;
			return shape(a) && (a.read === void 0 || typeof a.read === "boolean") && (a.client === void 0 || str("client")) && (also === void 0 || Array.isArray(also) && also.every((r) => !!r && typeof r === "object" && shape(r))) ? value : null;
		}
		case "file-write": return str("path") && str("content") && (a.identity === void 0 || str("identity")) ? value : null;
		case "send": return str("target") && str("content") ? value : null;
		case "none": return NO_REQUEST;
	}
	return null;
}
/**
* The observation a tool call produces (pi in the paper): the action that
* leaves the host. The batcher keys, sorts and collapses on it, so it must
* keep exactly what reaches the observer and drop what never leaves; keying
* on a parameter that stays on the host would let a sender vary it to choose
* the sort order and to split identical requests. A call gets one only
* through a declared mapping:
*   - the monitor's own table (`web_fetch`);
*   - otherwise the host's declaration on the call's replay context
*     (`call.observe`; the open core declares `write` as the file it writes,
*     resolved as the tool resolves the path).
* Anything else returns null: the call has no observation and is not batched.
*/
async function toolCallObservation(toolName, params, call) {
	const name = toolName.trim().toLowerCase();
	const builtin = BUILTIN_OBSERVATIONS.get(name);
	if (builtin) return builtin(params);
	if (!call?.observe) return null;
	try {
		return validObservation(await call.observe(params));
	} catch {
		return null;
	}
}
/** Text of an agent tool result (its text blocks), or a bounded JSON rendering. */
function toolResultText(result) {
	if (result === void 0 || result === null) return;
	if (typeof result === "string") return result;
	const content = result.content;
	if (Array.isArray(content)) {
		const texts = content.filter((b) => !!b && typeof b === "object" && b.type === "text" && typeof b.text === "string").map((b) => b.text);
		if (texts.length > 0) return texts.join("\n");
	}
	try {
		return JSON.stringify(result);
	} catch {
		return;
	}
}
const TOKEN = /[A-Za-z0-9][A-Za-z0-9._~:/?#@!$&'()*+,;=%-]{11,}/g;
const MAX_TOKENS_PER_SCOPE = 256;
const MAX_SCOPES = 64;
function stringLeaves(value, out, depth = 0) {
	if (typeof value === "string") out.push(value);
	else if (value && typeof value === "object" && depth < 16) for (const v of Array.isArray(value) ? value : Object.values(value)) stringLeaves(v, out, depth + 1);
	return out;
}
/**
* Deterministic data-flow provenance. Distinctive tokens (12+ characters:
* URLs, ids, paths) of each completed action's result are remembered per
* scope; a later action whose parameters contain one of them was built from
* that action's result. This is recorded for audit only: a data-flow
* dependent is concurrent with the rest of its window (see the batcher), so
* it does not make a barrier.
*/
function createDependencyTracker() {
	const scopes = /* @__PURE__ */ new Map();
	return {
		record(scope, actionId, resultText) {
			if (!resultText) return;
			let tokens = scopes.get(scope);
			if (!tokens) {
				if (scopes.size >= MAX_SCOPES) {
					const oldest = scopes.keys().next().value;
					if (oldest !== void 0) scopes.delete(oldest);
				}
				tokens = /* @__PURE__ */ new Map();
				scopes.set(scope, tokens);
			}
			for (const token of resultText.slice(0, 65536).match(TOKEN) ?? []) {
				tokens.delete(token);
				tokens.set(token, actionId);
				if (tokens.size > MAX_TOKENS_PER_SCOPE) {
					const oldest = tokens.keys().next().value;
					if (oldest !== void 0) tokens.delete(oldest);
				}
			}
		},
		dependsOn(scope, params) {
			const tokens = scopes.get(scope);
			if (!tokens || tokens.size === 0) return [];
			const leaves = stringLeaves(params, []);
			const deps = /* @__PURE__ */ new Set();
			for (const [token, id] of tokens) if (leaves.some((leaf) => leaf.includes(token))) deps.add(id);
			return [...deps].toSorted();
		}
	};
}
const MAX_REPEAT_TEXT = 2e5;
/** Refusal text for a repeat the batcher answered without re-sending. */
function repeatBlockReason(toolName, how, resultText, failed = false) {
	const head = how === "collapsed" ? `egress-action-batcher: an identical ${toolName} call in the same window was sent once; this repeat was not re-sent` : `egress-action-batcher: an identical ${toolName} call was answered from its recorded outcome and not re-sent`;
	if (resultText === void 0) return `${head}. Reuse the earlier call's result.`;
	const body = resultText.length > MAX_REPEAT_TEXT ? `${resultText.slice(0, MAX_REPEAT_TEXT)}\n[truncated]` : resultText;
	return failed ? `${head}. It failed:\n${body}` : `${head}. Its result:\n${body}`;
}
//#endregion
//#region extensions/egress-mediator/src/config.ts
/** Tools whose arguments leave the host whenever the tool runs. */
const DEFAULT_EGRESS_TOOLS = [
	"message",
	"sessions_send",
	"web_fetch",
	"web_search",
	"x_search",
	"browser",
	"tlon"
];
/**
* Shell tools. Their `command` argument is mediated only when it invokes a
* network client (see `isNetworkCommand`); a local command is left alone so
* the pipeline cannot rewrite ordinary shell use.
*/
const DEFAULT_COMMAND_TOOLS = ["exec", "bash"];
const HARDENED_FLAVOR_ALIASES = new Set([
	"enclaved",
	"secure",
	"classified",
	"high-side"
]);
const RUNTIME_KEY = Symbol.for("enclawed.runtime");
function runtimeFlavor() {
	const rt = globalThis[RUNTIME_KEY];
	return typeof rt?.flavor === "string" ? rt.flavor : null;
}
/**
* Whether the process runs the hardened posture.
*
* 1. The bootstrapped runtime's flavor, when present, decides: it already
*    honors the admin policy (for example "flavor": "enclaved" in
*    /etc/enclawed/policy.json), which ENCLAWED_FLAVOR alone does not show.
* 2. Before bootstrap (tests, embedding apps), ENCLAWED_FLAVOR. This package
*    ships no flavor pin, so its default is the open flavor, like the host's.
*/
function isHardenedFlavor(env = process.env) {
	const fromRuntime = runtimeFlavor();
	if (fromRuntime !== null) return fromRuntime !== "open";
	const raw = env.ENCLAWED_FLAVOR;
	return typeof raw === "string" && HARDENED_FLAVOR_ALIASES.has(raw.trim().toLowerCase());
}
/** Top-level keys the manifest schema declares. */
const TOP_LEVEL_KEYS = [
	"enabled",
	"posture",
	"stages",
	"ledger",
	"toolCall",
	"modelInput",
	"llm",
	"coverTraffic",
	"media"
];
const MODES = [
	"enforce",
	"audit",
	"off"
];
const MAX_TIMEOUT_MS = 6e5;
function resolveStages(r) {
	const stages = {};
	if (r.oneOf("posture", ["default", "enforce"], "default") === "enforce") for (const id of Object.keys(DEFAULT_STAGE_MODES)) stages[id] = { mode: "enforce" };
	for (const [id, entry] of r.entries("stages", ["mode"])) {
		if (!Object.hasOwn(DEFAULT_STAGE_MODES, id)) r.fail(`stages.${id} is not a known stage (known: ${Object.keys(DEFAULT_STAGE_MODES).join(", ")})`);
		if (!entry.has("mode")) r.fail(`stages.${id}.mode is required`);
		stages[id] = { mode: entry.oneOf("mode", MODES, "audit") };
	}
	return stages;
}
/**
* Stage modes in an enforcing (hardened) profile (settings audit X2 and the
* audit-mode follow-up): audit mode passes the payload through unchanged, so
* there every stage enforces. `posture: "enforce"` and a per-stage `enforce`
* are accepted (they say what the profile already does); `posture: "default"`
* and a stage mode of `audit` or `off` would loosen it and are refused.
*/
function resolveHardenedStages(r, hardened) {
	if (!hardened) return resolveStages(r);
	if (r.has("posture") && r.oneOf("posture", ["default", "enforce"], "enforce") !== "enforce") r.fail("posture cannot be \"default\" in an enforcing profile (every stage enforces)");
	const configured = resolveStages(r);
	const stages = {};
	for (const id of Object.keys(DEFAULT_STAGE_MODES)) stages[id] = { mode: "enforce" };
	for (const [id, entry] of Object.entries(configured)) if (entry.mode !== "enforce") r.fail(`stages.${id}.mode cannot be "${entry.mode}" in an enforcing profile`);
	return stages;
}
/**
* The mode a stage runs in. In an enforcing profile every stage enforces,
* including a stage id this build does not list (a third-party stage would
* otherwise fall back to audit and pass its payloads through).
*/
function effectiveStageMode(config, stageId) {
	return config.hardened ? "enforce" : resolveStageMode(config.egress, stageId);
}
/**
* In an enforcing profile a surface switch may only stay on: `false` would
* leave that surface unmediated, so it is refused rather than honored.
*/
function hardenedBool(r, key, fallback, hardened, label) {
	const value = r.bool(key, fallback);
	if (hardened && !value) r.fail(`${label} cannot be false in an enforcing profile`);
	return value;
}
/**
* Resolve the mediator's plugin config. Fail-closed like the stage plugins:
* an unknown key, a wrong type or an out-of-range value throws, so the
* plugin loader refuses the plugin instead of running a monitor weaker than
* the operator configured. An omitted key keeps its default.
*/
function resolveEgressMediatorConfig(pluginConfig, env = process.env) {
	const r = createPluginConfigReader("egress-mediator", pluginConfig, TOP_LEVEL_KEYS);
	const hardened = isHardenedFlavor(env);
	const ledgerReader = r.section("ledger", ["capacityBits", "refillBitsPerSec"]);
	const ledger = {};
	const capacityBits = ledgerReader.optionalNumber("capacityBits", {
		above: 0,
		max: defaultEgressConfig.ledger.capacityBits
	});
	const refillBitsPerSec = ledgerReader.optionalNumber("refillBitsPerSec", {
		min: 0,
		max: defaultEgressConfig.ledger.refillBitsPerSec
	});
	if (capacityBits !== void 0) ledger.capacityBits = capacityBits;
	if (refillBitsPerSec !== void 0) ledger.refillBitsPerSec = refillBitsPerSec;
	const toolCall = r.section("toolCall", [
		"enabled",
		"tools",
		"commandTools"
	]);
	const modelInput = r.section("modelInput", [
		"enabled",
		"toolResults",
		"inbound"
	]);
	const llm = r.section("llm", [
		"enabled",
		"provider",
		"model",
		"timeoutMs"
	]);
	const coverTraffic = r.section("coverTraffic", ["enabled"]);
	const media = r.section("media", ["enabled"]);
	return {
		egress: mergeEgressConfig({
			enabled: hardenedBool(r, "enabled", true, hardened, "enabled"),
			ledger,
			stages: resolveHardenedStages(r, hardened)
		}),
		hardened,
		toolCall: {
			enabled: hardenedBool(toolCall, "enabled", hardened, hardened, "toolCall.enabled"),
			tools: toolCall.stringList("tools", DEFAULT_EGRESS_TOOLS),
			commandTools: toolCall.stringList("commandTools", DEFAULT_COMMAND_TOOLS)
		},
		modelInput: {
			enabled: hardenedBool(modelInput, "enabled", hardened, hardened, "modelInput.enabled"),
			toolResults: hardenedBool(modelInput, "toolResults", true, hardened, "modelInput.toolResults"),
			inbound: hardenedBool(modelInput, "inbound", true, hardened, "modelInput.inbound")
		},
		llm: {
			enabled: llm.bool("enabled", true),
			provider: llm.optionalString("provider"),
			model: llm.optionalString("model"),
			timeoutMs: llm.number("timeoutMs", 3e4, {
				integer: true,
				above: 0,
				max: MAX_TIMEOUT_MS
			})
		},
		coverTraffic: { enabled: hardenedBool(coverTraffic, "enabled", true, hardened, "coverTraffic.enabled") },
		media: { enabled: hardenedBool(media, "enabled", true, hardened, "media.enabled") }
	};
}
//#endregion
//#region extensions/egress-mediator/src/host-wiring.ts
function collectText(result) {
	return ((typeof result === "object" && result !== null && "payloads" in result ? result.payloads : void 0) ?? []).filter((p) => !p.isError && typeof p.text === "string").map((p) => p.text ?? "").join("\n").trim();
}
/**
* Why a run result cannot be used as a rephrase, or null when it can. A turn
* that was aborted (the timeout aborts it), that ended in an error, or that
* carries any error payload is not a complete rephrase: the text it holds may
* be cut short or be the runner's own error message.
*/
function unusableRunReason(result) {
	if (typeof result !== "object" || result === null) return "no run result";
	const meta = result.meta;
	if (meta?.aborted === true) return "model turn aborted (timeout)";
	if (meta?.error !== void 0 && meta.error !== null) return "model turn ended in an error";
	if ((result.payloads ?? []).some((p) => p.isError === true)) return "model turn returned an error payload";
	return null;
}
/**
* Model completer over the embedded agent runner: one tool-less turn, temp
* session. `llm.timeoutMs` is a hard deadline: when it passes the turn is
* aborted and the completer throws, and the LLM scrambler stage then blocks
* the payload (enforce mode). It never returns a partial or error reply.
*/
function createRuntimeLlmCompleter(api, llm) {
	return async (system, user) => {
		const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "enclawed-egress-llm-"));
		const abort = new AbortController();
		let timer;
		const deadline = new Promise((_, reject) => {
			timer = setTimeout(() => {
				abort.abort();
				reject(/* @__PURE__ */ new Error(`egress LLM completer: no reply within ${llm.timeoutMs} ms`));
			}, llm.timeoutMs);
		});
		try {
			const sessionId = `egress-llm-scrambler-${Date.now()}`;
			const run = api.runtime.agent.runEmbeddedPiAgent({
				sessionId,
				sessionFile: path.join(tmpDir, "session.json"),
				workspaceDir: tmpDir,
				config: api.config,
				prompt: `${system}\n\n${user}`,
				timeoutMs: llm.timeoutMs,
				abortSignal: abort.signal,
				runId: sessionId,
				provider: llm.provider,
				model: llm.model,
				disableTools: true
			});
			run.catch(() => {});
			const result = await Promise.race([run, deadline]);
			const unusable = unusableRunReason(result);
			if (unusable) throw new Error(`egress LLM completer: ${unusable}`);
			const text = collectText(result);
			if (!text) throw new Error("egress LLM completer: empty model output");
			return text;
		} finally {
			clearTimeout(timer);
			await fs.rm(tmpDir, {
				recursive: true,
				force: true
			}).catch(() => {});
		}
	};
}
/** Install the runtime-backed seams. No-op outside full registration. */
function installEgressHostSeams(api, config) {
	if (api.registrationMode !== "full") return;
	if (config.llm.enabled && typeof api.runtime?.agent?.runEmbeddedPiAgent === "function") setLlmCompleter(createRuntimeLlmCompleter(api, config.llm));
	const loadAdapter = api.runtime?.channel?.outbound?.loadAdapter;
	if (config.coverTraffic.enabled) setOutboundEmitter(async (msg) => {
		if (msg.action) throw new Error("egress padding: send through the tool request client, not cover traffic");
		if (!msg.channel) throw new Error("egress cover traffic: target.channel is required");
		if (typeof loadAdapter !== "function") throw new Error("egress cover traffic: no channel outbound runtime");
		const adapter = await loadAdapter(msg.channel);
		if (!adapter?.sendText) throw new Error(`egress cover traffic: channel "${msg.channel}" cannot send text`);
		await adapter.sendText({
			cfg: api.config,
			to: msg.to,
			text: msg.content
		});
	});
}
//#endregion
//#region extensions/egress-mediator/src/media-codec.ts
/** Largest image the codec decodes, in pixels (matches the gateway's image limit). */
const MAX_INPUT_PIXELS = 25e6;
let sharpPromise;
async function loadSharp() {
	sharpPromise ??= import("sharp").then((mod) => mod.default ?? mod);
	return await sharpPromise;
}
function isWav(buffer) {
	return buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WAVE";
}
/** Classify an attachment by its content type, falling back to a WAV header sniff. */
function mediaKindOf(contentType, buffer) {
	const mime = contentType?.split(";")[0]?.trim().toLowerCase() ?? "";
	if (mime.startsWith("image/")) return "image";
	if (mime.startsWith("audio/") || isWav(buffer)) return "audio";
	return "other";
}
function parseWav(buffer) {
	if (!isWav(buffer)) throw new Error("not a RIFF/WAVE file");
	let offset = 12;
	let fmt = null;
	let data = null;
	while (offset + 8 <= buffer.length) {
		const id = buffer.toString("ascii", offset, offset + 4);
		const size = buffer.readUInt32LE(offset + 4);
		const body = offset + 8;
		if (body + size > buffer.length) throw new Error(`truncated ${id} chunk`);
		if (id === "fmt ") {
			let audioFormat = buffer.readUInt16LE(body);
			if (audioFormat === 65534 && size >= 40) audioFormat = buffer.readUInt16LE(body + 24);
			fmt = {
				audioFormat,
				channels: buffer.readUInt16LE(body + 2),
				sampleRate: buffer.readUInt32LE(body + 4),
				bits: buffer.readUInt16LE(body + 14)
			};
		} else if (id === "data") data = buffer.subarray(body, body + size);
		offset = body + size + size % 2;
	}
	if (!fmt || !data) throw new Error("missing fmt or data chunk");
	const pcm = fmt.audioFormat === 1 && [
		8,
		16,
		24,
		32
	].includes(fmt.bits);
	const float = fmt.audioFormat === 3 && fmt.bits === 32;
	if (!(pcm || float) || fmt.channels < 1 || fmt.sampleRate < 1) throw new Error(`unsupported WAV format ${fmt.audioFormat}/${fmt.bits}-bit`);
	return {
		format: {
			audioFormat: fmt.audioFormat,
			bitsPerSample: fmt.bits,
			sampleRate: fmt.sampleRate
		},
		channels: fmt.channels,
		data
	};
}
function readSample(data, at, format) {
	if (format.audioFormat === 3) return data.readFloatLE(at);
	switch (format.bitsPerSample) {
		case 8: return (data.readUInt8(at) - 128) / 128;
		case 16: return data.readInt16LE(at) / 32768;
		case 24: return data.readIntLE(at, 3) / 8388608;
		default: return data.readInt32LE(at) / 2147483648;
	}
}
function writeSample(out, at, value, format) {
	if (format.audioFormat === 3) {
		out.writeFloatLE(value, at);
		return;
	}
	const v = Math.max(-1, Math.min(1, value));
	switch (format.bitsPerSample) {
		case 8:
			out.writeUInt8(Math.max(0, Math.min(255, Math.round(v * 128 + 128))), at);
			return;
		case 16:
			out.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(v * 32768))), at);
			return;
		case 24:
			out.writeIntLE(Math.max(-8388608, Math.min(8388607, Math.round(v * 8388608))), at, 3);
			return;
		default: out.writeInt32LE(Math.max(-2147483648, Math.min(2147483647, Math.round(v * 2147483648))), at);
	}
}
function decodeWav(buffer) {
	const { format, channels, data } = parseWav(buffer);
	const bytes = format.bitsPerSample / 8;
	const frames = Math.floor(data.length / (bytes * channels));
	const out = Array.from({ length: channels }, () => new Float32Array(frames));
	for (let f = 0; f < frames; f++) for (let c = 0; c < channels; c++) out[c][f] = readSample(data, (f * channels + c) * bytes, format);
	return {
		channels: out.map((samples) => ({
			sampleRate: format.sampleRate,
			samples
		})),
		format
	};
}
function encodeWav(channels, format) {
	const count = channels.length;
	const frames = channels[0]?.samples.length ?? 0;
	const bytes = format.bitsPerSample / 8;
	const dataSize = frames * count * bytes;
	const out = Buffer.alloc(44 + dataSize);
	out.write("RIFF", 0, "ascii");
	out.writeUInt32LE(36 + dataSize, 4);
	out.write("WAVE", 8, "ascii");
	out.write("fmt ", 12, "ascii");
	out.writeUInt32LE(16, 16);
	out.writeUInt16LE(format.audioFormat, 20);
	out.writeUInt16LE(count, 22);
	out.writeUInt32LE(format.sampleRate, 24);
	out.writeUInt32LE(format.sampleRate * count * bytes, 28);
	out.writeUInt16LE(count * bytes, 32);
	out.writeUInt16LE(format.bitsPerSample, 34);
	out.write("data", 36, "ascii");
	out.writeUInt32LE(dataSize, 40);
	for (let f = 0; f < frames; f++) for (let c = 0; c < count; c++) writeSample(out, 44 + (f * count + c) * bytes, channels[c].samples[f] ?? 0, format);
	return out;
}
async function decodeImage(buffer) {
	const { data, info } = await (await loadSharp())(buffer, { limitInputPixels: MAX_INPUT_PIXELS }).rotate().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
	if (info.channels !== 4) throw new Error(`unexpected ${info.channels}-channel raster`);
	return {
		width: info.width,
		height: info.height,
		rgba: new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength)
	};
}
async function encodePng(image) {
	return await (await loadSharp())(Buffer.from(image.rgba.buffer, image.rgba.byteOffset, image.rgba.byteLength), { raw: {
		width: image.width,
		height: image.height,
		channels: 4
	} }).png().toBuffer();
}
/** Decode one attachment; never throws (a failure is reported as undecodable). */
async function decodeMedia(buffer, contentType) {
	const kind = mediaKindOf(contentType, buffer);
	if (kind === "other") return { kind: "opaque" };
	try {
		if (kind === "image") return {
			kind: "image",
			payload: await decodeImage(buffer)
		};
		return {
			kind: "audio",
			...decodeWav(buffer)
		};
	} catch (err) {
		return {
			kind: "undecodable",
			mediaKind: kind,
			reason: err instanceof Error ? err.message : String(err)
		};
	}
}
//#endregion
//#region extensions/egress-mediator/src/media-chokepoint.ts
const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");
function pngName(fileName) {
	if (!fileName) return;
	return `${fileName.replace(/\.[A-Za-z0-9]{1,5}$/u, "")}.png`;
}
/** One payload that stands for a whole attachment in the ordering pass. */
function orderingPayload(slot, channels) {
	if (slot.decoded.kind === "image") return {
		kind: "image",
		payload: slot.decoded.payload,
		slot
	};
	const total = channels.reduce((n, c) => n + c.samples.length, 0);
	const samples = new Float32Array(total);
	let at = 0;
	for (const channel of channels) {
		samples.set(channel.samples, at);
		at += channel.samples.length;
	}
	return {
		kind: "audio",
		payload: {
			sampleRate: channels[0]?.sampleRate ?? 0,
			samples
		},
		slot
	};
}
function registerMediaChokepoint(api, config, audit) {
	if (!config.egress.enabled || !config.media.enabled) return;
	const modeFor = (stageId) => effectiveStageMode(config, stageId);
	const active = () => getMediaScramblers().length > 0 || modeFor(STAGE_IDS.mediaOrder) === "enforce";
	const enforcingKinds = () => new Set(getMediaScramblers().filter((s) => modeFor(s.id) === "enforce").map((s) => s.kind));
	api.on("media_sending", async (event, hookCtx) => {
		if (!active() || event.media.length === 0) return;
		const sinkId = `media:${hookCtx?.conversationId ?? hookCtx?.channelId ?? event.to}`;
		const record = (finding) => audit.sink(sinkId, finding);
		const slots = [];
		for (const [index, original] of event.media.entries()) slots.push({
			index,
			original,
			decoded: await decodeMedia(original.buffer, original.contentType)
		});
		const strict = enforcingKinds();
		for (const slot of slots) {
			if (slot.decoded.kind !== "undecodable") continue;
			const enforce = strict.has(slot.decoded.mediaKind);
			record({
				stageId: "egress-mediator",
				severity: enforce ? "high" : "low",
				code: "media-undecodable",
				message: `cannot decode ${slot.decoded.mediaKind} attachment #${slot.index} (${slot.decoded.reason})`
			});
			if (enforce) {
				api.logger.warn(`egress-mediator: blocked outbound media to ${sinkId} (undecodable ${slot.decoded.mediaKind}: ${slot.decoded.reason})`);
				return { cancel: true };
			}
		}
		const decodable = slots.filter((s) => s.decoded.kind === "image" || s.decoded.kind === "audio");
		const flat = [];
		for (const slot of decodable) if (slot.decoded.kind === "image") flat.push({
			kind: "image",
			payload: slot.decoded.payload,
			slot
		});
		else if (slot.decoded.kind === "audio") for (const channel of slot.decoded.channels) flat.push({
			kind: "audio",
			payload: channel,
			slot
		});
		const scrambled = mediateMediaBatch(flat, {
			modeFor: (id) => id === STAGE_IDS.mediaOrder ? "off" : modeFor(id),
			audit: record
		});
		if (scrambled.cancelled) {
			api.logger.warn(`egress-mediator: blocked outbound media to ${sinkId} (${scrambled.reason})`);
			return { cancel: true };
		}
		const payloadsBySlot = /* @__PURE__ */ new Map();
		for (const item of scrambled.items) {
			const list = payloadsBySlot.get(item.slot) ?? [];
			list.push(item.payload);
			payloadsBySlot.set(item.slot, list);
		}
		const ordered = mediateMediaBatch(decodable.map((slot) => orderingPayload(slot, payloadsBySlot.get(slot) ?? [])), {
			modeFor,
			audit: record,
			scramblers: []
		});
		if (ordered.cancelled) return { cancel: true };
		const orderEnforced = modeFor(STAGE_IDS.mediaOrder) === "enforce";
		const others = slots.filter((s) => !decodable.includes(s));
		const sequence = orderEnforced ? [...ordered.items.map((item) => item.slot), ...others.toSorted((a, b) => {
			const ha = sha256(a.original.buffer);
			const hb = sha256(b.original.buffer);
			return ha < hb ? -1 : ha > hb ? 1 : 0;
		})] : slots;
		const rewritten = (slot) => {
			const after = payloadsBySlot.get(slot);
			const decoded = slot.decoded;
			if (!after) return false;
			if (decoded.kind === "image") return after[0] !== decoded.payload;
			return decoded.kind === "audio" && after.some((p, i) => p !== decoded.channels[i]);
		};
		if (!sequence.some((slot, i) => slot !== slots[i]) && !slots.some(rewritten)) return;
		const out = [];
		for (const slot of sequence) {
			const { original, decoded } = slot;
			if (!rewritten(slot)) {
				out.push({
					buffer: original.buffer,
					...original.contentType ? { contentType: original.contentType } : {},
					...original.fileName ? { fileName: original.fileName } : {}
				});
				continue;
			}
			const after = payloadsBySlot.get(slot);
			if (decoded.kind === "image") {
				const name = pngName(original.fileName);
				out.push({
					buffer: await encodePng(after[0]),
					contentType: "image/png",
					...name ? { fileName: name } : {}
				});
			} else if (decoded.kind === "audio") out.push({
				buffer: encodeWav(after, decoded.format),
				contentType: "audio/wav",
				...original.fileName ? { fileName: original.fileName } : {}
			});
		}
		return { media: out };
	}, { priority: 100 });
}
//#endregion
//#region extensions/egress-mediator/src/payload.ts
/** Network clients whose invocation makes a shell command an egress path. */
const NETWORK_COMMAND = /(^|[\s;&|(`$])(curl|wget|nc|ncat|netcat|socat|ssh|scp|sftp|rsync|ftp|tftp|telnet|http|https|xh|httpie|aria2c|openssl\s+s_client|dig|nslookup|host|ping|mail|sendmail|mutt|git\s+push|npm\s+publish|gh)\b|\/dev\/(tcp|udp)\/|https?:\/\//i;
/** Whether a shell command reaches the network (and so can carry a covert payload out). */
function isNetworkCommand(command) {
	return NETWORK_COMMAND.test(command);
}
const MAX_DEPTH = 32;
/** Path-ordered string leaves of a JSON-like value (non-empty strings only). */
function collectLeaves(value, out, depth = 0) {
	if (typeof value === "string") {
		if (value.length > 0) out.push(value);
		return out;
	}
	if (depth >= MAX_DEPTH || value === null || typeof value !== "object") return out;
	for (const item of Array.isArray(value) ? value : Object.values(value)) collectLeaves(item, out, depth + 1);
	return out;
}
/** Rebuild `value`, replacing its string leaves in the order `collectLeaves` saw them. */
function replaceLeaves(value, next, depth = 0) {
	if (typeof value === "string") return value.length > 0 ? next() : value;
	if (depth >= MAX_DEPTH || value === null || typeof value !== "object") return value;
	if (Array.isArray(value)) return value.map((item) => replaceLeaves(item, next, depth + 1));
	const out = {};
	for (const [key, item] of Object.entries(value)) out[key] = replaceLeaves(item, next, depth + 1);
	return out;
}
/** 20 random decimal digits: unaffected by case changes and homoglyph folding. */
function randomDigits() {
	return randomBytes(8).readBigUInt64BE().toString().padStart(20, "0");
}
/**
* Boundary marker between leaves. The unit separator (U+001F) is a control
* character none of the stages strips or folds, the newlines keep each leaf's
* line ends (trailing-whitespace removal applies per leaf as before), and the
* per-call random nonce means argument text cannot forge a boundary.
*/
function argumentBoundary(nonce) {
	return `\n\u001f${nonce}\u001f\n`;
}
/**
* Mediate every string leaf of a tool call's arguments in ONE pipeline run.
* `mediate` is called at most once.
*/
async function mediateArguments(value, mediate, nonce = randomDigits) {
	const leaves = collectLeaves(value, []);
	if (leaves.length === 0) return {
		cancelled: false,
		changed: false,
		value
	};
	let boundary = argumentBoundary(nonce());
	while (leaves.some((leaf) => leaf.includes(boundary))) boundary = argumentBoundary(nonce());
	const joined = leaves.join(boundary);
	const out = await mediate(joined, leaves.length > 1 ? boundary : void 0);
	if (out.cancelled) return out;
	if (out.content === joined) return {
		cancelled: false,
		changed: false,
		value
	};
	const parts = out.content.split(boundary);
	if (parts.length !== leaves.length) return {
		cancelled: true,
		reason: "a stage rewrite lost the tool-argument boundaries; call blocked"
	};
	let i = 0;
	return {
		cancelled: false,
		changed: true,
		value: replaceLeaves(value, () => parts[i++])
	};
}
/**
* Mediate the text blocks of a tool result's `content` array. Non-text blocks
* (images) pass through. Returns the new array, or null when nothing changed.
*/
async function mediateTextBlocks(content, mediate) {
	let changed = false;
	const next = [];
	for (const block of content) {
		if (block.type !== "text" || typeof block.text !== "string" || block.text.length === 0) {
			next.push(block);
			continue;
		}
		const out = await mediate(block.text);
		if (out.cancelled) return out;
		if (out.content !== block.text) {
			changed = true;
			next.push({
				...block,
				text: out.content
			});
		} else next.push(block);
	}
	return {
		cancelled: false,
		content: changed ? next : null
	};
}
//#endregion
//#region extensions/egress-mediator/src/mediator.ts
const sleep = (ms) => new Promise((resolve) => {
	setTimeout(resolve, ms);
});
/**
* Tools whose requests are chosen at run time, by tool identity: they are
* released unbatched rather than refused for lacking an observation. Any
* other tool without one is refused while the stage enforces.
*/
const RUNTIME_REQUEST_TOOLS = new Set([
	"browser",
	"exec",
	"bash"
]);
/**
* Channel send tools, by tool identity: when the channel declares no exact
* observation for a call, the call is released after the window as a charged
* ordering barrier instead of being refused.
*/
const UNORDERED_SEND_TOOLS = new Set(["message"]);
/** How long a collapsed repeat waits for the identical call's result. */
const COLLAPSED_WAIT_MS = 12e4;
/** Resolve to the promise's value, or undefined after `ms`. */
function withTimeout(promise, ms) {
	return new Promise((resolve) => {
		const timer = setTimeout(() => resolve(void 0), ms);
		timer.unref?.();
		promise.then((value) => {
			clearTimeout(timer);
			resolve(value);
		}, () => {
			clearTimeout(timer);
			resolve(void 0);
		});
	});
}
const MAX_SEAM_CALLS = 4096;
/** Batching scope of a tool call: its agent run, else its session. */
const actionScope = (ctx) => ctx?.runId ?? ctx?.sessionKey ?? "default";
const WITHHELD = (reason) => `[egress-mediator: content withheld (${reason})]`;
/**
* Wire the egress reference monitor onto the plugin host.
*/
function createEgressMediator(api, deps = {}) {
	const config = deps.config ?? resolveEgressMediatorConfig(api.pluginConfig);
	const wait = deps.sleep ?? sleep;
	const ledgers = createLedgerStore(config.egress.ledger);
	const audit = createAuditBuffer();
	const mediate = async (content, sink, metadata, options) => {
		const stages = getEgressStages(sink.kind);
		if (stages.length === 0) return {
			cancelled: false,
			content,
			delayMs: 0,
			findings: []
		};
		return runEgressPipeline(content, stages, {
			sink,
			metadata,
			ledger: ledgers.get(sink.id),
			now: monotonicNow,
			segmentBoundary: options?.segmentBoundary
		}, {
			modeFor: (stageId) => effectiveStageMode(config, stageId),
			audit: (finding) => audit.sink(sink.id, finding)
		});
	};
	/** Leaf mediator for structured payloads; accumulates the delay. */
	const leafMediator = (sink, delay) => {
		return async (text, segmentBoundary) => {
			const result = await mediate(text, sink, void 0, { segmentBoundary });
			if (result.cancelled) return {
				cancelled: true,
				reason: result.reason
			};
			delay.ms += result.delayMs;
			return {
				cancelled: false,
				content: result.content
			};
		};
	};
	const active = (kind) => config.egress.enabled && getEgressStages(kind).length > 0;
	api.on("message_sending", async (event, hookCtx) => {
		if (!active("channel")) return;
		const original = typeof event.content === "string" ? event.content : "";
		const sink = {
			kind: "channel",
			id: hookCtx?.conversationId ?? hookCtx?.channelId ?? event.to ?? "unknown",
			channelId: hookCtx?.channelId,
			accountId: hookCtx?.accountId,
			conversationId: hookCtx?.conversationId
		};
		const result = await mediate(original, sink, event.metadata);
		if (result.cancelled) {
			api.logger.warn(`egress-mediator: blocked outbound to ${sink.id} (${result.reason})`);
			return { cancel: true };
		}
		if (result.delayMs > 0) await wait(result.delayMs);
		return result.content !== original ? { content: result.content } : void 0;
	}, { priority: 100 });
	const tools = new Set(config.toolCall.tools);
	const commandTools = new Set(config.toolCall.commandTools);
	const dependencies = createDependencyTracker();
	let anonymousCalls = 0;
	const seamCalls = /* @__PURE__ */ new Map();
	/** Text pipeline over the outbound arguments of egress tools. */
	const mediateToolArgs = async (name, params) => {
		if (!config.toolCall.enabled || !active("tool-call")) return {};
		if (!tools.has(name)) {
			const command = params?.command;
			if (!commandTools.has(name) || typeof command !== "string" || !isNetworkCommand(command)) return {};
		}
		const sink = {
			kind: "tool-call",
			id: `tool:${name}`,
			toolName: name
		};
		const delay = { ms: 0 };
		const walked = await mediateArguments(params, leafMediator(sink, delay));
		if (walked.cancelled) {
			api.logger.warn(`egress-mediator: blocked tool call ${name} (${walked.reason})`);
			return {
				block: true,
				blockReason: `egress-mediator: ${walked.reason}`
			};
		}
		if (delay.ms > 0) await wait(delay.ms);
		return walked.changed ? { params: walked.value } : {};
	};
	/** Result text for a repeat answered locally, through model-input mediation when on. */
	const repeatText = async (name, response) => {
		const text = toolResultText(response);
		if (text === void 0 || !(config.modelInput.enabled && config.modelInput.toolResults)) return text;
		if (!active("model-input")) return text;
		const out = await mediate(text, {
			kind: "model-input",
			id: `tool-result:${name}`,
			toolName: name
		});
		return out.cancelled ? WITHHELD(out.reason) : out.content;
	};
	/**
	* Answer a repeat the batcher did not re-send. With the host's replay seam
	* the call reproduces the recorded outcome exactly (same result, or the same
	* error, as the call would have had): nothing is blocked or rewritten.
	* Without it, the repeat is refused with the earlier result as its text.
	*/
	const answerRepeat = async (name, how, recorded, call) => {
		const rec = recorded?.response;
		if (!recorded || !rec) return {
			block: true,
			blockReason: `egress-action-batcher: the identical ${name} call this repeat was collapsed into was not executed; not re-sent`
		};
		if (call && rec.via === "seam") {
			call.directive = {
				kind: "replay",
				outcome: rec.outcome
			};
			return null;
		}
		if (rec.via === "seam") {
			const outcome = rec.outcome;
			return {
				block: true,
				blockReason: repeatBlockReason(name, how, await repeatText(name, outcome.ok ? toolResultText(outcome.result) : outcome.error instanceof Error ? outcome.error.message : String(outcome.error)), !outcome.ok)
			};
		}
		if (!recorded.ok || rec.error !== void 0) return {
			block: true,
			blockReason: repeatBlockReason(name, how, rec.error ?? "failed", true)
		};
		return {
			block: true,
			blockReason: repeatBlockReason(name, how, await repeatText(name, rec.result))
		};
	};
	/**
	* Action batcher (choice-type covert channels): hold the call until its
	* window closes, then release it in canonical order, or answer an
	* idempotent repeat without re-sending it.
	*
	* M12: the submission never carries `dependsOn`. Nothing the agent
	* controls (its parameters, or URLs an earlier result named) can make an
	* action an ordering barrier; data-flow provenance is audit only.
	*/
	const batchToolCall = async (name, params, hookCtx, toolCallId) => {
		const batcher = getActionBatcher();
		if (!config.egress.enabled || !batcher) return null;
		const mode = effectiveStageMode(config, STAGE_IDS.actionBatcher);
		if (mode === "off") return null;
		const command = params?.command;
		if (!(batcher.options.tools.includes(name) || commandTools.has(name) && typeof command === "string" && isNetworkCommand(command))) return null;
		const scope = actionScope(hookCtx);
		const id = hookCtx?.toolCallId ?? toolCallId ?? `anonymous:${++anonymousCalls}`;
		const current = currentToolReplayCall();
		const call = current && current.toolCallId === id && current.toolName.trim().toLowerCase() === name.trim().toLowerCase() ? current : void 0;
		const action = await toolCallObservation(name, params, call);
		if (action === "no-request") return null;
		const unordered = !action && UNORDERED_SEND_TOOLS.has(name.trim().toLowerCase());
		if (unordered) {
			const tool = name.trim().toLowerCase();
			audit.sink(`tool:${tool}`, {
				stageId: STAGE_IDS.actionBatcher,
				severity: "low",
				code: "unordered-send",
				message: `tool ${tool} has no declared observation for this channel; released after the window, its order charged`,
				detail: {
					tool,
					scope,
					toolCallId: id
				}
			});
		}
		if (!action && RUNTIME_REQUEST_TOOLS.has(name.trim().toLowerCase())) {
			const tool = name.trim().toLowerCase();
			audit.sink(`tool:${tool}`, {
				stageId: STAGE_IDS.actionBatcher,
				severity: "low",
				code: "unbatched-runtime-request",
				message: `tool ${tool} chooses its requests at run time; released unbatched`,
				detail: {
					tool,
					scope,
					toolCallId: id
				}
			});
			batcher.noteUnbatched({
				id,
				scope,
				action: {
					type: "tool",
					toolName: tool,
					params
				}
			});
			return null;
		}
		if (!action && !unordered) {
			const tool = name.trim().toLowerCase();
			audit.sink(`tool:${tool}`, {
				stageId: STAGE_IDS.actionBatcher,
				severity: mode === "enforce" ? "high" : "medium",
				code: "unmapped-tool",
				message: `tool ${tool} has no declared observation; ${mode === "enforce" ? "refused" : "released unbatched (audit)"}`,
				detail: {
					tool,
					scope,
					toolCallId: id
				}
			});
			if (mode !== "enforce") return null;
			const reason = unmappedToolReason(tool);
			api.logger.warn(`egress-mediator: batcher refused tool call ${name} (${reason})`);
			return {
				block: true,
				blockReason: `egress-action-batcher: ${reason}`
			};
		}
		const release = await batcher.submit({
			id,
			action: action ?? {
				type: "send",
				target: `${name.trim().toLowerCase()}:${typeof params.channel === "string" ? params.channel : ""}`,
				content: JSON.stringify(params)
			},
			...action ? {} : { afterWindow: true },
			scope,
			dataFlowFrom: dependencies.dependsOn(scope, params),
			mode,
			ledger: ledgers.get(`action:${scope}`)
		});
		switch (release.outcome) {
			case "execute":
				if (release.tracked && call) {
					call.directive = { kind: "record" };
					seamCalls.set(id, call);
					if (seamCalls.size > MAX_SEAM_CALLS) {
						const oldest = seamCalls.keys().next().value;
						if (oldest !== void 0) seamCalls.delete(oldest);
					}
				}
				return null;
			case "blocked":
				api.logger.warn(`egress-mediator: batcher blocked tool call ${name} (${release.reason})`);
				return {
					block: true,
					blockReason: `egress-action-batcher: ${release.reason}`
				};
			case "collapsed": return await answerRepeat(name, "collapsed", await withTimeout(release.response, COLLAPSED_WAIT_MS), call);
			case "cached": return await answerRepeat(name, "cached", {
				ok: release.ok,
				response: release.response
			}, call);
		}
		return null;
	};
	api.on("before_tool_call", async (event, hookCtx) => {
		const name = event.toolName;
		const mediated = await mediateToolArgs(name, event.params);
		if (mediated.block) return mediated;
		const batched = await batchToolCall(name, mediated.params ?? event.params, hookCtx, event.toolCallId);
		if (batched?.block) return batched;
		return mediated.params ? { params: mediated.params } : void 0;
	}, { priority: 100 });
	api.on("after_tool_call", (event, hookCtx) => {
		const id = hookCtx?.toolCallId ?? event.toolCallId;
		const batcher = getActionBatcher();
		if (id && batcher) {
			const call = seamCalls.get(id);
			seamCalls.delete(id);
			if (call && !call.executed) batcher.abandon(id);
			else if (call?.outcome) {
				const recorded = {
					via: "seam",
					outcome: call.outcome
				};
				const rerun = call.rerun;
				const refresh = rerun ? async () => {
					const outcome = await rerun();
					return outcome ? {
						ok: outcome.ok,
						response: {
							via: "seam",
							outcome
						}
					} : null;
				} : void 0;
				if (call.outcome.ok) batcher.complete(id, recorded, void 0, refresh);
				else batcher.fail(id, recorded, void 0, refresh);
			} else if (event.error) batcher.fail(id, {
				via: "event",
				error: event.error
			});
			else batcher.complete(id, {
				via: "event",
				result: event.result
			});
		}
		if (id && !event.error) dependencies.record(actionScope(hookCtx), id, toolResultText(event.result));
	});
	api.on("agent_end", (_event, ctx) => {
		getActionBatcher()?.endScope(actionScope(ctx));
	});
	if (config.modelInput.enabled && config.modelInput.toolResults && typeof api.registerAgentToolResultMiddleware === "function") {
		const middleware = async (event) => {
			if (!active("model-input")) return;
			const content = event.result?.content;
			if (!Array.isArray(content)) return;
			const out = await mediateTextBlocks(content, leafMediator({
				kind: "model-input",
				id: `tool-result:${event.toolName}`,
				toolName: event.toolName
			}, { ms: 0 }));
			if (out.cancelled) {
				api.logger.warn(`egress-mediator: withheld ${event.toolName} result (${out.reason})`);
				return { result: {
					...event.result,
					content: [{
						type: "text",
						text: WITHHELD(out.reason)
					}]
				} };
			}
			return out.content ? { result: {
				...event.result,
				content: out.content
			} } : void 0;
		};
		api.registerAgentToolResultMiddleware(middleware, { runtimes: ["pi", "codex"] });
	}
	if (config.modelInput.enabled && config.modelInput.inbound) api.on("before_dispatch", async (event, hookCtx) => {
		if (!active("model-input")) return;
		const original = event.body ?? event.content;
		if (typeof original !== "string" || original.length === 0) return;
		const result = await mediate(original, {
			kind: "model-input",
			id: `inbound:${hookCtx?.conversationId ?? hookCtx?.channelId ?? event.channel ?? "unknown"}`,
			channelId: hookCtx?.channelId,
			accountId: hookCtx?.accountId,
			conversationId: hookCtx?.conversationId
		});
		if (result.cancelled) {
			api.logger.warn(`egress-mediator: dropped inbound message (${result.reason})`);
			return { handled: true };
		}
		return result.content !== original ? {
			handled: false,
			body: result.content
		} : void 0;
	}, { priority: 100 });
	registerMediaChokepoint(api, config, audit);
	return {
		audit,
		config,
		mediate
	};
}
/** Plugin entry wiring: hooks plus the runtime-backed host seams. */
function registerEgressMediator(api) {
	const mediator = createEgressMediator(api);
	installEgressHostSeams(api, mediator.config);
	return mediator;
}
//#endregion
export { DEFAULT_EGRESS_TOOLS as a, DEFAULT_COMMAND_TOOLS as i, registerEgressMediator as n, isHardenedFlavor as o, isNetworkCommand as r, resolveEgressMediatorConfig as s, createEgressMediator as t };
