import { G as emitOutbound, q as hasOutboundEmitter } from "./src-C2b2oXDB.js";
//#region extensions/egress-cover-traffic/src/scheduler.ts
/**
* Inter-arrival delay for the next cover slot. `constant` returns a fixed
* interval; `poisson` draws an exponential inter-arrival time (memoryless —
* the timing of one message reveals nothing about the next).
*/
function nextIntervalMs(mode, meanIntervalMs, rng = Math.random) {
	const mean = Math.max(1, meanIntervalMs);
	if (mode === "poisson") {
		const u = Math.min(.999999999, Math.max(1e-9, rng()));
		return Math.max(1, Math.round(-Math.log(u) * mean));
	}
	return mean;
}
function createCoverScheduler(opts) {
	const idleThreshold = Math.max(1, opts.meanIntervalMs);
	let lastEgress = Number.NEGATIVE_INFINITY;
	return {
		noteRealEgress(now) {
			lastEgress = now;
		},
		shouldEmit(now) {
			return now - lastEgress >= idleThreshold;
		}
	};
}
//#endregion
//#region extensions/egress-cover-traffic/src/service.ts
const defaultCoverTrafficConfig = {
	enabled: false,
	mode: "poisson",
	meanIntervalMs: 6e4,
	coverContent: "[keepalive]"
};
/**
* Build the cover-traffic plugin service.
*/
function createCoverTrafficService(configProvider, deps = {}) {
	const now = deps.now ?? Date.now;
	const rng = deps.rng ?? Math.random;
	const setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
	const clearTimer = deps.clearTimer ?? ((h) => clearTimeout(h));
	const log = deps.log ?? (() => {});
	let timer = null;
	let stopped = false;
	let scheduler = null;
	let pendingRealEgress = null;
	return {
		id: "egress-cover-traffic",
		noteRealEgress() {
			const ts = now();
			if (scheduler) scheduler.noteRealEgress(ts);
			else pendingRealEgress = ts;
		},
		start() {
			const config = configProvider();
			if (!config.enabled) {
				log("egress-cover-traffic: disabled");
				return;
			}
			if (!config.target) {
				log("egress-cover-traffic: enabled but no target configured — inactive");
				return;
			}
			if (!hasOutboundEmitter()) log("egress-cover-traffic: no outbound emitter installed — schedule-only mode");
			stopped = false;
			const active = createCoverScheduler({ meanIntervalMs: config.meanIntervalMs });
			if (pendingRealEgress !== null) {
				active.noteRealEgress(pendingRealEgress);
				pendingRealEgress = null;
			}
			scheduler = active;
			const tick = () => {
				if (stopped) return;
				if (active.shouldEmit(now()) && config.target) {
					emitOutbound({
						to: config.target.to,
						content: config.coverContent,
						channel: config.target.channel
					}).catch((err) => {
						log(`egress-cover-traffic: send failed: ${err instanceof Error ? err.message : String(err)}`);
					});
					active.noteRealEgress(now());
				}
				timer = setTimer(tick, nextIntervalMs(config.mode, config.meanIntervalMs, rng));
			};
			timer = setTimer(tick, nextIntervalMs(config.mode, config.meanIntervalMs, rng));
		},
		stop() {
			stopped = true;
			scheduler = null;
			if (timer !== null) {
				clearTimer(timer);
				timer = null;
			}
		}
	};
}
//#endregion
export { nextIntervalMs as i, defaultCoverTrafficConfig as n, createCoverScheduler as r, createCoverTrafficService as t };
