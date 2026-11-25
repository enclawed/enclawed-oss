import { N as createPluginConfigReader, j as mapSegments, nt as STAGE_PRIORITY, tt as STAGE_IDS } from "./src-C2b2oXDB.js";
//#region extensions/egress-noise-injector/src/noise.ts
const defaultNoiseOptions = {
	collapseWhitespaceRuns: true,
	normalizeTypography: true,
	collapsePunctuationRuns: true
};
const TYPOGRAPHY = [
	[8216, "'"],
	[8217, "'"],
	[8220, "\""],
	[8221, "\""],
	[8211, "-"],
	[8212, "-"],
	[8230, "..."],
	[160, " "]
];
/** Collapse runs of spaces/tabs/newlines to a canonical minimum. */
function collapseWhitespaceRuns(input) {
	return input.replace(/[^\S\r\n]{2,}/gu, " ").replace(/\t/gu, " ").replace(/\n{3,}/gu, "\n\n");
}
/** Map typographic variants onto canonical ASCII. */
function normalizeTypography(input) {
	let out = input;
	for (const [cp, replacement] of TYPOGRAPHY) out = out.split(String.fromCodePoint(cp)).join(replacement);
	return out;
}
/** Collapse repeated punctuation (`!!!` -> `!`, `???` -> `?`). */
function collapsePunctuationRuns(input) {
	return input.replace(/([!?.])\1{1,}/gu, "$1");
}
/** Apply the configured noise-injection transforms. */
function injectNoise(input, options) {
	const opts = {
		...defaultNoiseOptions,
		...options
	};
	const findings = [];
	let text = input;
	if (opts.collapseWhitespaceRuns) {
		const next = collapseWhitespaceRuns(text);
		if (next !== text) {
			findings.push({
				severity: "low",
				code: "whitespace-run-collapse",
				message: "collapsed whitespace runs (destroys whitespace-count encoding)",
				estimatedBits: Math.abs(text.length - next.length)
			});
			text = next;
		}
	}
	if (opts.normalizeTypography) {
		const next = normalizeTypography(text);
		if (next !== text) {
			findings.push({
				severity: "low",
				code: "typography-normalize",
				message: "normalized typographic variants (destroys glyph-choice encoding)",
				estimatedBits: 8
			});
			text = next;
		}
	}
	if (opts.collapsePunctuationRuns) {
		const next = collapsePunctuationRuns(text);
		if (next !== text) {
			findings.push({
				severity: "low",
				code: "punctuation-run-collapse",
				message: "collapsed repeated punctuation (destroys punctuation-count encoding)",
				estimatedBits: Math.abs(text.length - next.length)
			});
			text = next;
		}
	}
	return {
		text,
		findings
	};
}
//#endregion
//#region extensions/egress-noise-injector/src/config.ts
const KEYS = [
	"collapseWhitespaceRuns",
	"normalizeTypography",
	"collapsePunctuationRuns"
];
function resolveNoiseOptions(raw) {
	const r = createPluginConfigReader("egress-noise-injector", raw, KEYS);
	for (const key of KEYS) if (!r.bool(key, true)) r.fail(`${key} is fixed on; false is refused`);
	return { ...defaultNoiseOptions };
}
//#endregion
//#region extensions/egress-noise-injector/src/stage.ts
/**
* Build the noise-injector stage (priority 40). It proposes a meaning-preserving
* rewrite that collapses visible covert-encoding dimensions. Default mode is
* `audit` (the rewrite is recorded, not applied) because the transform is
* mildly lossy; escalate to `enforce` to apply it.
*/
function buildNoiseInjectorStage(options) {
	return {
		id: STAGE_IDS.noise,
		priority: STAGE_PRIORITY[STAGE_IDS.noise],
		kinds: [
			"channel",
			"tool-call",
			"model-input"
		],
		apply(content, ctx) {
			const text = mapSegments(content, ctx, (segment) => {
				const result = injectNoise(segment, options);
				for (const finding of result.findings) ctx.audit({
					stageId: STAGE_IDS.noise,
					...finding
				});
				return result.text;
			});
			if (text !== content) return {
				action: "rewrite",
				content: text
			};
			return { action: "pass" };
		}
	};
}
//#endregion
export { defaultNoiseOptions as a, collapseWhitespaceRuns as i, resolveNoiseOptions as n, injectNoise as o, collapsePunctuationRuns as r, normalizeTypography as s, buildNoiseInjectorStage as t };
