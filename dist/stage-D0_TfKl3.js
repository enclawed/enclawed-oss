import { P as createPluginConfigReader, nt as STAGE_IDS, rt as STAGE_PRIORITY } from "./src-Bv_GP2Sj.js";
import { randomInt } from "node:crypto";
//#region extensions/egress-timing-scrambler/src/timing.ts
const defaultTimingScramblerOptions = {
	minDelayMs: 0,
	maxDelayMs: 750
};
/**
* Draw a uniformly random delay in `[minDelayMs, maxDelayMs]`. By default the
* draw uses the cryptographic RNG so the delay an attacker observes is
* unpredictable and cannot be cancelled out; an explicit `rng` (returning a
* float in [0,1)) can be supplied for deterministic tests.
*/
function randomDelayMs(options, rng) {
	const opts = {
		...defaultTimingScramblerOptions,
		...options
	};
	const lo = Math.max(0, Math.floor(opts.minDelayMs));
	const hi = Math.max(lo, Math.floor(opts.maxDelayMs));
	if (hi === lo) return lo;
	if (rng) return lo + Math.floor(rng() * (hi - lo + 1));
	return randomInt(lo, hi + 1);
}
//#endregion
//#region extensions/egress-timing-scrambler/src/config.ts
const MAX_DELAY_MS = 6e5;
/** The shortest random spread allowed: the shipped default range. */
const MIN_DELAY_SPREAD_MS = defaultTimingScramblerOptions.maxDelayMs - defaultTimingScramblerOptions.minDelayMs;
function resolveTimingScramblerConfig(raw) {
	const r = createPluginConfigReader("egress-timing-scrambler", raw, [
		"enabled",
		"minDelayMs",
		"maxDelayMs"
	]);
	const bounds = {
		integer: true,
		min: 0,
		max: MAX_DELAY_MS
	};
	const minDelayMs = r.number("minDelayMs", defaultTimingScramblerOptions.minDelayMs, bounds);
	const maxDelayMs = r.number("maxDelayMs", defaultTimingScramblerOptions.maxDelayMs, bounds);
	if (minDelayMs > maxDelayMs) r.fail(`minDelayMs (${minDelayMs}) must not exceed maxDelayMs (${maxDelayMs})`);
	if (maxDelayMs - minDelayMs < MIN_DELAY_SPREAD_MS) r.fail(`maxDelayMs - minDelayMs (${maxDelayMs - minDelayMs} ms) must be at least ${MIN_DELAY_SPREAD_MS} ms`);
	return {
		enabled: r.bool("enabled", true),
		options: {
			minDelayMs,
			maxDelayMs
		}
	};
}
//#endregion
//#region extensions/egress-timing-scrambler/src/stage.ts
/**
* Build the timing-scrambler stage (priority 48). It returns a `delay`
* decision with a uniformly random duration, perturbing every send time so
* the inter-message interval carries no attacker-chosen signal. The pipeline
* applies the delay in enforce mode and records it in audit mode.
*/
function buildTimingScramblerStage(options, deps = {}) {
	return {
		id: STAGE_IDS.timingScrambler,
		priority: STAGE_PRIORITY[STAGE_IDS.timingScrambler],
		kinds: [
			"channel",
			"tool-call",
			"model-input"
		],
		apply(_content, ctx) {
			const delayMs = randomDelayMs(options, deps.rng);
			if (delayMs <= 0) return { action: "pass" };
			ctx.audit({
				stageId: STAGE_IDS.timingScrambler,
				severity: "info",
				code: "timing-scramble",
				message: `injected ${delayMs}ms random egress delay`
			});
			return {
				action: "delay",
				delayMs
			};
		}
	};
}
//#endregion
export { randomDelayMs as i, resolveTimingScramblerConfig as n, defaultTimingScramblerOptions as r, buildTimingScramblerStage as t };
