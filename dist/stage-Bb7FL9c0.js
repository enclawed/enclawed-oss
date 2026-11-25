import { N as createPluginConfigReader, nt as STAGE_PRIORITY, tt as STAGE_IDS } from "./src-C2b2oXDB.js";
//#region extensions/egress-behavioral-invariants/src/invariants.ts
const defaultBehavioralOptions = {
	windowMs: 6e4,
	maxMessagesPerWindow: 60,
	maxBytesPerWindow: 262144,
	minIntervalMs: 0,
	timingQuantumMs: 0,
	jitterMs: 0,
	releaseCadenceMs: 0,
	periodicityMinSamples: 8,
	periodicityCovThreshold: .08,
	maxSinks: 4096
};
/** Coefficient of variation (stddev / mean) of a sample. */
function coefficientOfVariation(samples) {
	if (samples.length === 0) return Number.POSITIVE_INFINITY;
	const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
	if (mean === 0) return 0;
	const variance = samples.reduce((a, b) => a + (b - mean) ** 2, 0) / samples.length;
	return Math.sqrt(variance) / mean;
}
function createBehavioralMonitor(options, rng = Math.random) {
	const opts = {
		...defaultBehavioralOptions,
		...options
	};
	const sinks = /* @__PURE__ */ new Map();
	let overflow = null;
	function stateFor(sinkId, now) {
		const existing = sinks.get(sinkId);
		if (existing) return existing;
		if (sinks.size >= opts.maxSinks) {
			const cutoff = now - opts.windowMs;
			let evicted = false;
			for (const [id, state] of sinks) if (state.events.every((e) => e.ts < cutoff)) {
				sinks.delete(id);
				evicted = true;
				break;
			}
			if (!evicted) {
				overflow ??= {
					events: [],
					intervals: [],
					lastReleaseTs: null
				};
				return overflow;
			}
		}
		const state = {
			events: [],
			intervals: [],
			lastReleaseTs: null
		};
		sinks.set(sinkId, state);
		return state;
	}
	return {
		evaluate(sinkId, now, contentLength, enforce) {
			const state = stateFor(sinkId, now);
			const findings = [];
			const cutoff = now - opts.windowMs;
			state.events = state.events.filter((e) => e.ts >= cutoff);
			const count = state.events.length;
			const bytes = state.events.reduce((n, e) => n + e.bytes, 0);
			const lastTs = count > 0 ? state.events[count - 1].ts : null;
			const overMessages = count + 1 > opts.maxMessagesPerWindow;
			const overBytes = bytes + contentLength > opts.maxBytesPerWindow;
			if (overMessages || overBytes) {
				findings.push({
					severity: "high",
					code: "rate-limit",
					message: `egress rate/volume invariant exceeded (${count + 1} msgs, ${bytes + contentLength} bytes / ${opts.windowMs}ms window)`
				});
				if (enforce) return {
					decision: {
						action: "cancel",
						reason: "egress rate/volume invariant exceeded"
					},
					findings
				};
				state.events.push({
					ts: now,
					bytes: contentLength
				});
				return {
					decision: {
						action: "cancel",
						reason: "egress rate/volume invariant exceeded"
					},
					findings
				};
			}
			let delayMs = 0;
			if (opts.minIntervalMs > 0 && lastTs !== null) {
				const gap = now - lastTs;
				if (gap < opts.minIntervalMs) delayMs = opts.minIntervalMs - gap;
			}
			if (opts.timingQuantumMs > 0) {
				const target = now + delayMs;
				delayMs = Math.ceil(target / opts.timingQuantumMs) * opts.timingQuantumMs - now;
				if (opts.jitterMs > 0) delayMs += Math.floor(rng() * opts.jitterMs);
			}
			if (opts.releaseCadenceMs > 0) {
				const earliest = now + delayMs;
				const releaseTs = state.lastReleaseTs === null ? earliest : Math.max(earliest, state.lastReleaseTs + opts.releaseCadenceMs);
				delayMs = releaseTs - now;
				state.lastReleaseTs = releaseTs;
			}
			if (lastTs !== null) {
				state.intervals.push(now - lastTs);
				if (state.intervals.length > 64) state.intervals.shift();
			}
			if (state.intervals.length >= opts.periodicityMinSamples) {
				const cov = coefficientOfVariation(state.intervals);
				if (cov < opts.periodicityCovThreshold) findings.push({
					severity: "medium",
					code: "periodic-egress",
					message: `near-constant inter-message interval (CoV ${cov.toFixed(3)}) — possible timing channel`
				});
			}
			state.events.push({
				ts: now,
				bytes: contentLength
			});
			return {
				decision: delayMs > 0 ? {
					action: "delay",
					delayMs
				} : { action: "pass" },
				findings
			};
		},
		reset() {
			sinks.clear();
			overflow = null;
		}
	};
}
//#endregion
//#region extensions/egress-behavioral-invariants/src/config.ts
const DAY_MS = 864e5;
function resolveBehavioralOptions(raw) {
	const r = createPluginConfigReader("egress-behavioral-invariants", raw, [
		"windowMs",
		"maxMessagesPerWindow",
		"maxBytesPerWindow",
		"minIntervalMs",
		"timingQuantumMs",
		"jitterMs",
		"releaseCadenceMs"
	]);
	const d = defaultBehavioralOptions;
	const ms = {
		integer: true,
		min: 0,
		max: DAY_MS
	};
	const opts = {
		...d,
		windowMs: r.number("windowMs", d.windowMs, {
			integer: true,
			min: d.windowMs,
			max: DAY_MS
		}),
		maxMessagesPerWindow: r.number("maxMessagesPerWindow", d.maxMessagesPerWindow, {
			integer: true,
			min: 1,
			max: d.maxMessagesPerWindow
		}),
		maxBytesPerWindow: r.number("maxBytesPerWindow", d.maxBytesPerWindow, {
			integer: true,
			min: 1,
			max: d.maxBytesPerWindow
		}),
		minIntervalMs: r.number("minIntervalMs", d.minIntervalMs, ms),
		timingQuantumMs: r.number("timingQuantumMs", d.timingQuantumMs, ms),
		jitterMs: r.number("jitterMs", d.jitterMs, ms),
		releaseCadenceMs: r.number("releaseCadenceMs", d.releaseCadenceMs, ms)
	};
	if (opts.jitterMs > 0 && opts.timingQuantumMs === 0) r.fail("jitterMs applies only with timingQuantumMs > 0");
	return opts;
}
//#endregion
//#region extensions/egress-behavioral-invariants/src/stage.ts
/**
* Build the behavioral-invariants stage (priority 50, last). It enforces
* stateful rate/volume limits, quantizes send timing, and flags periodic
* egress. Default mode is `audit`; the pipeline suppresses the cancel/delay
* until the deployment escalates the stage to `enforce`.
*/
function buildBehavioralInvariantsStage(options, deps = {}) {
	const monitor = deps.monitor ?? createBehavioralMonitor(options);
	return {
		id: STAGE_IDS.behavioral,
		priority: STAGE_PRIORITY[STAGE_IDS.behavioral],
		kinds: [
			"channel",
			"tool-call",
			"model-input"
		],
		apply(content, ctx) {
			const evaluation = monitor.evaluate(ctx.sink.id, ctx.now(), content.length, ctx.mode === "enforce");
			for (const finding of evaluation.findings) ctx.audit({
				stageId: STAGE_IDS.behavioral,
				...finding
			});
			return evaluation.decision;
		}
	};
}
//#endregion
export { defaultBehavioralOptions as a, createBehavioralMonitor as i, resolveBehavioralOptions as n, coefficientOfVariation as r, buildBehavioralInvariantsStage as t };
