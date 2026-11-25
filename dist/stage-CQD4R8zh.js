import { N as createPluginConfigReader, n as shannonEntropyBits, nt as STAGE_PRIORITY, tt as STAGE_IDS } from "./src-C2b2oXDB.js";
import { deflateSync } from "node:zlib";
//#region extensions/egress-entropy-scanner/src/entropy.ts
const defaultEntropyOptions = {
	minBlobLength: 64,
	entropyThresholdBits: 5.4,
	incompressibleRatio: .92
};
/** Ratio of DEFLATE-compressed size to raw size (1 ≈ incompressible). */
function compressionRatio(text) {
	if (text.length < 16) return 0;
	const raw = Buffer.from(text, "utf8");
	if (raw.length === 0) return 0;
	return deflateSync(raw).length / raw.length;
}
/** Analyze a payload and estimate the covert capacity it carries. */
function scanEntropy(text, options) {
	const opts = {
		...defaultEntropyOptions,
		...options
	};
	const findings = [];
	let estimatedCovertBits = 0;
	const base64Re = new RegExp(`[A-Za-z0-9+/]{${opts.minBlobLength},}={0,2}`, "g");
	for (const match of text.matchAll(base64Re)) {
		const len = match[0].length;
		const bits = Math.round(len * 6);
		estimatedCovertBits += bits;
		findings.push({
			severity: "high",
			code: "base64-blob",
			message: `base64-like run of ${len} characters`,
			estimatedBits: bits
		});
	}
	const hexRe = new RegExp(`\\b[0-9a-fA-F]{${opts.minBlobLength},}\\b`, "g");
	for (const match of text.matchAll(hexRe)) {
		const len = match[0].length;
		const bits = len * 4;
		estimatedCovertBits += bits;
		findings.push({
			severity: "high",
			code: "hex-blob",
			message: `hex run of ${len} characters`,
			estimatedBits: bits
		});
	}
	const entropyBits = shannonEntropyBits(text);
	if (text.length >= 32 && entropyBits > opts.entropyThresholdBits) {
		const bits = Math.round((entropyBits - opts.entropyThresholdBits) * text.length);
		estimatedCovertBits += bits;
		findings.push({
			severity: "medium",
			code: "high-entropy",
			message: `char entropy ${entropyBits.toFixed(2)} bits/char exceeds ${opts.entropyThresholdBits}`,
			estimatedBits: bits
		});
	}
	if (text.length >= 64) {
		const ratio = compressionRatio(text.slice(0, 65536));
		if (ratio > opts.incompressibleRatio) {
			const bits = Math.round(text.length * 2);
			estimatedCovertBits += bits;
			findings.push({
				severity: "medium",
				code: "incompressible",
				message: `compression ratio ${ratio.toFixed(2)} — payload is near-incompressible`,
				estimatedBits: bits
			});
		}
	}
	return {
		estimatedCovertBits,
		entropyBits,
		findings
	};
}
//#endregion
//#region extensions/egress-entropy-scanner/src/config.ts
function resolveEntropyOptions(raw) {
	const r = createPluginConfigReader("egress-entropy-scanner", raw, [
		"minBlobLength",
		"entropyThresholdBits",
		"incompressibleRatio"
	]);
	const d = defaultEntropyOptions;
	return {
		minBlobLength: r.number("minBlobLength", d.minBlobLength, {
			integer: true,
			min: 8,
			max: d.minBlobLength
		}),
		entropyThresholdBits: r.number("entropyThresholdBits", d.entropyThresholdBits, {
			above: 0,
			max: d.entropyThresholdBits
		}),
		incompressibleRatio: r.number("incompressibleRatio", d.incompressibleRatio, {
			above: 0,
			max: d.incompressibleRatio
		})
	};
}
//#endregion
//#region extensions/egress-entropy-scanner/src/stage.ts
/**
* Build the entropy-scanner stage (priority 30). It measures the covert
* capacity of the payload and charges it against the per-sink ledger:
*  - audit mode   : record the estimate (`ledger.observe`) and emit findings.
*  - enforce mode : try to consume the estimate from the ledger; if the budget
*                   is exhausted, cancel the egress.
*/
function buildEntropyScannerStage(options) {
	return {
		id: STAGE_IDS.entropy,
		priority: STAGE_PRIORITY[STAGE_IDS.entropy],
		kinds: [
			"channel",
			"tool-call",
			"model-input"
		],
		apply(content, ctx) {
			const report = scanEntropy(content, options);
			for (const finding of report.findings) ctx.audit({
				stageId: STAGE_IDS.entropy,
				...finding
			});
			if (report.estimatedCovertBits <= 0) return { action: "pass" };
			if (ctx.mode === "enforce") {
				if (!ctx.ledger.tryConsume(report.estimatedCovertBits)) return {
					action: "cancel",
					reason: `covert-capacity budget exhausted (${report.estimatedCovertBits} bits estimated)`
				};
				return { action: "pass" };
			}
			ctx.ledger.observe(report.estimatedCovertBits);
			return { action: "pass" };
		}
	};
}
//#endregion
export { scanEntropy as a, defaultEntropyOptions as i, resolveEntropyOptions as n, compressionRatio as r, buildEntropyScannerStage as t };
