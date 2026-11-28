import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash, createHmac, randomBytes } from "node:crypto";
import v8 from "node:v8";
//#region packages/egress-core/src/registry.ts
const REGISTRY_KEY = Symbol.for("enclawed.egress-core.stage-registry");
function getState$3() {
	const globals = globalThis;
	let state = globals[REGISTRY_KEY];
	if (!state) {
		state = { stages: /* @__PURE__ */ new Map() };
		globals[REGISTRY_KEY] = state;
	}
	return state;
}
/**
* Register a pipeline stage. Returns an unregister function; re-registering an
* id replaces the prior stage (last writer wins, idempotent on reload).
*/
function registerEgressStage(stage) {
	getState$3().stages.set(stage.id, stage);
	return () => {
		const { stages } = getState$3();
		if (stages.get(stage.id) === stage) stages.delete(stage.id);
	};
}
/**
* All registered stages applicable to `kind` (or every stage when omitted),
* sorted by ascending priority.
*/
function getEgressStages(kind) {
	const all = [...getState$3().stages.values()];
	return (kind ? all.filter((stage) => stage.kinds.includes(kind)) : all).toSorted((a, b) => a.priority - b.priority);
}
/** Test-only: clear the registry. */
function resetEgressRegistry() {
	getState$3().stages.clear();
}
//#endregion
//#region packages/egress-core/src/clock.ts
/** Milliseconds on the system-wide monotonic clock (arbitrary origin; intervals only). */
function monotonicNow() {
	return Number(process.hrtime.bigint() / 1000n) / 1e3;
}
//#endregion
//#region packages/egress-core/src/ledger.ts
function createCapacityLedger(opts) {
	const now = opts.now ?? monotonicNow;
	const capacity = Math.max(0, opts.capacityBits);
	const rate = Math.max(0, opts.refillBitsPerSec);
	let tokens = capacity;
	let last = now();
	let observed = 0;
	function refill(nowMs) {
		const elapsedSec = Math.max(0, (nowMs - last) / 1e3);
		tokens = Math.min(capacity, tokens + elapsedSec * rate);
		last = nowMs;
	}
	return {
		tryConsume(bits) {
			refill(now());
			const need = Math.max(0, bits);
			if (need <= tokens) {
				tokens -= need;
				return true;
			}
			return false;
		},
		available() {
			refill(now());
			return tokens;
		},
		refill,
		observe(bits) {
			observed += Math.max(0, bits);
		},
		observedTotal() {
			return observed;
		}
	};
}
/**
* Bounded store of per-sink ledgers. Capped to defend against unbounded growth
* from attacker-chosen sink ids (CWE-400) — the same concern the gateway
* control-plane rate limiter guards against.
*
* At the cap the store never resets a ledger that still holds spend: that
* would hand a drained sink a fresh budget. It first evicts ledgers whose
* bucket is full again (they carry no spend history). If none can go, new
* sinks share one overflow ledger, so flooding the store with fresh sink ids
* buys no extra capacity.
*/
function createLedgerStore(opts) {
	const store = /* @__PURE__ */ new Map();
	const maxSinks = Math.max(1, opts.maxSinks ?? 4096);
	const capacity = Math.max(0, opts.capacityBits);
	let overflow = null;
	function evictRefilled() {
		for (const [id, ledger] of store) if (ledger.available() >= capacity) {
			store.delete(id);
			return true;
		}
		return false;
	}
	return {
		get(sinkId) {
			const existing = store.get(sinkId);
			if (existing) return existing;
			if (store.size >= maxSinks && !evictRefilled()) {
				overflow ??= createCapacityLedger(opts);
				return overflow;
			}
			const ledger = createCapacityLedger(opts);
			store.set(sinkId, ledger);
			return ledger;
		},
		size: () => store.size,
		clear: () => {
			store.clear();
			overflow = null;
		}
	};
}
//#endregion
//#region packages/egress-core/src/audit.ts
function createAuditBuffer(opts) {
	const maxRecords = opts?.maxRecords ?? 2048;
	const records = [];
	return {
		sink(sinkId, finding) {
			records.push({
				ts: Date.now(),
				sink: sinkId,
				finding
			});
			if (records.length > maxRecords) records.splice(0, records.length - maxRecords);
		},
		records: () => records,
		forSink: (sinkId) => records.filter((r) => r.sink === sinkId),
		clear: () => {
			records.length = 0;
		}
	};
}
//#endregion
//#region packages/egress-core/src/config.ts
/** Canonical stage ids — also the per-stage config keys. */
const STAGE_IDS = {
	canonicalizer: "egress-canonicalizer",
	taint: "egress-taint-tracker",
	entropy: "egress-entropy-scanner",
	replay: "egress-replay-sentinel",
	noise: "egress-noise-injector",
	scrambler: "egress-semantic-scrambler",
	scramblerLlm: "egress-llm-scrambler",
	timingScrambler: "egress-timing-scrambler",
	behavioral: "egress-behavioral-invariants",
	actionBatcher: "egress-action-batcher",
	imageScrambler: "egress-image-scrambler",
	audioScrambler: "egress-audio-scrambler",
	mediaOrder: "egress-media-order"
};
/** Stage priorities — lower runs earlier. */
const STAGE_PRIORITY = {
	[STAGE_IDS.canonicalizer]: 10,
	[STAGE_IDS.taint]: 20,
	[STAGE_IDS.entropy]: 30,
	[STAGE_IDS.replay]: 35,
	[STAGE_IDS.noise]: 40,
	[STAGE_IDS.scrambler]: 45,
	[STAGE_IDS.scramblerLlm]: 46,
	[STAGE_IDS.timingScrambler]: 48,
	[STAGE_IDS.behavioral]: 50
};
/** Default per-stage mode — encodes the staged-enforcement posture. */
const DEFAULT_STAGE_MODES = {
	[STAGE_IDS.canonicalizer]: "enforce",
	[STAGE_IDS.taint]: "enforce",
	[STAGE_IDS.entropy]: "audit",
	[STAGE_IDS.replay]: "audit",
	[STAGE_IDS.noise]: "audit",
	[STAGE_IDS.scrambler]: "audit",
	[STAGE_IDS.scramblerLlm]: "audit",
	[STAGE_IDS.timingScrambler]: "audit",
	[STAGE_IDS.behavioral]: "audit",
	[STAGE_IDS.actionBatcher]: "enforce",
	[STAGE_IDS.imageScrambler]: "audit",
	[STAGE_IDS.audioScrambler]: "audit",
	[STAGE_IDS.mediaOrder]: "audit"
};
const defaultEgressConfig = {
	enabled: true,
	ledger: {
		capacityBits: 4096,
		refillBitsPerSec: 256
	},
	stages: {}
};
/** Resolve the effective mode for a stage from config + defaults. */
function resolveStageMode(config, stageId) {
	return config.stages[stageId]?.mode ?? DEFAULT_STAGE_MODES[stageId] ?? "audit";
}
/** Merge a partial (e.g. plugin) config over the defaults. */
function mergeEgressConfig(partial) {
	if (!partial) return {
		...defaultEgressConfig,
		stages: {}
	};
	return {
		enabled: partial.enabled ?? defaultEgressConfig.enabled,
		ledger: {
			...defaultEgressConfig.ledger,
			...partial.ledger
		},
		stages: { ...partial.stages }
	};
}
//#endregion
//#region packages/egress-core/src/pipeline.ts
async function runEgressPipeline(content, stages, base, opts) {
	let current = content;
	let delayMs = 0;
	const findings = [];
	for (const stage of stages) {
		const mode = opts.modeFor(stage.id);
		if (mode === "off") continue;
		const collect = (finding) => {
			findings.push(finding);
			opts.audit?.(finding);
		};
		const ctx = {
			sink: base.sink,
			metadata: base.metadata,
			ledger: base.ledger,
			mode,
			now: base.now,
			audit: collect,
			...base.segmentBoundary ? { segmentBoundary: base.segmentBoundary } : {}
		};
		let decision;
		try {
			decision = await stage.apply(current, ctx);
		} catch (err) {
			collect({
				stageId: stage.id,
				severity: "high",
				code: "stage-error",
				message: `stage ${stage.id} threw: ${err instanceof Error ? err.message : String(err)}`
			});
			if (mode === "enforce") return {
				cancelled: true,
				reason: `${stage.id}: internal error`,
				findings,
				delayMs
			};
			continue;
		}
		switch (decision.action) {
			case "pass": break;
			case "rewrite":
				if (mode === "enforce") current = decision.content;
				else collect({
					stageId: stage.id,
					severity: "info",
					code: "rewrite-suppressed-audit",
					message: `${stage.id} proposed a rewrite (audit mode — not applied)`
				});
				break;
			case "delay":
				if (mode === "enforce") delayMs += Math.max(0, decision.delayMs);
				break;
			case "cancel":
				if (mode === "enforce") return {
					cancelled: true,
					reason: decision.reason,
					findings,
					delayMs
				};
				collect({
					stageId: stage.id,
					severity: "medium",
					code: "cancel-suppressed-audit",
					message: `${stage.id} would cancel (audit mode): ${decision.reason}`
				});
				break;
		}
	}
	return {
		cancelled: false,
		content: current,
		delayMs,
		findings
	};
}
//#endregion
//#region packages/egress-core/src/runner.ts
function createEgressRunner(options = {}) {
	const config = mergeEgressConfig(options.config);
	const ledgers = createLedgerStore(config.ledger);
	const audit = createAuditBuffer();
	const now = options.now ?? monotonicNow;
	const fixed = options.stages ? [...options.stages].toSorted((a, b) => a.priority - b.priority) : null;
	const run = (async (content, sink, metadata) => {
		if (!config.enabled) return {
			cancelled: false,
			content,
			delayMs: 0,
			findings: []
		};
		return runEgressPipeline(content, fixed ? fixed.filter((stage) => stage.kinds.includes(sink.kind)) : getEgressStages(sink.kind), {
			sink,
			metadata,
			ledger: ledgers.get(sink.id),
			now
		}, {
			modeFor: (stageId) => resolveStageMode(config, stageId),
			audit: (finding) => audit.sink(sink.id, finding)
		});
	});
	run.audit = audit;
	run.config = config;
	return run;
}
//#endregion
//#region packages/egress-core/src/host-seams.ts
const SEAM_KEY = Symbol.for("enclawed.egress-core.host-seams");
function getState$2() {
	const globals = globalThis;
	let state = globals[SEAM_KEY];
	if (!state) {
		state = {
			outboundEmitter: null,
			llmCompleter: null
		};
		globals[SEAM_KEY] = state;
	}
	return state;
}
/**
* Host injects an outbound emitter so the cover-traffic extension can send
* dummy messages. Without it, cover traffic runs in schedule-only mode.
*/
function setOutboundEmitter(emitter) {
	getState$2().outboundEmitter = emitter;
}
/** Whether a host outbound emitter is available for cover traffic. */
function hasOutboundEmitter() {
	return getState$2().outboundEmitter !== null;
}
/** Emit one cover-traffic message; returns false if no emitter is installed. */
async function emitOutbound(msg) {
	const { outboundEmitter } = getState$2();
	if (!outboundEmitter) return false;
	await outboundEmitter(msg);
	return true;
}
/**
* Host injects a model-completion function so the LLM-scrambler extension can
* rephrase outbound text. The extension supplies its own fixed system prompt;
* the host only supplies the model transport. Without an injected completer
* the LLM scrambler is inert (pass-through).
*/
function setLlmCompleter(completer) {
	getState$2().llmCompleter = completer;
}
/** Whether a host LLM completer is available for the LLM scrambler. */
function hasLlmCompleter() {
	return getState$2().llmCompleter !== null;
}
/**
* Run a model completion through the host-injected completer. Returns null if
* no completer is installed. Errors from the completer (including its
* timeout) propagate to the caller; the LLM-scrambler stage catches them and,
* in enforce mode, blocks the payload instead of passing it unscrambled.
*/
async function llmComplete(system, user) {
	const { llmCompleter } = getState$2();
	if (!llmCompleter) return null;
	return llmCompleter(system, user);
}
/** Test-only: clear injected seams. */
function resetEgressHostSeams() {
	const state = getState$2();
	state.outboundEmitter = null;
	state.llmCompleter = null;
}
//#endregion
//#region packages/egress-core/src/media.ts
const MEDIA_KEY = Symbol.for("enclawed.egress-core.media-registry");
function getState$1() {
	const globals = globalThis;
	let state = globals[MEDIA_KEY];
	if (!state) {
		state = { scramblers: /* @__PURE__ */ new Map() };
		globals[MEDIA_KEY] = state;
	}
	return state;
}
/** Register a media scrambler. Returns an unregister function. */
function registerMediaScrambler(scrambler) {
	getState$1().scramblers.set(scrambler.id, scrambler);
	return () => {
		const { scramblers } = getState$1();
		if (scramblers.get(scrambler.id) === scrambler) scramblers.delete(scrambler.id);
	};
}
/** All registered media scramblers, optionally filtered by media kind. */
function getMediaScramblers(kind) {
	const all = [...getState$1().scramblers.values()];
	return kind ? all.filter((s) => s.kind === kind) : all;
}
/** Test-only: clear the media registry. */
function resetMediaRegistry() {
	getState$1().scramblers.clear();
}
//#endregion
//#region packages/egress-core/src/media-hash.ts
/** SHA-256 hex of the canonical bytes of an image payload (width, height, RGBA). */
function hashImagePayload(image) {
	const header = Buffer.from(`image:${image.width}x${image.height}:`);
	const pixels = Buffer.from(image.rgba.buffer, image.rgba.byteOffset, image.rgba.byteLength);
	return createHash("sha256").update(header).update(pixels).digest("hex");
}
/** SHA-256 hex of the canonical bytes of an audio payload (sampleRate, Float32 samples). */
function hashAudioPayload(audio) {
	const header = Buffer.from(`audio:${audio.sampleRate}:${audio.samples.length}:`);
	const samples = Buffer.from(audio.samples.buffer, audio.samples.byteOffset, audio.samples.byteLength);
	return createHash("sha256").update(header).update(samples).digest("hex");
}
//#endregion
//#region packages/egress-core/src/media-exemption.ts
const EXEMPTION_KEY = Symbol.for("enclawed.egress-core.media-exemption");
function getState() {
	const globals = globalThis;
	let state = globals[EXEMPTION_KEY];
	if (!state) {
		state = { check: null };
		globals[EXEMPTION_KEY] = state;
	}
	return state;
}
/** Install the host's media-exemption check. Replaces any previous check. */
function setMediaExemptionCheck(check) {
	getState().check = check;
}
/** Whether a host media-exemption check is installed. */
function hasMediaExemptionCheck() {
	return getState().check !== null;
}
/**
* Whether a payload is exempt from media scrambling. False when no check is
* installed, and false when the check throws (fail-secure: scramble).
*/
function isMediaExempt(subject) {
	const { check } = getState();
	if (!check) return false;
	try {
		return check(subject) === true;
	} catch {
		return false;
	}
}
/** Test-only: remove the installed check. */
function resetMediaExemption() {
	getState().check = null;
}
//#endregion
//#region packages/egress-core/src/media-sequence.ts
/**
* Reorder a batch of media items into a canonical, attacker-independent
* order. Items the host's exemption check accepts keep their relative order
* (and are emitted first --- they are the trusted stream); every other item
* is sorted by content hash so the order is a function of the bytes, not the
* attacker.
*/
function canonicalMediaOrder(batch) {
	const exempt = [];
	const suspect = [];
	for (const item of batch) if (isMediaExempt(item)) exempt.push(item);
	else {
		const hash = item.kind === "image" ? hashImagePayload(item.payload) : hashAudioPayload(item.payload);
		suspect.push({
			item,
			hash
		});
	}
	suspect.sort((a, b) => a.hash < b.hash ? -1 : a.hash > b.hash ? 1 : 0);
	return [...exempt, ...suspect.map((u) => u.item)];
}
//#endregion
//#region packages/egress-core/src/media-egress.ts
/** Number of samples (or RGBA bytes) that differ between two payloads. */
function countChanged(before, after) {
	const a = before.kind === "image" ? before.payload.rgba : before.payload.samples;
	const b = before.kind === "image" ? after.rgba : after.samples;
	if (a.length !== b.length) return Math.max(a.length, b.length);
	let changed = 0;
	for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) changed++;
	return changed;
}
function applyScrambler(item, scrambler) {
	if (scrambler.kind === "image" && item.kind === "image") return scrambler.scramble(item.payload);
	if (scrambler.kind === "audio" && item.kind === "audio") return scrambler.scramble(item.payload);
	return item.payload;
}
/**
* Scramble and canonically order one outbound media batch. Items are matched
* by object identity across the ordering step, so callers may attach their
* own fields (for example the original file name) to each item.
*/
function mediateMediaBatch(batch, opts) {
	const findings = [];
	const collect = (finding) => {
		findings.push(finding);
		opts.audit?.(finding);
	};
	const scramblers = (opts.scramblers ?? getMediaScramblers()).toSorted((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
	let changed = false;
	const items = [];
	for (const [index, original] of batch.entries()) {
		let current = original;
		for (const scrambler of scramblers) {
			if (scrambler.kind !== current.kind) continue;
			const mode = opts.modeFor(scrambler.id);
			if (mode === "off") continue;
			let next;
			try {
				next = applyScrambler(current, scrambler);
			} catch (err) {
				collect({
					stageId: scrambler.id,
					severity: "high",
					code: "stage-error",
					message: `media scrambler ${scrambler.id} threw: ${err instanceof Error ? err.message : String(err)}`
				});
				if (mode === "enforce") return {
					cancelled: true,
					reason: `${scrambler.id}: internal error`,
					findings
				};
				continue;
			}
			const diff = countChanged(current, next);
			if (diff === 0) continue;
			if (mode === "enforce") {
				collect({
					stageId: scrambler.id,
					severity: "medium",
					code: "media-scrambled",
					message: `${scrambler.id} rewrote ${current.kind} #${index} (${diff} values changed)`,
					detail: {
						index,
						changedValues: diff
					}
				});
				current = {
					...original,
					payload: next
				};
				changed = true;
			} else collect({
				stageId: scrambler.id,
				severity: "info",
				code: "rewrite-suppressed-audit",
				message: `${scrambler.id} would rewrite ${current.kind} #${index} (${diff} values; audit mode, not applied)`,
				detail: {
					index,
					changedValues: diff
				}
			});
		}
		items.push(current);
	}
	const orderMode = opts.modeFor(STAGE_IDS.mediaOrder);
	if (orderMode !== "off" && items.length > 1) {
		const ordered = canonicalMediaOrder(items);
		if (ordered.some((item, i) => item !== items[i])) {
			let bits = 0;
			for (let n = 2; n <= items.length; n++) bits += Math.log2(n);
			collect({
				stageId: STAGE_IDS.mediaOrder,
				severity: orderMode === "enforce" ? "low" : "info",
				code: orderMode === "enforce" ? "media-reordered" : "rewrite-suppressed-audit",
				message: orderMode === "enforce" ? `reordered ${items.length} media items into canonical content-hash order` : `would reorder ${items.length} media items into canonical order (audit mode, not applied)`,
				estimatedBits: Math.round(bits)
			});
			if (orderMode === "enforce") return {
				cancelled: false,
				items: ordered,
				changed: true,
				findings
			};
		}
	}
	return {
		cancelled: false,
		items,
		changed,
		findings
	};
}
//#endregion
//#region packages/egress-core/src/config-validation.ts
function describeBounds(bounds) {
	const parts = [];
	if (bounds.integer) parts.push("an integer");
	else parts.push("a number");
	if (bounds.min !== void 0) parts.push(`>= ${bounds.min}`);
	if (bounds.above !== void 0) parts.push(`> ${bounds.above}`);
	if (bounds.max !== void 0) parts.push(`<= ${bounds.max}`);
	if (bounds.below !== void 0) parts.push(`< ${bounds.below}`);
	return parts.join(" ");
}
function withinBounds(value, bounds) {
	if (!Number.isFinite(value)) return false;
	if (bounds.integer && !Number.isInteger(value)) return false;
	if (bounds.min !== void 0 && value < bounds.min) return false;
	if (bounds.above !== void 0 && value <= bounds.above) return false;
	if (bounds.max !== void 0 && value > bounds.max) return false;
	if (bounds.below !== void 0 && value >= bounds.below) return false;
	return true;
}
/**
* Build a reader over a plugin's raw config. `knownKeys` lists every key the
* plugin's manifest schema declares; any other key is refused, mirroring the
* schema's `additionalProperties: false` for hosts that skip schema checks.
*/
function createPluginConfigReader(pluginId, raw, knownKeys) {
	return createReader(pluginId, "", raw, knownKeys);
}
function createReader(pluginId, prefix, raw, knownKeys) {
	const fail = (message) => {
		throw new Error(`${pluginId}: invalid config: ${message}`);
	};
	const where = prefix ? prefix.slice(0, -1) : "config";
	if (raw !== void 0 && raw !== null && (typeof raw !== "object" || Array.isArray(raw))) fail(`${where} must be an object`);
	const config = raw ?? {};
	const known = new Set(knownKeys);
	const unknown = Object.keys(config).filter((key) => !known.has(key)).map((key) => `${prefix}${key}`).toSorted();
	if (unknown.length > 0) fail(`unknown option(s): ${unknown.join(", ")}`);
	const name = (key) => `${prefix}${key}`;
	const readNumber = (key, bounds) => {
		const value = config[key];
		if (value === void 0) return;
		if (typeof value !== "number" || !withinBounds(value, bounds)) fail(`${name(key)} must be ${describeBounds(bounds)}`);
		return value;
	};
	return {
		bool(key, fallback) {
			const value = config[key];
			if (value === void 0) return fallback;
			if (typeof value !== "boolean") fail(`${name(key)} must be a boolean`);
			return value;
		},
		number(key, fallback, bounds = {}) {
			return readNumber(key, bounds) ?? fallback;
		},
		optionalNumber(key, bounds = {}) {
			return readNumber(key, bounds);
		},
		oneOf(key, values, fallback) {
			const value = config[key];
			if (value === void 0) return fallback;
			if (typeof value !== "string" || !values.includes(value)) fail(`${name(key)} must be one of ${values.join(", ")}`);
			return value;
		},
		optionalString(key) {
			const value = config[key];
			if (value === void 0) return;
			if (typeof value !== "string" || !value.trim()) fail(`${name(key)} must be a non-empty string`);
			return value.trim();
		},
		stringList(key, fallback) {
			const value = config[key];
			if (value === void 0) return fallback;
			if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) fail(`${name(key)} must be a list of non-empty strings`);
			return value.map((item) => item.trim());
		},
		section(key, sectionKeys) {
			return createReader(pluginId, `${name(key)}.`, config[key], sectionKeys);
		},
		entries(key, entryKeys) {
			const value = config[key];
			if (value === void 0) return [];
			if (value === null || typeof value !== "object" || Array.isArray(value)) fail(`${name(key)} must be an object`);
			return Object.entries(value).map(([entry, entryRaw]) => {
				if (entryRaw === null || entryRaw === void 0) fail(`${name(key)}.${entry} must be an object`);
				return [entry, createReader(pluginId, `${name(key)}.${entry}.`, entryRaw, entryKeys)];
			});
		},
		has(key) {
			return config[key] !== void 0;
		},
		fail
	};
}
//#endregion
//#region packages/egress-core/src/segments.ts
/** Apply `fn` to each segment of `content` (or to the whole of it when unsegmented). */
function mapSegments(content, ctx, fn) {
	const boundary = ctx.segmentBoundary;
	if (!boundary || !content.includes(boundary)) return fn(content);
	return content.split(boundary).map((segment) => fn(segment)).join(boundary);
}
/** Async `mapSegments`; segments are processed one at a time, in order. */
async function mapSegmentsAsync(content, ctx, fn) {
	const boundary = ctx.segmentBoundary;
	if (!boundary || !content.includes(boundary)) return await fn(content);
	const out = [];
	for (const segment of content.split(boundary)) out.push(await fn(segment));
	return out.join(boundary);
}
//#endregion
//#region packages/egress-core/src/action.ts
const TOOL_CLASSIFIER_KEY = Symbol.for("enclawed.tool-capability-classifier");
function classifierSlot() {
	const globals = globalThis;
	let slot = globals[TOOL_CLASSIFIER_KEY];
	if (!slot) {
		slot = { classify: null };
		globals[TOOL_CLASSIFIER_KEY] = slot;
	}
	return slot;
}
/** Install a tool capability classifier (the host does this at boot). */
function setToolCapabilityClassifier(classify) {
	classifierSlot().classify = classify;
}
/** Whether a tool capability classifier is installed. */
function hasToolCapabilityClassifier() {
	return classifierSlot().classify !== null;
}
const CACHEABLE_METHODS = new Set([
	"GET",
	"HEAD",
	"OPTIONS"
]);
const WINDOW_ONLY_METHODS = new Set(["PUT", "DELETE"]);
/** True when the HTTP method is safe to issue as padding (no side effects). */
function isSafeHttpMethod(method) {
	return CACHEABLE_METHODS.has(method.trim().toUpperCase());
}
function classifyTool(toolName) {
	const { classify } = classifierSlot();
	if (!classify) return "never";
	try {
		const info = classify(toolName);
		if (info.capability === "fs.read" || info.exemption === "read-only-retrieval") return "cacheable";
	} catch {}
	return "never";
}
/** Deterministic idempotency class of an action. */
function classifyActionIdempotency(action) {
	switch (action.type) {
		case "http": {
			const method = action.method.trim().toUpperCase();
			const also = action.also ?? [];
			if (action.read === true || CACHEABLE_METHODS.has(method) && also.every((r) => isSafeHttpMethod(r.method))) return "cacheable";
			return WINDOW_ONLY_METHODS.has(method) && also.length === 0 ? "window-only" : "never";
		}
		case "tool": return classifyTool(action.toolName.trim().toLowerCase());
		case "file-write": return "window-only";
		case "send": return "never";
	}
	return "never";
}
/** JSON with object keys sorted at every depth, so equal values encode equally. */
function stableJson(value, depth = 0) {
	if (depth > 32) return "null";
	if (Array.isArray(value)) return `[${value.map((v) => stableJson(v, depth + 1)).join(",")}]`;
	if (value !== null && typeof value === "object") return `{${Object.keys(value).toSorted().filter((k) => value[k] !== void 0).map((k) => `${JSON.stringify(k)}:${stableJson(value[k], depth + 1)}`).join(",")}}`;
	const json = JSON.stringify(value);
	return json === void 0 ? "null" : json;
}
/**
* The URL exactly as an HTTP client puts it on the wire (C1: key on the
* request actually sent, not on the string the agent typed).
*
* WHATWG parsing already performs every normalization the client applies:
* lower-case scheme and host, default port dropped, IDN to punycode, dot
* segments resolved, `\` read as `/`, an empty path read as `/`, and
* characters outside the URL code points percent-encoded. On top of that,
* two parts of the string never reach the wire:
*   - the fragment (`#...`): fetch never sends it;
*   - an empty query (a bare `?`): fetch sends `pathname + search`, and
*     `search` is "" for an empty query, so `/a?` and `/a` are the same
*     request line.
* Both are removed here. Nothing else is: percent-encoding case (`%2f` vs
* `%2F`) and percent-encoded unreserved characters (`%41` vs `A`) are sent
* as written, so they are different requests on the wire and stay different
* keys (merging them would merge requests that differ on the wire). The
* user-info part is kept as well: fetch refuses such URLs, so they never
* leave, and must not be merged with one that does.
*
* Unparseable strings are returned trimmed: they are never sent.
*/
function wireRequestUrl(raw) {
	let url;
	try {
		url = new URL(raw.trim());
	} catch {
		return raw.trim();
	}
	url.hash = "";
	if (url.search === "") url.search = "";
	return url.href;
}
/** Origin (scheme, host, port) of an HTTP URL, or null when it has none. */
function httpOrigin(raw) {
	try {
		const url = new URL(raw.trim());
		return url.protocol === "http:" || url.protocol === "https:" ? url.origin : null;
	} catch {
		return null;
	}
}
/**
* Canonical encoding of an action: equal effects encode to equal strings.
* HTTP methods are upper-cased and URLs reduced to the request that goes on
* the wire (`wireRequestUrl`), tool names lower-cased, and structured
* parameters key-sorted.
*/
function canonicalActionEncoding(action) {
	switch (action.type) {
		case "http": return stableJson({
			...action.client === void 0 ? {} : { cl: action.client },
			...action.also === void 0 || action.also.length === 0 ? {} : { al: action.also.map((r) => ({
				m: r.method.trim().toUpperCase(),
				u: wireRequestUrl(r.url),
				b: r.body ?? ""
			})) },
			t: "http",
			m: action.method.trim().toUpperCase(),
			u: wireRequestUrl(action.url),
			b: action.body ?? ""
		});
		case "tool": return stableJson({
			t: "tool",
			n: action.toolName.trim().toLowerCase(),
			p: action.params ?? null
		});
		case "file-write": return stableJson(action.identity === void 0 ? {
			t: "file-write",
			p: action.path,
			c: action.content
		} : {
			t: "file-write",
			i: action.identity,
			c: action.content
		});
		case "send": return stableJson({
			t: "send",
			to: action.target,
			c: action.content
		});
	}
	return stableJson(action);
}
/** SHA-256 hex of the canonical encoding: the batcher's sort and dedup key. */
function actionKey(action) {
	return createHash("sha256").update(canonicalActionEncoding(action)).digest("hex");
}
const TOOL_REQUEST_CLIENT_KEY = Symbol.for("enclawed.tool-request-client");
function toolRequestSlot() {
	const globals = globalThis;
	let slot = globals[TOOL_REQUEST_CLIENT_KEY];
	if (!slot) {
		slot = {
			clients: /* @__PURE__ */ new Map(),
			listeners: /* @__PURE__ */ new Set()
		};
		globals[TOOL_REQUEST_CLIENT_KEY] = slot;
	}
	return slot;
}
/** Install (or, with `null`, remove) a tool's request client. The host does this. */
function setToolRequestClient(toolName, client) {
	const name = toolName.trim().toLowerCase();
	if (client) toolRequestSlot().clients.set(name, client);
	else toolRequestSlot().clients.delete(name);
}
/** The request client a tool published, or null. */
function getToolRequestClient(toolName) {
	return toolRequestSlot().clients.get(toolName.trim().toLowerCase()) ?? null;
}
/** Listen for real requests a tool issues. Returns an unsubscribe function. */
function onToolRequestIssued(listener) {
	const slot = toolRequestSlot();
	slot.listeners.add(listener);
	return () => {
		slot.listeners.delete(listener);
	};
}
/**
* A tool is about to send a real request: wait for its slot. Resolves when
* the request may leave; rejects when it must not (its slot expired and a
* substitute already went out). The host's web_fetch does this; tests and
* the benchmark play the tool with it.
*/
async function requestToolIssueSlot(toolName, url, callId) {
	const waits = [];
	for (const listener of toolRequestSlot().listeners) try {
		const wait = listener(toolName.trim().toLowerCase(), url, callId);
		if (wait && typeof wait.then === "function") waits.push(wait);
	} catch {}
	await Promise.all(waits);
}
/** Report that a tool issued a real request without waiting for a slot. */
function notifyToolRequestIssued(toolName, url, callId) {
	requestToolIssueSlot(toolName, url, callId).catch(() => {});
}
const TOOL_REPLAY_KEY = Symbol.for("enclawed.tool-replay");
/** The replay context of the tool call running now, or undefined (no host support). */
function currentToolReplayCall() {
	const slot = globalThis[TOOL_REPLAY_KEY];
	try {
		return slot?.als?.getStore();
	} catch {
		return;
	}
}
/** The URL of the outbound GET an action stands for, or null when it is not one. */
function outboundGetUrl(action) {
	if (action.type === "http" && (action.client === void 0 || action.client === "web_fetch") && (action.also === void 0 || action.also.length === 0) && action.method.trim().toUpperCase() === "GET") return action.url;
	return null;
}
//#endregion
//#region packages/egress-core/src/refresh-entropy.ts
const ENTROPY_KEY = Symbol.for("enclawed.egress-core.refresh-entropy");
function entropySlot() {
	const globals = globalThis;
	let slot = globals[ENTROPY_KEY];
	if (!slot) {
		slot = { source: null };
		globals[ENTROPY_KEY] = slot;
	}
	return slot;
}
/** Install (or with null remove) the optional extra entropy source. The host does this. */
function setRefreshEntropySource(source) {
	entropySlot().source = source;
}
/** Extra bytes from the installed source, or empty on absence, error or timeout. */
async function extraEntropy(source) {
	if (!source) return new Uint8Array(0);
	let timer;
	try {
		const timeout = new Promise((resolve) => {
			timer = setTimeout(() => resolve(null), 200);
			timer.unref?.();
		});
		const bytes = await Promise.race([source(64), timeout]);
		if (!(bytes instanceof Uint8Array)) return new Uint8Array(0);
		return bytes.subarray(0, 64);
	} catch {
		return new Uint8Array(0);
	} finally {
		clearTimeout(timer);
	}
}
/** The seed of one scope's jitter stream (see header). */
async function deriveScopeSeed(scope, deps = {}) {
	const host = (deps.hostBytes ?? ((n) => randomBytes(n)))(32);
	const extra = await extraEntropy(deps.extra === void 0 ? entropySlot().source : deps.extra);
	const len = Buffer.alloc(4);
	len.writeUInt32BE(extra.byteLength);
	return createHash("sha3-256").update(host).update(len).update(extra).update(Buffer.from(scope, "utf8")).digest();
}
/** Uniform integers in [min, max) from an HMAC-SHA256 counter-mode stream keyed by `seed`. */
function createSeededRandomInt(seed) {
	let counter = 0;
	let pool = Buffer.alloc(0);
	const take = (n) => {
		while (pool.length < n) {
			const block = createHmac("sha256", seed).update(`jitter:${counter++}`).digest();
			pool = Buffer.concat([pool, block]);
		}
		const out = pool.subarray(0, n);
		pool = pool.subarray(n);
		return out;
	};
	return (min, max) => {
		const range = max - min;
		if (!Number.isInteger(range) || range <= 0 || range > 2 ** 32) throw new RangeError(`bad range [${min}, ${max})`);
		const limit = Math.floor(2 ** 32 / range) * range;
		for (;;) {
			const v = take(4).readUInt32BE(0);
			if (v < limit) return min + v % range;
		}
	};
}
//#endregion
//#region packages/egress-core/src/action-batcher.ts
const ACTION_BATCHER_STAGE_ID = STAGE_IDS.actionBatcher;
/** Tools whose calls are observable outside the host, plus file writes. */
const DEFAULT_BATCHED_TOOLS = [
	"message",
	"sessions_send",
	"web_fetch",
	"web_search",
	"x_search",
	"browser",
	"write"
];
const DEFAULT_ACTION_BATCHER_OPTIONS = {
	windowMs: 250,
	canonicalOrder: true,
	collapseIdempotentRepeats: true,
	cacheTtlMs: 3e4,
	padding: {
		enabled: false,
		allowedSet: []
	},
	tools: DEFAULT_BATCHED_TOOLS
};
/**
* Internal refresh tuning (not configuration): every recorded side-effect-free
* outcome in a live scope is re-issued by the batcher itself in rounds whose
* spacing is drawn from [intervalMs·(1−jitter), intervalMs·(1+jitter)], at most
* `perInterval` refreshes per scope per round.
*/
const REFRESH_DEFAULTS = {
	intervalMs: 3e4,
	perInterval: 64,
	jitter: .5
};
/** Padding entries: a URL string (GET) or `{ method, url }` with a safe method; else null. */
function paddingAction(entry) {
	if (typeof entry === "string" && entry.trim()) return {
		type: "http",
		method: "GET",
		url: entry.trim()
	};
	if (entry && typeof entry === "object" && !Array.isArray(entry)) {
		const { method, url, ...rest } = entry;
		if (Object.keys(rest).length > 0) return null;
		const m = method === void 0 ? "GET" : method;
		if (typeof m === "string" && typeof url === "string" && url.trim() && isSafeHttpMethod(m)) return {
			type: "http",
			method: m.trim().toUpperCase(),
			url: url.trim()
		};
	}
	return null;
}
const BATCHER_KEYS = [
	"enabled",
	"windowMs",
	"canonicalOrder",
	"collapseIdempotentRepeats",
	"cacheTtlMs",
	"padding",
	"tools"
];
/** Bounds of `windowMs`: a shorter window collapses and reorders less. */
const WINDOW_MS_RANGE = {
	min: 250,
	max: 1e4
};
/** Bounds of `cacheTtlMs`: 0 (cross-window answering off) is refused. */
const CACHE_TTL_MS_RANGE = {
	min: 1,
	max: 6e5
};
/**
* Resolve raw (plugin) config into batcher options, fail-closed: an unknown
* key, a wrong type, an out-of-range value, or a value that would weaken the
* batcher below its shipped guarantees throws, so the plugin config is
* refused instead of running a weaker batcher. Accepted only:
*   - `windowMs` in [250, 10000] (default 250);
*   - `canonicalOrder` / `collapseIdempotentRepeats`: true (cannot be turned off);
*   - `cacheTtlMs` in [1, 600000] (cross-window answering cannot be turned off);
*   - `padding.allowedSet`: valid entries only (none dropped), non-empty when
*     `padding.enabled` is true;
*   - `tools`: the defaults plus any additions (none can be removed).
*/
function resolveActionBatcherOptions(raw) {
	const r = createPluginConfigReader("egress-action-batcher", raw ?? {}, BATCHER_KEYS);
	const d = DEFAULT_ACTION_BATCHER_OPTIONS;
	r.bool("enabled", true);
	const windowMs = r.number("windowMs", d.windowMs, {
		integer: true,
		...WINDOW_MS_RANGE
	});
	for (const key of ["canonicalOrder", "collapseIdempotentRepeats"]) if (!r.bool(key, true)) r.fail(`${key} cannot be turned off: it is part of the egress guarantees`);
	const cacheTtlMs = r.number("cacheTtlMs", d.cacheTtlMs, {
		integer: true,
		...CACHE_TTL_MS_RANGE
	});
	const padEnabled = r.section("padding", ["enabled", "allowedSet"]).bool("enabled", false);
	const rawSet = raw?.padding?.allowedSet;
	if (rawSet !== void 0 && !Array.isArray(rawSet)) r.fail("padding.allowedSet must be a list");
	const allowedSet = [];
	for (const [i, entry] of (rawSet ?? []).entries()) {
		const action = paddingAction(entry);
		if (!action) return r.fail(`padding.allowedSet[${i}] must be a URL or { method, url } with method GET, HEAD or OPTIONS`);
		allowedSet.push(action);
	}
	if (padEnabled && allowedSet.length === 0) r.fail("padding.enabled requires a non-empty padding.allowedSet");
	const tools = r.stringList("tools", d.tools);
	const missing = d.tools.filter((t) => !tools.includes(t));
	if (missing.length > 0) r.fail(`tools may only add to the defaults; missing: ${missing.join(", ")}`);
	return {
		windowMs,
		canonicalOrder: true,
		collapseIdempotentRepeats: true,
		cacheTtlMs,
		padding: {
			enabled: padEnabled,
			allowedSet
		},
		tools
	};
}
/** Tool whose request client carries padding (its calls are plain GETs). */
const PADDING_TOOL = "web_fetch";
const MAX_WINDOW_ENTRIES = 256;
const MAX_LEADERS = 4096;
/** Live scopes with repeat state; the least recently used beyond this is retired. */
const MAX_SCOPES = 1024;
/** Retired scope ids remembered (they refuse cacheable actions). */
const MAX_RETIRED_SCOPES = 65536;
/** Distinct cacheable requests tracked per scope; beyond this new ones are refused. */
const MAX_KEYS_PER_SCOPE = 65536;
/** Recorded outcome bytes kept per scope; older records beyond it are dropped (key kept). */
const MAX_SCOPE_BYTES = 64 * 1024 * 1024;
/** Recorded outcome bytes kept per process. */
const MAX_TOTAL_BYTES = 256 * 1024 * 1024;
/** Spilled outcome bytes kept on disk per scope, and per process. */
const MAX_SCOPE_SPILL_BYTES = 1024 * 1024 * 1024;
const MAX_TOTAL_SPILL_BYTES = 4 * 1024 * 1024 * 1024;
/** Longest a padded window holds for the capacity ledger before refusing. */
const MAX_BUDGET_HOLD_MS = 1e4;
/**
* A scope is refreshed for at most this long after its first record (its run
* normally ends, and is dropped, far sooner); a bound on background load if
* a run's end is never reported.
*/
const MAX_REFRESH_LIFETIME_MS = 24 * 36e5;
const MAX_EXPIRED_GATES = 1024;
/** log2 of the binomial coefficient C(n, k). */
function log2Binomial(n, k) {
	if (k < 0 || k > n) return 0;
	let bits = 0;
	for (let i = 1; i <= k; i++) bits += Math.log2(n - k + i) - Math.log2(i);
	return bits;
}
/**
* Upper bound on the identity information of one request outside the padding
* set: 9 bits per byte of its wire form (a prefix-free code for any byte
* string) plus one continuation bit.
*/
function outsideSetBits(action) {
	if (action.type !== "http") return 0;
	const wire = `${action.method.trim().toUpperCase()} ${wireRequestUrl(action.url)}`;
	const body = action.body ?? "";
	return 9 * (Buffer.byteLength(wire) + Buffer.byteLength(body)) + 1;
}
/** Approximate retained size of a recorded outcome, in bytes. */
function estimateBytes(value) {
	let total = 0;
	let nodes = 0;
	const seen = /* @__PURE__ */ new Set();
	const walk = (v, depth) => {
		if (nodes++ > 2e5 || depth > 32) return;
		if (typeof v === "string") total += v.length * 2;
		else if (typeof v === "number" || typeof v === "boolean") total += 8;
		else if (v instanceof Uint8Array || v instanceof ArrayBuffer) total += v.byteLength;
		else if (v && typeof v === "object") {
			if (seen.has(v)) return;
			seen.add(v);
			for (const [k, child] of Object.entries(v)) {
				total += k.length * 2;
				walk(child, depth + 1);
			}
		}
	};
	walk(value, 0);
	return total + 64;
}
const URL_IN_TEXT = /https?:\/\/[^\s"'<>`\\]+/gi;
const MAX_NAMED_ORIGINS = 64;
function stringLeaves(value, out, depth = 0) {
	if (typeof value === "string") out.push(value);
	else if (value && typeof value === "object" && depth < 16) for (const v of Array.isArray(value) ? value : Object.values(value)) stringLeaves(v, out, depth + 1);
	return out;
}
/**
* Origins whose recorded reads an action may change, so must re-open:
*   - an HTTP request with an unsafe method: its own origin;
*   - a side-effecting action whose target the batcher cannot see (a send,
*     or a tool that is not read-only, such as a browser or a network shell
*     command): every HTTP origin its parameters name;
*   - a read, or a local file write: none (it cannot change a remote origin).
*/
/** Refusal text for a tool call that has no declared observation. */
function unmappedToolReason(toolName) {
	return `${toolName} has no declared mapping from its call to the request it sends, so the choice monitor cannot key it on what leaves the host; refused rather than batched on its parameters`;
}
function writtenOrigins(action, idem) {
	if (action.type === "http") {
		if (idem === "cacheable") return [];
		const origins = [action, ...action.also ?? []].filter((r) => !isSafeHttpMethod(r.method)).map((r) => httpOrigin(r.url)).filter((o) => o !== null);
		return [...new Set(origins)];
	}
	if (action.type === "file-write" || idem === "cacheable") return [];
	const texts = action.type === "send" ? [action.target, action.content] : stringLeaves(action.params, []);
	const origins = /* @__PURE__ */ new Set();
	for (const text of texts) for (const match of text.slice(0, 65536).match(URL_IN_TEXT) ?? []) {
		const origin = httpOrigin(match);
		if (origin) origins.add(origin);
		if (origins.size >= MAX_NAMED_ORIGINS) return [...origins];
	}
	return [...origins];
}
/** Resource a side-effecting action touches, for window-only conflicts (M4). */
/**
* Resource a side-effecting action touches, for the window-only conflict
* check (hypothesis (C), M4). Approximated conservatively: two actions that
* may touch the same resource are treated as touching it.
*   - HTTP: one resource for every request, so any two different
*     side-effecting requests in a window (PUT /a?x=1, DELETE /b, POST to
*     another origin) do not commute and none of them collapses.
*   - File write: the file's filesystem identity when it exists (a hard or
*     symbolic link is the same file), else its resolved path.
*/
/**
* True when structured serialization reproduces `value` exactly: plain
* objects, arrays, primitives, binary data, dates, maps and sets. Anything
* else (an Error, whose class and own properties a round trip loses, or a
* class instance) stays out of the spill files, so a repeat answered from a
* spill file gets exactly what the call returned.
*/
function cloneable(value, depth = 0, seen = /* @__PURE__ */ new Set()) {
	if (value === null || typeof value !== "object") return typeof value !== "function" && typeof value !== "symbol";
	if (depth > 64 || seen.has(value)) return depth <= 64;
	seen.add(value);
	if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer || value instanceof Date) return true;
	const proto = Object.getPrototypeOf(value);
	if (value instanceof Map) return [...value].every(([k, v]) => cloneable(k, depth + 1, seen) && cloneable(v, depth + 1, seen));
	if (value instanceof Set) return [...value].every((v) => cloneable(v, depth + 1, seen));
	if (proto !== Object.prototype && proto !== Array.prototype && proto !== null) return false;
	if (Object.getOwnPropertySymbols(value).length > 0) return false;
	return Object.values(value).every((v) => cloneable(v, depth + 1, seen));
}
function resourceOf(action) {
	if (action.type === "http") return "http";
	if (action.type === "file-write") return action.identity === void 0 ? `file ${action.path}` : `inode ${action.identity}`;
	return null;
}
function createActionBatcher(options = DEFAULT_ACTION_BATCHER_OPTIONS, deps = {}) {
	const now = deps.now ?? monotonicNow;
	const setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
	const clearTimer = deps.clearTimer ?? ((h) => clearTimeout(h));
	const sleep = deps.sleep ?? ((ms) => new Promise((resolve) => {
		setTimeout(resolve, ms).unref?.();
	}));
	const paddingClient = deps.paddingClient ?? (() => getToolRequestClient("web_fetch"));
	const issuedTimeoutMs = Math.max(0, deps.issuedTimeoutMs ?? 5e3);
	const audit = deps.audit ?? (() => {});
	const tuning = {
		...REFRESH_DEFAULTS,
		...deps.refresh
	};
	const scopeSeed = deps.scopeSeed ?? ((scope) => deriveScopeSeed(scope));
	const windowMs = Math.max(1, options.windowMs);
	const crossWindow = options.collapseIdempotentRepeats && options.cacheTtlMs > 0;
	const padding = options.padding.enabled ? options.padding.allowedSet.filter((a) => a.type === "http" && isSafeHttpMethod(a.method)).map((action) => ({
		action,
		key: actionKey(action)
	})) : [];
	const paddingKeys = new Set(padding.map((p) => p.key));
	const windows = /* @__PURE__ */ new Map();
	const leaders = /* @__PURE__ */ new Map();
	const leaderResponses = /* @__PURE__ */ new Map();
	const scopes = /* @__PURE__ */ new Map();
	const retired = /* @__PURE__ */ new Set();
	let totalBytes = 0;
	const writes = /* @__PURE__ */ new Map();
	const gatesById = /* @__PURE__ */ new Map();
	const gatesByKey = /* @__PURE__ */ new Map();
	const expiredGates = /* @__PURE__ */ new Map();
	const held = /* @__PURE__ */ new Map();
	let disposed = false;
	const auditSeen = /* @__PURE__ */ new Map();
	const finding = (scope, code, message, severity = "info", extra = {}) => audit(scope, {
		stageId: ACTION_BATCHER_STAGE_ID,
		severity,
		code,
		message,
		...extra
	});
	const scopeState = (scope, create) => {
		const existing = scopes.get(scope);
		if (existing) {
			scopes.delete(scope);
			scopes.set(scope, existing);
			return existing;
		}
		if (!create || retired.has(scope)) return null;
		const st = {
			recs: /* @__PURE__ */ new Map(),
			bytes: 0,
			spillBytes: 0,
			startedAt: now(),
			cursor: null,
			timer: null,
			scheduled: false
		};
		scopes.set(scope, st);
		while (scopes.size > MAX_SCOPES) {
			const oldest = scopes.keys().next().value;
			if (oldest === void 0 || oldest === scope) break;
			const gone = scopes.get(oldest);
			totalBytes -= gone?.bytes ?? 0;
			stopRefresh(gone);
			if (gone) releaseScopeState(gone, "repeat state for this run was dropped (too many concurrent runs)");
			scopes.delete(oldest);
			retired.add(oldest);
			if (retired.size > MAX_RETIRED_SCOPES) {
				const first = retired.values().next().value;
				if (first !== void 0) retired.delete(first);
			}
		}
		return st;
	};
	const dropRecord = (st, key, rec) => {
		if (rec.state === "done") {
			st.bytes -= rec.bytes;
			totalBytes -= rec.bytes;
		}
		if (rec.state === "spilled") removeSpill(st, rec);
		const refresh = rec.state === "pending" ? void 0 : rec.refresh;
		st.recs.set(key, {
			state: "evicted",
			origin: rec.origin,
			...refresh ? { refresh } : {}
		});
	};
	let spillRoot = deps.spillDir === null ? null : void 0;
	let spillSeq = 0;
	let totalSpillBytes = 0;
	const spillDirectory = () => {
		if (spillRoot === void 0) try {
			spillRoot = deps.spillDir ? (fs.mkdirSync(deps.spillDir, {
				recursive: true,
				mode: 448
			}), deps.spillDir) : fs.mkdtempSync(path.join(os.tmpdir(), "enclawed-batcher-"));
		} catch {
			spillRoot = null;
		}
		return spillRoot;
	};
	const removeSpill = (st, rec) => {
		st.spillBytes -= rec.diskBytes;
		totalSpillBytes -= rec.diskBytes;
		try {
			fs.rmSync(rec.file, { force: true });
		} catch {}
	};
	/** Move a finished outcome out of memory; null when it cannot be spilled. */
	const spill = (st, rec) => {
		const dir = spillDirectory();
		if (!dir) return null;
		if (!cloneable(rec.response)) return null;
		let data;
		try {
			data = v8.serialize(rec.response);
		} catch {
			return null;
		}
		if (st.spillBytes + data.length > MAX_SCOPE_SPILL_BYTES || totalSpillBytes + data.length > MAX_TOTAL_SPILL_BYTES) return null;
		const file = path.join(dir, `${++spillSeq}.bin`);
		try {
			fs.writeFileSync(file, data, { mode: 384 });
		} catch {
			return null;
		}
		st.spillBytes += data.length;
		totalSpillBytes += data.length;
		return {
			state: "spilled",
			ok: rec.ok,
			file,
			diskBytes: data.length,
			origin: rec.origin,
			...rec.refresh ? { refresh: rec.refresh } : {}
		};
	};
	/** Read a spilled outcome back; null when it is gone or unreadable. */
	const readSpill = (rec) => {
		try {
			return {
				ok: rec.ok,
				response: v8.deserialize(fs.readFileSync(rec.file))
			};
		} catch {
			return null;
		}
	};
	/** Answer every repeat waiting on a record with `release`. */
	const settleWaiters = (rec, release) => {
		if (rec?.state !== "evicted" || !rec.waiters) return;
		const waiters = rec.waiters;
		rec.waiters = void 0;
		for (const w of waiters) Promise.resolve(release(w)).then(w.resolve);
	};
	/** A scope's state is going away: remove its spill files, refuse its waiters. */
	function releaseScopeState(st, reason) {
		for (const rec of st.recs.values()) {
			if (rec.state === "spilled") removeSpill(st, rec);
			settleWaiters(rec, (w) => ({
				outcome: "blocked",
				key: w.key,
				reason
			}));
		}
	}
	/** Move the oldest finished in-memory record out of memory; false when there is none. */
	const evictOldest = (st) => {
		for (const [key, rec] of st.recs) if (rec.state === "done") {
			st.bytes -= rec.bytes;
			totalBytes -= rec.bytes;
			const spilled = spill(st, rec);
			if (spilled) st.recs.set(key, spilled);
			else st.recs.set(key, {
				state: "evicted",
				origin: rec.origin,
				...rec.refresh ? { refresh: rec.refresh } : {}
			});
			return true;
		}
		return false;
	};
	const enforceBudgets = (st) => {
		while (st.bytes > MAX_SCOPE_BYTES && evictOldest(st));
		const overBudget = () => totalBytes > MAX_TOTAL_BYTES;
		while (overBudget()) {
			let dropped = false;
			for (const other of scopes.values()) if (evictOldest(other)) {
				dropped = true;
				break;
			}
			if (!dropped) break;
		}
	};
	const recordOutcome = (leaderId, leader, outcome, bytes, refresh) => {
		const st = scopes.get(leader.scope);
		const rec = st?.recs.get(leader.key);
		if (!st || !rec || rec.state !== "pending" || rec.leaderId !== leaderId) return;
		const size = Math.max(0, Math.round(bytes));
		st.recs.delete(leader.key);
		st.recs.set(leader.key, {
			state: "done",
			ok: outcome.ok,
			response: outcome.response,
			bytes: size,
			origin: rec.origin,
			...refresh ? { refresh } : {}
		});
		st.bytes += size;
		totalBytes += size;
		if (refresh) scheduleRefresh(leader.scope, st);
		enforceBudgets(st);
	};
	/** Re-open every request to `origin` in `scope` (a write may have changed it). */
	const invalidateOrigin = (scope, origin) => {
		const st = scopes.get(scope);
		if (!st) return;
		for (const [key, rec] of st.recs) if (rec.origin === origin) {
			if (rec.state === "done") {
				st.bytes -= rec.bytes;
				totalBytes -= rec.bytes;
			}
			if (rec.state === "spilled") removeSpill(st, rec);
			st.recs.delete(key);
			settleWaiters(rec, (w) => submit(w.sub));
		}
	};
	const trackLeader = (entry, scope) => {
		let settle = () => {};
		const response = new Promise((resolve) => {
			settle = resolve;
		});
		leaders.set(entry.sub.id, {
			scope,
			key: entry.key,
			idem: entry.idem,
			settle
		});
		leaderResponses.set(entry.sub.id, response);
		if (crossWindow && entry.idem === "cacheable") {
			const st = scopeState(scope, true);
			st?.recs.delete(entry.key);
			st?.recs.set(entry.key, {
				state: "pending",
				leaderId: entry.sub.id,
				origin: entry.sub.action.type === "http" ? httpOrigin(entry.sub.action.url) : null
			});
		}
		if (leaders.size > MAX_LEADERS) {
			const oldest = leaders.keys().next().value;
			if (oldest !== void 0) {
				const gone = leaders.get(oldest);
				leaders.delete(oldest);
				leaderResponses.delete(oldest);
				gone?.settle(void 0);
				const st = gone ? scopes.get(gone.scope) : void 0;
				const rec = gone ? st?.recs.get(gone.key) : void 0;
				if (st && gone && rec?.state === "pending" && rec.leaderId === oldest) dropRecord(st, gone.key, rec);
			}
		}
	};
	/** A tracked leader will never execute: forget it as if it had never been sent. */
	const abandonLeader = (id) => {
		const leader = leaders.get(id);
		if (!leader) return;
		leaders.delete(id);
		leaderResponses.delete(id);
		const rec = scopes.get(leader.scope)?.recs.get(leader.key);
		if (rec?.state === "pending" && rec.leaderId === id) scopes.get(leader.scope)?.recs.delete(leader.key);
		leader.settle(void 0);
	};
	const settleWrite = (id) => {
		const write = writes.get(id);
		if (write) {
			writes.delete(id);
			for (const origin of write.origins) invalidateOrigin(write.scope, origin);
		}
	};
	const nextRoundDelay = (st) => {
		const base = tuning.intervalMs;
		const r = tuning.jitter;
		const lo = Math.max(1, Math.round(base * (1 - r)));
		const hi = Math.max(lo, Math.round(base * (1 + r)));
		return (deps.randomInt ?? st.rng)(lo, hi + 1);
	};
	function stopRefresh(st) {
		if (st?.scheduled) {
			clearTimer(st.timer);
			st.timer = null;
			st.scheduled = false;
		}
	}
	/** In the refresh rotation: every recorded key with a refresh function, in memory or not. */
	const inRotation = (rec) => rec.state !== "pending" && rec.refresh !== void 0;
	const hasLive = (st) => {
		for (const rec of st.recs.values()) if (inRotation(rec)) return true;
		return false;
	};
	function scheduleRefresh(scope, st) {
		if (st.scheduled || disposed) return;
		st.scheduled = true;
		if (!deps.randomInt && !st.rng) {
			scopeSeed(scope).catch(() => randomBytes(32)).then((seed) => {
				st.rng = createSeededRandomInt(seed);
				st.scheduled = false;
				if (scopes.get(scope) === st) scheduleRefresh(scope, st);
			});
			return;
		}
		const handle = setTimer(() => {
			st.timer = null;
			st.scheduled = false;
			if (scopes.get(scope) !== st) return;
			refreshScope(scope, st).finally(() => {
				if (scopes.get(scope) !== st) return;
				if (now() - st.startedAt >= MAX_REFRESH_LIFETIME_MS) for (const rec of st.recs.values()) settleWaiters(rec, (w) => ({
					outcome: "blocked",
					key: w.key,
					reason: "its outcome was dropped and the run's refresh lifetime is over; refused rather than re-sent"
				}));
				else if (hasLive(st)) scheduleRefresh(scope, st);
			});
		}, nextRoundDelay(st));
		handle?.unref?.();
		st.timer = handle;
	}
	/** Replace a record with a refreshed outcome, if it is still the one refreshed. */
	const applyRefresh = (st, key, rec, out) => {
		if (st.recs.get(key) !== rec) return;
		if (rec.state === "done") {
			st.bytes -= rec.bytes;
			totalBytes -= rec.bytes;
		} else if (rec.state === "spilled") removeSpill(st, rec);
		const size = estimateBytes(out.response);
		st.recs.delete(key);
		st.recs.set(key, {
			state: "done",
			ok: out.ok,
			response: out.response,
			bytes: size,
			origin: rec.origin,
			...rec.refresh ? { refresh: rec.refresh } : {}
		});
		st.bytes += size;
		totalBytes += size;
		settleWaiters(rec, (w) => ({
			outcome: "cached",
			key: w.key,
			ok: out.ok,
			response: out.response
		}));
		enforceBudgets(st);
	};
	/** One refresh round for one scope. */
	async function refreshScope(scope, st) {
		if (now() - st.startedAt > MAX_REFRESH_LIFETIME_MS) return;
		const live = [...st.recs].filter(([, rec]) => inRotation(rec)).map(([key]) => key).toSorted();
		if (live.length === 0) return;
		const client = padding.length > 0 ? paddingClient() : null;
		if (padding.length > 0 && !client) {
			finding(scope, "refresh-undeliverable", "no request client: padded refresh skipped", "high");
			return;
		}
		const k = Math.min(tuning.perInterval, live.length);
		const startAt = st.cursor === null ? 0 : live.findIndex((key) => key > st.cursor);
		const first = startAt < 0 ? 0 : startAt;
		const picked = Array.from({ length: k }, (_, i) => live[(first + i) % live.length]);
		st.cursor = picked[picked.length - 1] ?? null;
		const pickedSet = new Set(picked);
		const jobs = picked.map((key) => ({
			key,
			run: () => {
				const rec = st.recs.get(key);
				if (!rec || !inRotation(rec) || !rec.refresh || rec.refreshing) return;
				rec.refreshing = true;
				const halted = (why) => {
					rec.refreshing = false;
					settleWaiters(rec, (w) => ({
						outcome: "blocked",
						key: w.key,
						reason: `its outcome was dropped and its scheduled re-issue ${why}`
					}));
				};
				rec.refresh().then((out) => {
					rec.refreshing = false;
					if (out) applyRefresh(st, key, rec, out);
					else halted("was halted by the host's gates");
				}).catch(() => halted("failed"));
			}
		}));
		if (client) {
			for (const p of padding) if (!pickedSet.has(p.key)) {
				const url = p.action.url;
				jobs.push({
					key: p.key,
					run: () => void client.send(url).catch(() => {})
				});
			}
		}
		jobs.sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
		finding(scope, "refresh-round", `refresh round: ${picked.length} refreshed, ${jobs.length - picked.length} padded`);
		for (const job of jobs) {
			job.run();
			await yieldTurn();
		}
	}
	const createGate = (id, key, scope) => {
		let markArrived = () => {};
		let open = () => {};
		const gate = {
			id,
			key,
			scope,
			state: "waiting",
			arrived: new Promise((resolve) => {
				markArrived = resolve;
			}),
			markArrived: (value) => {
				if (gate.state === "waiting") gate.state = value ? "arrived" : "absent";
				markArrived(value);
			},
			opened: new Promise((resolve) => {
				open = resolve;
			}),
			open: () => {
				gate.state = "opened";
				open();
			},
			expire: () => {
				gate.state = "expired";
				markArrived(false);
			}
		};
		gatesById.set(id, gate);
		const list = gatesByKey.get(key) ?? [];
		list.push(gate);
		gatesByKey.set(key, list);
		return gate;
	};
	const dropGate = (gate) => {
		if (gatesById.get(gate.id) === gate) gatesById.delete(gate.id);
		const list = gatesByKey.get(gate.key);
		const index = list?.indexOf(gate) ?? -1;
		if (list && index >= 0) {
			list.splice(index, 1);
			if (list.length === 0) gatesByKey.delete(gate.key);
		}
		if (gate.state === "expired") {
			expiredGates.set(gate.id, gate);
			if (expiredGates.size > MAX_EXPIRED_GATES) {
				const oldest = expiredGates.keys().next().value;
				if (oldest !== void 0) expiredGates.delete(oldest);
			}
		}
	};
	const unsubscribeIssued = onToolRequestIssued((_tool, url, callId) => {
		const key = actionKey({
			type: "http",
			method: "GET",
			url
		});
		let gate = callId !== void 0 ? gatesById.get(callId) : void 0;
		if (gate && gate.key !== key) gate = void 0;
		gate ??= gatesByKey.get(key)?.find((g) => g.state === "waiting");
		if (!gate || gate.state === "expired") {
			const late = gate ?? (callId !== void 0 ? expiredGates.get(callId) : void 0);
			return late && late.key === key ? holdForNextWindow(late) : void 0;
		}
		if (gate.state !== "waiting") return;
		gate.markArrived(true);
		return gate.opened;
	});
	/**
	* A real GET that reached its slot after the slot expired. Never an error
	* for the honest call: without padding it leaves now; under padding (where
	* a substitute already filled its old slot) it is held for its key's slot
	* in the scope's next window, which it fills instead of that key's dummy,
	* so every padded window still shows each member exactly once.
	*/
	const holdForNextWindow = (gate) => {
		if (padding.length === 0) return;
		expiredGates.delete(gate.id);
		return new Promise((resolve) => {
			const list = held.get(gate.scope) ?? [];
			list.push({
				key: gate.key,
				open: resolve
			});
			held.set(gate.scope, list);
			if (!windows.has(gate.scope)) openWindow(gate.scope);
		});
	};
	/** Resolves true when the gate's tool reached its slot, false if it never will. */
	const awaitArrival = (gate) => new Promise((resolve) => {
		const timer = setTimeout(() => resolve(false), issuedTimeoutMs);
		timer.unref?.();
		gate.arrived.then((value) => {
			clearTimeout(timer);
			resolve(value);
		});
	});
	const yieldTurn = () => new Promise((resolve) => setImmediate(resolve));
	function flushScope(scope) {
		const win = windows.get(scope);
		if (!win) return;
		windows.delete(scope);
		clearTimer(win.timer);
		const entries = win.entries;
		const collapse = options.collapseIdempotentRepeats;
		const writesByResource = /* @__PURE__ */ new Map();
		for (const entry of entries) {
			if (entry.idem === "cacheable") continue;
			const resource = resourceOf(entry.sub.action);
			if (resource) {
				const keys = writesByResource.get(resource) ?? /* @__PURE__ */ new Set();
				keys.add(entry.key);
				writesByResource.set(resource, keys);
			}
		}
		const conflicted = (entry) => {
			const resource = resourceOf(entry.sub.action);
			return resource !== null && (writesByResource.get(resource)?.size ?? 0) > 1;
		};
		const heldHere = held.get(scope) ?? [];
		held.delete(scope);
		const independent = [];
		const barriers = [];
		const windowLeaders = /* @__PURE__ */ new Map();
		const followers = [];
		for (const entry of entries) {
			if (entry.dependent) {
				barriers.push(entry);
				continue;
			}
			if (collapse && (entry.idem === "cacheable" || entry.idem === "window-only" && !conflicted(entry))) {
				const leader = windowLeaders.get(entry.key);
				if (leader) {
					followers.push({
						entry,
						leader
					});
					continue;
				}
				windowLeaders.set(entry.key, entry);
			}
			independent.push(entry);
		}
		for (const entry of [...independent, ...barriers]) if (entry.idem !== "never") trackLeader(entry, scope);
		for (const { entry, leader } of followers) entry.resolve({
			outcome: "collapsed",
			key: entry.key,
			leaderId: leader.sub.id,
			response: leaderResponses.get(leader.sub.id) ?? Promise.resolve(void 0)
		});
		const blocked = /* @__PURE__ */ new Map();
		const block = (entry, reason) => {
			blocked.set(entry, reason);
		};
		const designationBits = log2Binomial(entries.length, barriers.length);
		barriers.forEach((entry, i) => {
			const bits = Math.log2(i + 1) + (i === 0 ? designationBits : 0);
			const ledger = entry.sub.ledger;
			if (bits > 0 && ledger && (entry.sub.mode ?? "enforce") === "enforce" && !ledger.tryConsume(bits)) {
				block(entry, "capacity ledger exhausted");
				finding(scope, "dependent-over-budget", "capacity ledger exhausted", "high", { estimatedBits: bits });
				return;
			}
			ledger?.observe(bits);
			finding(scope, "ordering-barrier", "ordering dependency released after the window", "info", { estimatedBits: bits });
		});
		const padded = padding.length > 0;
		const gatedUrl = (entry) => outboundGetUrl(entry.sub.action);
		const buildPlan = () => {
			const ordered = [...independent.map((entry) => ({
				kind: "real",
				entry
			})), ...heldHere.map((h) => ({
				kind: "held",
				key: h.key,
				open: h.open
			}))].map((item, index) => ({
				item,
				index
			}));
			if (padded) {
				const present = new Set([...[...independent, ...barriers].filter((e) => !blocked.has(e)).map((e) => e.key), ...heldHere.map((h) => h.key)]);
				for (const p of padding) if (!present.has(p.key)) ordered.push({
					item: {
						kind: "pad",
						action: p.action,
						key: p.key
					},
					index: ordered.length
				});
			}
			if (options.canonicalOrder || padded) {
				const itemKey = (item) => item.kind === "real" ? item.entry.key : item.key;
				ordered.sort((a, b) => {
					const ka = itemKey(a.item);
					const kb = itemKey(b.item);
					return ka < kb ? -1 : ka > kb ? 1 : a.index - b.index;
				});
			}
			return [...ordered.map((x) => x.item), ...barriers.map((entry) => ({
				kind: "real",
				entry
			}))];
		};
		const releaseEntry = (entry, position, windowSize) => {
			const reason = blocked.get(entry);
			if (reason !== void 0) {
				if (entry.idem !== "never") abandonLeader(entry.sub.id);
				entry.resolve({
					outcome: "blocked",
					key: entry.key,
					reason
				});
				return;
			}
			const origins = writtenOrigins(entry.sub.action, entry.idem);
			if (origins.length > 0) {
				writes.set(entry.sub.id, {
					scope,
					origins
				});
				if (writes.size > MAX_LEADERS) {
					const oldest = writes.keys().next().value;
					if (oldest !== void 0) settleWrite(oldest);
				}
			}
			entry.resolve({
				outcome: "execute",
				key: entry.key,
				position,
				windowSize,
				tracked: entry.idem !== "never"
			});
		};
		const summary = (plan) => {
			const realCount = plan.filter((p) => p.kind === "real" && !blocked.has(p.entry)).length;
			const padCount = plan.filter((p) => p.kind === "pad").length;
			finding(scope, "action-window", `window of ${entries.length}: ${realCount} released, ${followers.length} collapsed, ${padCount} padded`, "info", { detail: {
				actions: entries.length,
				released: realCount,
				collapsed: followers.length,
				padded: padCount
			} });
		};
		const gatedCount = independent.filter((e) => gatedUrl(e) !== null).length;
		if (!padded && gatedCount < 2) {
			const plan = buildPlan();
			plan.forEach((item, position) => {
				if (item.kind === "real") releaseEntry(item.entry, position, plan.length);
			});
			summary(plan);
			return;
		}
		(async () => {
			const client = padded ? paddingClient() : null;
			if (padded && !client) {
				const reason = `no request client for ${PADDING_TOOL}: padding cannot be delivered`;
				finding(scope, "padding-undeliverable", reason, "high");
				for (const entry of [...independent, ...barriers]) {
					block(entry, reason);
					releaseEntry(entry, 0, 0);
				}
				return;
			}
			if (padded) {
				const outside = independent.filter((e) => e.sub.action.type === "http" && !paddingKeys.has(e.key)).toSorted((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
				const deadline = now() + MAX_BUDGET_HOLD_MS;
				let refusing = false;
				for (const entry of outside) {
					const bits = outsideSetBits(entry.sub.action);
					const ledger = entry.sub.ledger;
					if (!refusing && ledger) {
						let paid = ledger.tryConsume(bits);
						for (let i = 0; !paid && now() < deadline && i < 1e3; i++) {
							await sleep(windowMs);
							paid = ledger.tryConsume(bits);
						}
						if (paid) {
							finding(scope, "padding-outside-set", "a request outside the padding set leaks its identity; charged to the capacity ledger", "low", { estimatedBits: bits });
							continue;
						}
					}
					refusing = true;
					block(entry, "request outside the padding set exceeds the capacity budget");
					finding(scope, "padding-outside-set-over-budget", ledger ? "a request outside the padding set could not be paid for by the capacity ledger; refused" : "a request outside the padding set has no capacity ledger to charge; refused", "high", { estimatedBits: bits });
				}
			}
			const plan = buildPlan();
			const gates = /* @__PURE__ */ new Map();
			for (const [position, item] of plan.entries()) if (item.kind === "real" && !blocked.has(item.entry) && gatedUrl(item.entry) !== null) {
				const gate = createGate(item.entry.sub.id, item.entry.key, scope);
				gates.set(item.entry, gate);
				releaseEntry(item.entry, position, plan.length);
			}
			const arrivals = /* @__PURE__ */ new Map();
			await Promise.all([...gates].map(async ([entry, gate]) => {
				arrivals.set(entry, await awaitArrival(gate));
			}));
			const sendPad = (url, code) => {
				client.send(url).catch((err) => {
					finding(scope, code, `a padding request was not sent (${err instanceof Error ? err.message : String(err)})`, "low");
				});
			};
			for (const [position, item] of plan.entries()) {
				if (item.kind === "pad") sendPad(item.action.url, "padding-not-sent");
				else if (item.kind === "held") item.open();
				else {
					const gate = gates.get(item.entry);
					if (!gate) releaseEntry(item.entry, position, plan.length);
					else if (arrivals.get(item.entry)) gate.open();
					else {
						const absent = gate.state === "absent";
						gate.expire();
						const url = gatedUrl(item.entry);
						if (padded && url !== null) {
							finding(scope, "padding-substitute", absent ? "a released GET settled without being sent; sent it as padding" : "a released GET did not reach its slot in time; sent it as padding");
							sendPad(url, "padding-substitute-not-sent");
						}
					}
				}
				await yieldTurn();
			}
			for (const gate of gates.values()) dropGate(gate);
			summary(plan);
		})();
	}
	function openWindow(scope) {
		const t = now();
		const closesAt = padding.length > 0 ? (Math.floor(t / windowMs) + 1) * windowMs : t + windowMs;
		const win = {
			entries: [],
			timer: null
		};
		win.timer = setTimer(() => flushScope(scope), Math.max(0, closesAt - t));
		windows.set(scope, win);
		return win;
	}
	const submit = (sub) => {
		const scope = sub.scope ?? "default";
		const mode = sub.mode ?? "enforce";
		const key = actionKey(sub.action);
		const idem = classifyActionIdempotency(sub.action);
		const dependent = (sub.dependsOn?.length ?? 0) > 0 || sub.afterWindow === true;
		if (mode === "off") return Promise.resolve({
			outcome: "execute",
			key,
			position: 0,
			windowSize: 1,
			tracked: false
		});
		const unmapped = sub.action.type === "tool" ? sub.action.toolName.trim().toLowerCase() : null;
		if (unmapped !== null) {
			finding(scope, "unmapped-tool", `tool ${unmapped} has no declared observation`, mode === "audit" ? "medium" : "high", { detail: { tool: unmapped } });
			if (mode === "enforce") return Promise.resolve({
				outcome: "blocked",
				key,
				reason: unmappedToolReason(unmapped)
			});
		}
		if (mode === "audit") {
			const seenKey = `${scope}|${key}`;
			const last = auditSeen.get(seenKey);
			if (idem !== "never" && last !== void 0) finding(scope, "collapsible-repeat", "idempotent repeat would collapse (audit)", "low", { estimatedBits: 1 });
			auditSeen.set(seenKey, now());
			if (auditSeen.size > MAX_LEADERS) {
				const oldest = auditSeen.keys().next().value;
				if (oldest !== void 0) auditSeen.delete(oldest);
			}
			return Promise.resolve({
				outcome: "execute",
				key,
				position: 0,
				windowSize: 1,
				tracked: false
			});
		}
		if (crossWindow && idem === "cacheable") {
			if (retired.has(scope)) {
				finding(scope, "repeat-state-dropped", "scope state was dropped; refused", "high");
				return Promise.resolve({
					outcome: "blocked",
					key,
					reason: "repeat state for this run was dropped (too many concurrent runs); refused rather than re-sent"
				});
			}
			const st = scopeState(scope, true);
			const rec = st?.recs.get(key);
			if (rec?.state === "done") {
				finding(scope, "cache-hit", "idempotent repeat answered from the recorded outcome");
				return Promise.resolve({
					outcome: "cached",
					key,
					ok: rec.ok,
					response: rec.response
				});
			}
			if (rec?.state === "pending") {
				finding(scope, "collapsed-in-flight", "idempotent repeat collapsed onto the request in flight");
				return Promise.resolve({
					outcome: "collapsed",
					key,
					leaderId: rec.leaderId,
					response: leaderResponses.get(rec.leaderId) ?? Promise.resolve(void 0)
				});
			}
			if (rec?.state === "spilled") {
				const back = readSpill(rec);
				if (back) {
					finding(scope, "cache-hit", "idempotent repeat answered from the spilled outcome");
					return Promise.resolve({
						outcome: "cached",
						key,
						ok: back.ok,
						response: back.response
					});
				}
				dropRecord(st, key, rec);
			}
			const dropped = st?.recs.get(key);
			if (dropped?.state === "evicted") {
				if (dropped.refresh && now() - st.startedAt < MAX_REFRESH_LIFETIME_MS) {
					finding(scope, "repeat-awaits-refresh", "recorded outcome was dropped; the repeat is answered at its next scheduled refresh");
					scheduleRefresh(scope, st);
					return new Promise((resolve) => {
						(dropped.waiters ??= []).push({
							sub,
							key,
							resolve
						});
					});
				}
				finding(scope, "repeat-state-dropped", "recorded outcome was dropped; refused", "high");
				return Promise.resolve({
					outcome: "blocked",
					key,
					reason: "the recorded outcome of this identical earlier request was dropped and cannot be re-issued on the refresh schedule; refused rather than re-sent"
				});
			}
			if (st && st.recs.size >= MAX_KEYS_PER_SCOPE) {
				finding(scope, "repeat-state-full", "repeat tracking for the scope is full; refused", "high");
				return Promise.resolve({
					outcome: "blocked",
					key,
					reason: "repeat tracking for this run is full; refused rather than sent untracked"
				});
			}
		}
		for (const origin of writtenOrigins(sub.action, idem)) invalidateOrigin(scope, origin);
		return new Promise((resolve) => {
			const win = windows.get(scope) ?? openWindow(scope);
			win.entries.push({
				sub,
				key,
				idem,
				dependent,
				resolve
			});
			if (win.entries.length >= MAX_WINDOW_ENTRIES) flushScope(scope);
		});
	};
	const settleLeader = (id, outcome, bytes, refresh) => {
		const leader = leaders.get(id);
		if (!leader) return;
		leaders.delete(id);
		leaderResponses.delete(id);
		leader.settle(outcome);
		if (leader.idem === "cacheable" && crossWindow) recordOutcome(id, leader, outcome, bytes ?? estimateBytes(outcome.response), refresh);
	};
	const markSettled = (id) => {
		const gate = gatesById.get(id);
		if (gate && gate.state === "waiting") gate.markArrived(false);
	};
	return {
		options,
		submit,
		complete(id, response, bytes, refresh) {
			markSettled(id);
			settleLeader(id, {
				ok: true,
				response
			}, bytes, refresh);
			settleWrite(id);
		},
		fail(id, error, bytes, refresh) {
			markSettled(id);
			settleLeader(id, {
				ok: false,
				response: error
			}, bytes, refresh);
			settleWrite(id);
		},
		endScope(scope) {
			const st = scopes.get(scope);
			if (st) {
				stopRefresh(st);
				releaseScopeState(st, "the run ended");
				totalBytes -= st.bytes;
				scopes.delete(scope);
			}
		},
		async refreshTick() {
			for (const scope of [...scopes.keys()].toSorted()) {
				const st = scopes.get(scope);
				if (st) await refreshScope(scope, st);
			}
		},
		noteUnbatched(sub) {
			const scope = sub.scope ?? "default";
			const origins = writtenOrigins(sub.action, "never");
			for (const origin of origins) invalidateOrigin(scope, origin);
			if (origins.length > 0) {
				writes.set(sub.id, {
					scope,
					origins
				});
				if (writes.size > MAX_LEADERS) {
					const oldest = writes.keys().next().value;
					if (oldest !== void 0) settleWrite(oldest);
				}
			}
		},
		abandon(id) {
			markSettled(id);
			abandonLeader(id);
			writes.delete(id);
		},
		flush(scope) {
			if (scope !== void 0) {
				flushScope(scope);
				return;
			}
			for (const s of windows.keys()) flushScope(s);
		},
		pending(scope) {
			if (scope !== void 0) return windows.get(scope)?.entries.length ?? 0;
			let n = 0;
			for (const w of windows.values()) n += w.entries.length;
			return n;
		},
		dispose() {
			disposed = true;
			for (const s of windows.keys()) flushScope(s);
			for (const st of scopes.values()) {
				stopRefresh(st);
				releaseScopeState(st, "the batcher was disposed");
			}
			if (spillRoot && !deps.spillDir) try {
				fs.rmSync(spillRoot, {
					recursive: true,
					force: true
				});
			} catch {}
			for (const list of held.values()) for (const h of list) h.open();
			held.clear();
			for (const leader of leaders.values()) leader.settle(void 0);
			leaders.clear();
			leaderResponses.clear();
			scopes.clear();
			retired.clear();
			totalBytes = 0;
			writes.clear();
			auditSeen.clear();
			unsubscribeIssued();
			for (const gate of gatesById.values()) {
				gate.markArrived(false);
				gate.open();
			}
			gatesById.clear();
			gatesByKey.clear();
			expiredGates.clear();
		},
		paddingFault: () => null
	};
}
const BATCHER_KEY = Symbol.for("enclawed.egress-core.action-batcher");
function batcherSlot() {
	const globals = globalThis;
	let slot = globals[BATCHER_KEY];
	if (!slot) {
		slot = { batcher: null };
		globals[BATCHER_KEY] = slot;
	}
	return slot;
}
/** Register the action batcher. Returns an unregister function. */
function registerActionBatcher(batcher) {
	const slot = batcherSlot();
	slot.batcher?.dispose();
	slot.batcher = batcher;
	return () => {
		if (slot.batcher === batcher) {
			batcher.dispose();
			slot.batcher = null;
		}
	};
}
/** The registered action batcher, or null. */
function getActionBatcher() {
	return batcherSlot().batcher;
}
/** Test-only: drop the registered batcher. */
function resetActionBatcher() {
	const slot = batcherSlot();
	slot.batcher?.dispose();
	slot.batcher = null;
}
//#endregion
//#region packages/egress-core/src/index.ts
/** Shannon entropy (bits per symbol) of a string's code-unit distribution. */
function shannonEntropyBits(text) {
	if (text.length === 0) return 0;
	const counts = /* @__PURE__ */ new Map();
	for (const ch of text) counts.set(ch, (counts.get(ch) ?? 0) + 1);
	let entropy = 0;
	for (const count of counts.values()) {
		const p = count / text.length;
		entropy -= p * Math.log2(p);
	}
	return entropy;
}
/** Rough covert-capacity estimate (bits) of a string: entropy × length. */
function estimateCovertBits(text) {
	return shannonEntropyBits(text) * text.length;
}
//#endregion
export { createEgressRunner as $, setToolRequestClient as A, setMediaExemptionCheck as B, httpOrigin as C, outboundGetUrl as D, onToolRequestIssued as E, mediateMediaBatch as F, resetMediaRegistry as G, hashImagePayload as H, canonicalMediaOrder as I, hasOutboundEmitter as J, emitOutbound as K, hasMediaExemptionCheck as L, mapSegments as M, mapSegmentsAsync as N, requestToolIssueSlot as O, createPluginConfigReader as P, setOutboundEmitter as Q, isMediaExempt as R, hasToolCapabilityClassifier as S, notifyToolRequestIssued as T, getMediaScramblers as U, hashAudioPayload as V, registerMediaScrambler as W, resetEgressHostSeams as X, llmComplete as Y, setLlmCompleter as Z, actionKey as _, DEFAULT_BATCHED_TOOLS as a, mergeEgressConfig as at, currentToolReplayCall as b, createActionBatcher as c, createCapacityLedger as ct, resetActionBatcher as d, getEgressStages as dt, runEgressPipeline as et, resolveActionBatcherOptions as f, registerEgressStage as ft, setRefreshEntropySource as g, deriveScopeSeed as h, DEFAULT_ACTION_BATCHER_OPTIONS as i, defaultEgressConfig as it, wireRequestUrl as j, setToolCapabilityClassifier as k, getActionBatcher as l, createLedgerStore as lt, createSeededRandomInt as m, shannonEntropyBits as n, STAGE_IDS as nt, PADDING_TOOL as o, resolveStageMode as ot, unmappedToolReason as p, resetEgressRegistry as pt, hasLlmCompleter as q, ACTION_BATCHER_STAGE_ID as r, STAGE_PRIORITY as rt, REFRESH_DEFAULTS as s, createAuditBuffer as st, estimateCovertBits as t, DEFAULT_STAGE_MODES as tt, registerActionBatcher as u, monotonicNow as ut, canonicalActionEncoding as v, isSafeHttpMethod as w, getToolRequestClient as x, classifyActionIdempotency as y, resetMediaExemption as z };
