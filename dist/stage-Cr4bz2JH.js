import { N as createPluginConfigReader, j as mapSegments, nt as STAGE_PRIORITY, tt as STAGE_IDS } from "./src-C2b2oXDB.js";
//#region extensions/egress-semantic-scrambler/src/scrambler.ts
const defaultScramblerOptions = {
	expandContractions: true,
	canonicalizeSynonyms: true,
	passiveToActive: true
};
const SYNONYM_RINGS = [
	[
		"large",
		"huge",
		"massive",
		"enormous",
		"gigantic"
	],
	[
		"small",
		"tiny",
		"minuscule",
		"miniature"
	],
	[
		"important",
		"crucial",
		"vital",
		"essential"
	],
	[
		"difficult",
		"tough",
		"challenging",
		"demanding"
	],
	[
		"easy",
		"simple",
		"straightforward",
		"effortless"
	],
	[
		"begin",
		"commence",
		"initiate"
	],
	[
		"finish",
		"conclude",
		"finalize"
	],
	[
		"repair",
		"mend",
		"fix"
	],
	[
		"modify",
		"alter",
		"amend"
	],
	[
		"verify",
		"confirm",
		"validate"
	],
	[
		"obtain",
		"acquire",
		"procure"
	],
	[
		"error",
		"fault",
		"defect",
		"flaw"
	],
	[
		"problem",
		"issue",
		"difficulty"
	],
	[
		"reply",
		"response",
		"answer"
	],
	[
		"notify",
		"inform",
		"alert"
	],
	[
		"happy",
		"glad",
		"pleased",
		"delighted"
	],
	[
		"angry",
		"furious",
		"irate"
	],
	[
		"frequently",
		"often",
		"regularly",
		"repeatedly"
	],
	[
		"rarely",
		"seldom",
		"infrequently"
	],
	[
		"perhaps",
		"maybe",
		"possibly"
	],
	[
		"additionally",
		"moreover",
		"furthermore"
	],
	[
		"therefore",
		"thus",
		"hence",
		"consequently"
	],
	[
		"accurate",
		"precise",
		"exact"
	],
	[
		"rapidly",
		"quickly",
		"swiftly"
	]
];
const SYNONYM_MAP = /* @__PURE__ */ new Map();
for (const ring of SYNONYM_RINGS) for (const word of ring) SYNONYM_MAP.set(word, ring[0]);
const CONTRACTIONS = {
	dont: "do not",
	doesnt: "does not",
	didnt: "did not",
	wont: "will not",
	wouldnt: "would not",
	cant: "cannot",
	couldnt: "could not",
	shouldnt: "should not",
	mustnt: "must not",
	isnt: "is not",
	arent: "are not",
	wasnt: "was not",
	werent: "were not",
	hasnt: "has not",
	havent: "have not",
	hadnt: "had not",
	im: "i am",
	youre: "you are",
	were2: "we are",
	theyre: "they are",
	ive: "i have",
	youve: "you have",
	weve: "we have",
	theyve: "they have",
	ill2: "i will",
	youll: "you will",
	well2: "we will",
	theyll: "they will",
	id2: "i would",
	youd: "you would",
	wed2: "we would",
	theyd: "they would",
	its2: "it is",
	thats: "that is",
	theres: "there is",
	heres: "here is",
	whats: "what is",
	lets: "let us",
	whos: "who is"
};
/** Apply the casing of `original` onto `replacement`. */
function applyCase(original, replacement) {
	if (original.length > 1 && original === original.toUpperCase()) return replacement.toUpperCase();
	if (original[0] === original[0]?.toUpperCase()) return replacement[0].toUpperCase() + replacement.slice(1);
	return replacement;
}
const CONTRACTION_RE = new RegExp(`\\b([A-Za-z]+)['’]([A-Za-z]+)\\b`, "g");
/** Expand contractions to one canonical full form. */
function expandContractions(input) {
	return input.replace(CONTRACTION_RE, (match, a, b) => {
		const bare = `${a}${b}`.toLowerCase();
		const expansion = CONTRACTIONS[bare === "were" ? "were2" : bare === "well" ? "well2" : bare === "id" ? "id2" : bare === "wed" ? "wed2" : bare === "ill" ? "ill2" : bare === "its" ? "its2" : bare] ?? CONTRACTIONS[bare];
		return expansion ? applyCase(match, expansion) : match;
	});
}
const WORD_RE = /\b[A-Za-z]+\b/g;
/** Collapse every synonym-ring member to the ring's canonical word. */
function canonicalizeSynonyms(input) {
	return input.replace(WORD_RE, (word) => {
		const canonical = SYNONYM_MAP.get(word.toLowerCase());
		if (!canonical || canonical === word.toLowerCase()) return word;
		return applyCase(word, canonical);
	});
}
const PASSIVE_RE = /\b([a-z][a-z]*(?:\s+[a-z]+){0,2})\s+(?:was|were)\s+([a-z]+ed)\s+by\s+([a-z][a-z]*(?:\s+[a-z]+){0,2})\b/gi;
/** Normalize agentive passive constructions toward active voice. */
function passiveToActive(input) {
	return input.replace(PASSIVE_RE, (_m, object, verb, agent) => {
		return `${agent.toLowerCase()} ${verb.toLowerCase()} ${object.toLowerCase()}`;
	});
}
/** Run the configured scrambler transforms and report what each collapsed. */
function scramble(input, options) {
	const opts = {
		...defaultScramblerOptions,
		...options
	};
	const findings = [];
	let text = input;
	if (opts.expandContractions) {
		const next = expandContractions(text);
		if (next !== text) {
			findings.push({
				severity: "low",
				code: "contraction-expand",
				message: "expanded contractions to canonical full form",
				estimatedBits: (text.match(CONTRACTION_RE) ?? []).length
			});
			text = next;
		}
	}
	if (opts.passiveToActive) {
		const next = passiveToActive(text);
		if (next !== text) {
			findings.push({
				severity: "low",
				code: "voice-normalize",
				message: "normalized agentive passive constructions toward active voice",
				estimatedBits: (text.match(PASSIVE_RE) ?? []).length
			});
			text = next;
		}
	}
	if (opts.canonicalizeSynonyms) {
		let swapped = 0;
		const next = text.replace(WORD_RE, (word) => {
			const canonical = SYNONYM_MAP.get(word.toLowerCase());
			if (!canonical || canonical === word.toLowerCase()) return word;
			swapped++;
			return applyCase(word, canonical);
		});
		if (next !== text) {
			findings.push({
				severity: "medium",
				code: "synonym-canonicalize",
				message: `collapsed ${swapped} synonym choice(s) to the canonical word`,
				estimatedBits: swapped
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
//#region extensions/egress-semantic-scrambler/src/config.ts
const TRANSFORMS = [
	"expandContractions",
	"canonicalizeSynonyms",
	"passiveToActive"
];
function resolveSemanticScramblerConfig(raw) {
	const r = createPluginConfigReader("egress-semantic-scrambler", raw, ["enabled", ...TRANSFORMS]);
	for (const key of TRANSFORMS) if (!r.bool(key, true)) r.fail(`${key} is fixed on; false is refused`);
	return {
		enabled: r.bool("enabled", true),
		options: { ...defaultScramblerOptions }
	};
}
//#endregion
//#region extensions/egress-semantic-scrambler/src/stage.ts
/**
* Build the semantic-scrambler stage (priority 45). It proposes a
* meaning-preserving rewrite that collapses linguistic covert-encoding
* dimensions — synonym choice, contraction form, active/passive voice.
* Default mode is audit (the rewrite is recorded, not applied) because the
* transform is lossy at the surface; escalate to enforce to apply it.
*/
function buildSemanticScramblerStage(options) {
	return {
		id: STAGE_IDS.scrambler,
		priority: STAGE_PRIORITY[STAGE_IDS.scrambler],
		kinds: [
			"channel",
			"tool-call",
			"model-input"
		],
		apply(content, ctx) {
			const text = mapSegments(content, ctx, (segment) => {
				const result = scramble(segment, options);
				for (const finding of result.findings) ctx.audit({
					stageId: STAGE_IDS.scrambler,
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
export { defaultScramblerOptions as a, scramble as c, canonicalizeSynonyms as i, resolveSemanticScramblerConfig as n, expandContractions as o, SYNONYM_RINGS as r, passiveToActive as s, buildSemanticScramblerStage as t };
