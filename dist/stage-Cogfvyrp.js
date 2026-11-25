import { N as createPluginConfigReader, nt as STAGE_PRIORITY, tt as STAGE_IDS } from "./src-C2b2oXDB.js";
function resolveReplaySentinelConfig(raw) {
	return { historyPerSink: createPluginConfigReader("egress-replay-sentinel", raw, ["historyPerSink"]).number("historyPerSink", 16, {
		integer: true,
		min: 16,
		max: 1024
	}) };
}
//#endregion
//#region extensions/egress-replay-sentinel/src/replay.ts
/** Human-visible skeleton of a payload — cosmetic dimensions removed. */
function skeleton(text) {
	return text.toLowerCase().replace(/\s+/gu, " ").trim().replace(/[!?.,;:]+$/u, "");
}
/** Upper-bound estimate of the bits carried by the diff between two strings. */
function estimateDiffBits(a, b) {
	let differing = Math.abs(a.length - b.length);
	const common = Math.min(a.length, b.length);
	for (let i = 0; i < common; i++) if (a[i] !== b[i]) differing++;
	return differing;
}
function createReplaySentinel(opts) {
	const historyPerSink = opts?.historyPerSink ?? 16;
	const maxSinks = opts?.maxSinks ?? 2048;
	const sinks = /* @__PURE__ */ new Map();
	return {
		inspect(sinkId, text) {
			let history = sinks.get(sinkId);
			if (history) {
				sinks.delete(sinkId);
				sinks.set(sinkId, history);
			} else {
				if (sinks.size >= maxSinks) {
					const oldest = sinks.keys().next().value;
					if (oldest !== void 0) sinks.delete(oldest);
				}
				history = [];
				sinks.set(sinkId, history);
			}
			const sk = skeleton(text);
			const findings = [];
			for (const prior of history) if (prior.skeleton === sk && prior.raw !== text) {
				findings.push({
					severity: "medium",
					code: "replay-divergence",
					message: "payload repeats a prior message with cosmetic-only variation — the difference is a candidate covert channel",
					estimatedBits: estimateDiffBits(prior.raw, text)
				});
				break;
			}
			history.push({
				skeleton: sk,
				raw: text
			});
			if (history.length > historyPerSink) history.shift();
			return { findings };
		},
		reset() {
			sinks.clear();
		}
	};
}
//#endregion
//#region extensions/egress-replay-sentinel/src/stage.ts
/**
* Build the replay-sentinel stage (priority 35). It is a pure detector: it
* never rewrites or cancels, it records replay-divergence findings and charges
* the estimated covert bits against the per-sink ledger so the behavioral
* stage's budget accounts for them.
*/
function buildReplaySentinelStage(deps = {}) {
	const sentinel = deps.sentinel ?? createReplaySentinel();
	return {
		id: STAGE_IDS.replay,
		priority: STAGE_PRIORITY[STAGE_IDS.replay],
		kinds: [
			"channel",
			"tool-call",
			"model-input"
		],
		apply(content, ctx) {
			const { findings } = sentinel.inspect(ctx.sink.id, content);
			for (const finding of findings) {
				ctx.audit({
					stageId: STAGE_IDS.replay,
					...finding
				});
				ctx.ledger.observe(finding.estimatedBits);
			}
			return { action: "pass" };
		}
	};
}
//#endregion
export { resolveReplaySentinelConfig as a, skeleton as i, createReplaySentinel as n, estimateDiffBits as r, buildReplaySentinelStage as t };
