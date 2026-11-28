import { M as mapSegments, P as createPluginConfigReader, nt as STAGE_IDS, rt as STAGE_PRIORITY } from "./src-Bv_GP2Sj.js";
//#region extensions/egress-canonicalizer/src/transforms.ts
const defaultCanonicalizerOptions = {
	unicodeNfc: true,
	stripInvisible: true,
	stripBidi: true,
	foldMixedScript: true,
	normalizeWhitespace: true,
	canonicalizeJson: true
};
function buildRangeRegex(ranges, flags) {
	const cls = ranges.map(([lo, hi]) => lo === hi ? `\\u{${lo.toString(16)}}` : `\\u{${lo.toString(16)}}-\\u{${hi.toString(16)}}`).join("");
	return new RegExp(`[${cls}]`, flags);
}
const INVISIBLE_RANGES = [
	[8203, 8203],
	[8288, 8292],
	[65279, 65279],
	[6158, 6158],
	[65024, 65037],
	[917504, 917631],
	[917760, 917999]
];
const BIDI_RANGES = [[8234, 8238], [8294, 8297]];
const EXOTIC_SPACE_RANGES = [
	[8192, 8202],
	[8239, 8239],
	[8287, 8287],
	[12288, 12288]
];
const INVISIBLE_RE = buildRangeRegex(INVISIBLE_RANGES, "gu");
const BIDI_RE = buildRangeRegex(BIDI_RANGES, "gu");
const EXOTIC_SPACE_RE = buildRangeRegex(EXOTIC_SPACE_RANGES, "gu");
/** NFC normalization — equivalent sequences collapse to one canonical form. */
function normalizeUnicodeNfc(input) {
	return input.normalize("NFC");
}
/** Count regex matches without mutating lastIndex of a shared regex. */
function countMatches(input, ranges) {
	return (input.match(buildRangeRegex(ranges, "gu")) ?? []).length;
}
/** Remove invisible/tag/zero-width stego carriers. */
function stripInvisible(input) {
	return input.replace(INVISIBLE_RE, "");
}
/** Remove bidirectional control characters. */
function stripBidi(input) {
	return input.replace(BIDI_RE, "");
}
/** Normalize trailing whitespace and exotic Unicode spaces. */
function normalizeWhitespace(input) {
	return input.replace(EXOTIC_SPACE_RE, " ").split("\n").map((line) => line.replace(/[ \t]+$/u, "")).join("\n");
}
const CONFUSABLES = {
	а: "a",
	е: "e",
	о: "o",
	р: "p",
	с: "c",
	у: "y",
	х: "x",
	і: "i",
	ѕ: "s",
	ј: "j",
	һ: "h",
	А: "A",
	В: "B",
	Е: "E",
	К: "K",
	М: "M",
	Н: "H",
	О: "O",
	Р: "P",
	С: "C",
	Т: "T",
	У: "Y",
	Х: "X",
	Ѕ: "S",
	І: "I",
	ο: "o",
	Ο: "O",
	Α: "A",
	Β: "B",
	Ε: "E",
	Ζ: "Z",
	Η: "H",
	Ι: "I",
	Κ: "K",
	Μ: "M",
	Ν: "N",
	Ρ: "P",
	Τ: "T",
	Υ: "Y",
	Χ: "X",
	α: "a",
	ι: "i",
	ν: "v"
};
const LATIN_RE = /[A-Za-z]/u;
const CYRILLIC_RE = buildRangeRegex([[1024, 1327]], "u");
const GREEK_RE = buildRangeRegex([[880, 1023]], "u");
/**
* Fold homoglyphs, but ONLY inside whitespace-delimited tokens that mix Latin
* with Cyrillic/Greek. A pure-Cyrillic word (legitimate Russian) is untouched;
* a token like "paypal" with a Cyrillic 'a' is folded to ASCII.
*/
function foldMixedScriptHomoglyphs(input) {
	return input.split(/(\s+)/u).map((token) => {
		if (!LATIN_RE.test(token)) return token;
		if (!CYRILLIC_RE.test(token) && !GREEK_RE.test(token)) return token;
		return Array.from(token, (ch) => CONFUSABLES[ch] ?? ch).join("");
	}).join("");
}
/** Recursively sort object keys so element order carries no information. */
function sortJsonValue(value) {
	if (Array.isArray(value)) return value.map(sortJsonValue);
	if (value && typeof value === "object") {
		const out = {};
		for (const key of Object.keys(value).toSorted()) out[key] = sortJsonValue(value[key]);
		return out;
	}
	return value;
}
/**
* If the whole payload is a JSON object/array, re-emit it with sorted keys.
* Destroys the log2(n!) bits an attacker can encode in object-key ordering.
* Non-JSON payloads are returned unchanged.
*/
function canonicalizeJsonOrdering(input) {
	const trimmed = input.trim();
	if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return input;
	try {
		const parsed = JSON.parse(trimmed);
		if (!parsed || typeof parsed !== "object") return input;
		return JSON.stringify(sortJsonValue(parsed));
	} catch {
		return input;
	}
}
/**
* Run the configured transforms in order and report what each one removed.
* Returns the canonicalized text plus a finding per transform that fired.
*/
function canonicalize(input, options) {
	const opts = {
		...defaultCanonicalizerOptions,
		...options
	};
	const findings = [];
	let text = input;
	if (opts.unicodeNfc) {
		const next = normalizeUnicodeNfc(text);
		if (next !== text) {
			findings.push({
				severity: "low",
				code: "unicode-nfc",
				message: "normalized non-canonical Unicode sequences (NFC)",
				estimatedBits: Math.abs(text.length - next.length) * 4
			});
			text = next;
		}
	}
	if (opts.stripInvisible) {
		const removed = countMatches(text, INVISIBLE_RANGES);
		if (removed > 0) {
			text = stripInvisible(text);
			findings.push({
				severity: "high",
				code: "invisible-strip",
				message: `removed ${removed} invisible/tag/zero-width character(s)`,
				estimatedBits: removed * 8
			});
		}
	}
	if (opts.stripBidi) {
		const removed = countMatches(text, BIDI_RANGES);
		if (removed > 0) {
			text = stripBidi(text);
			findings.push({
				severity: "high",
				code: "bidi-strip",
				message: `removed ${removed} bidirectional control character(s)`,
				estimatedBits: removed * 4
			});
		}
	}
	if (opts.foldMixedScript) {
		const next = foldMixedScriptHomoglyphs(text);
		if (next !== text) {
			let folded = 0;
			for (let i = 0; i < next.length && i < text.length; i++) if (next[i] !== text[i]) folded++;
			text = next;
			findings.push({
				severity: "medium",
				code: "homoglyph-fold",
				message: `folded ${folded} mixed-script homoglyph(s) to ASCII`,
				estimatedBits: folded
			});
		}
	}
	if (opts.normalizeWhitespace) {
		const next = normalizeWhitespace(text);
		if (next !== text) {
			findings.push({
				severity: "medium",
				code: "whitespace-normalize",
				message: "normalized trailing/exotic whitespace",
				estimatedBits: Math.abs(text.length - next.length) * 2
			});
			text = next;
		}
	}
	if (opts.canonicalizeJson) {
		const next = canonicalizeJsonOrdering(text);
		if (next !== text) {
			findings.push({
				severity: "low",
				code: "json-key-order",
				message: "canonicalized JSON object-key ordering",
				estimatedBits: 16
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
//#region extensions/egress-canonicalizer/src/config.ts
const KEYS = [
	"unicodeNfc",
	"stripInvisible",
	"stripBidi",
	"foldMixedScript",
	"normalizeWhitespace",
	"canonicalizeJson"
];
function resolveCanonicalizerOptions(raw) {
	const r = createPluginConfigReader("egress-canonicalizer", raw, KEYS);
	for (const key of KEYS) if (!r.bool(key, true)) r.fail(`${key} is fixed on; false is refused`);
	return { ...defaultCanonicalizerOptions };
}
//#endregion
//#region extensions/egress-canonicalizer/src/stage.ts
/**
* Build the canonicalizer pipeline stage. It runs at priority 10 (first) so
* every later stage inspects already-canonicalized text. Lossless transforms
* mean it is safe to run in `enforce` mode from day one.
*/
function buildCanonicalizerStage(options) {
	return {
		id: STAGE_IDS.canonicalizer,
		priority: STAGE_PRIORITY[STAGE_IDS.canonicalizer],
		kinds: [
			"channel",
			"tool-call",
			"model-input"
		],
		apply(content, ctx) {
			const text = mapSegments(content, ctx, (segment) => {
				const result = canonicalize(segment, options);
				for (const finding of result.findings) ctx.audit({
					stageId: STAGE_IDS.canonicalizer,
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
export { defaultCanonicalizerOptions as i, resolveCanonicalizerOptions as n, canonicalize as r, buildCanonicalizerStage as t };
