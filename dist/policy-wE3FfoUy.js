//#region src/enclawed/classification-scheme.ts
function normalizeName(s) {
	return s.trim().toUpperCase();
}
function makeLevel(rank, canonicalName, aliases = []) {
	return Object.freeze({
		rank,
		canonicalName,
		aliases: Object.freeze(aliases.slice())
	});
}
function freezeScheme(s) {
	return Object.freeze({
		id: s.id,
		description: s.description,
		levels: Object.freeze(s.levels.slice().sort((a, b) => a.rank - b.rank)),
		validCompartments: s.validCompartments ? Object.freeze(s.validCompartments.slice()) : void 0,
		validReleasability: s.validReleasability ? Object.freeze(s.validReleasability.slice()) : void 0
	});
}
const DEFAULT_SCHEME = freezeScheme({
	id: "enclawed-default",
	description: "Default merged scheme: generic-industry canonical names with US-gov aliases on the same numeric ladder.",
	levels: [
		makeLevel(0, "PUBLIC", [
			"UNCLASSIFIED",
			"U",
			"P"
		]),
		makeLevel(1, "INTERNAL", ["CUI", "I"]),
		makeLevel(2, "CONFIDENTIAL", ["C"]),
		makeLevel(3, "RESTRICTED", [
			"SECRET",
			"S",
			"R"
		]),
		makeLevel(4, "RESTRICTED-PLUS", [
			"TOP SECRET",
			"TS",
			"R+"
		]),
		makeLevel(5, "SCI", [
			"TOP SECRET//SCI",
			"TS//SCI",
			"RESTRICTED-PLUS//SCI"
		])
	]
});
const US_GOVERNMENT_SCHEME = freezeScheme({
	id: "us-government",
	description: "US-government classification ladder: UNCLASSIFIED, CUI, CONFIDENTIAL, SECRET, TOP SECRET, TOP SECRET//SCI.",
	levels: [
		makeLevel(0, "UNCLASSIFIED", ["U", "PUBLIC"]),
		makeLevel(1, "CUI", ["INTERNAL"]),
		makeLevel(2, "CONFIDENTIAL", ["C"]),
		makeLevel(3, "SECRET", ["S", "RESTRICTED"]),
		makeLevel(4, "TOP SECRET", ["TS", "RESTRICTED-PLUS"]),
		makeLevel(5, "TOP SECRET//SCI", ["TS//SCI", "SCI"])
	],
	validReleasability: [
		"NOFORN",
		"REL TO USA",
		"FVEY",
		"ORCON",
		"PROPIN"
	]
});
const HEALTHCARE_HIPAA_SCHEME = freezeScheme({
	id: "healthcare-hipaa",
	description: "Healthcare scheme oriented around HIPAA / GDPR Art. 9 special-category data: Public, Internal, PHI, Sensitive PHI, Research Embargoed.",
	levels: [
		makeLevel(0, "PUBLIC", []),
		makeLevel(1, "INTERNAL", []),
		makeLevel(2, "PHI", ["PROTECTED-HEALTH-INFORMATION"]),
		makeLevel(3, "SENSITIVE-PHI", [
			"PSYCH",
			"GENETIC",
			"HIV-STATUS",
			"SUD"
		]),
		makeLevel(4, "RESEARCH-EMBARGOED", ["EMBARGO", "PRE-PUBLICATION"])
	],
	validCompartments: [
		"MENTAL-HEALTH",
		"GENETICS",
		"HIV",
		"SUD",
		"MINOR",
		"VIP"
	],
	validReleasability: [
		"NDA",
		"EYES_ONLY",
		"DO_NOT_FORWARD",
		"BAA-COVERED"
	]
});
const FINANCIAL_SERVICES_SCHEME = freezeScheme({
	id: "financial-services",
	description: "Financial-services scheme oriented around material non-public information (MNPI), insider lists, and privileged communications.",
	levels: [
		makeLevel(0, "PUBLIC", []),
		makeLevel(1, "INTERNAL", []),
		makeLevel(2, "CONFIDENTIAL", []),
		makeLevel(3, "MNPI", ["MATERIAL-NON-PUBLIC-INFORMATION", "INSIDER"]),
		makeLevel(4, "PRIVILEGED-COUNSEL", ["ATTORNEY-CLIENT", "LEGAL-PRIVILEGE"])
	],
	validCompartments: [
		"M_AND_A",
		"DEAL_TEAM",
		"RESTRICTED_LIST",
		"TRADING_DESK",
		"AUDIT"
	],
	validReleasability: [
		"NDA",
		"EYES_ONLY",
		"DO_NOT_FORWARD",
		"REGULATOR-DISCLOSURE"
	]
});
const GENERIC_3_TIER_SCHEME = freezeScheme({
	id: "generic-3-tier",
	description: "Smallest viable scheme: Public, Internal, Restricted.",
	levels: [
		makeLevel(0, "PUBLIC", []),
		makeLevel(1, "INTERNAL", []),
		makeLevel(2, "RESTRICTED", ["CONFIDENTIAL", "SENSITIVE"])
	]
});
const BUILT_IN_SCHEMES = Object.freeze({
	default: DEFAULT_SCHEME,
	"us-government": US_GOVERNMENT_SCHEME,
	"healthcare-hipaa": HEALTHCARE_HIPAA_SCHEME,
	"financial-services": FINANCIAL_SERVICES_SCHEME,
	"generic-3-tier": GENERIC_3_TIER_SCHEME
});
function parseClassificationScheme(raw) {
	if (raw === null || typeof raw !== "object") throw new TypeError("scheme must be a JSON object");
	const o = raw;
	const id = String(o.id ?? "").trim();
	if (!id) throw new Error("scheme.id is required");
	const description = String(o.description ?? "").trim();
	if (!Array.isArray(o.levels) || o.levels.length === 0) throw new Error("scheme.levels must be a non-empty array");
	const seenRanks = /* @__PURE__ */ new Set();
	const seenNames = /* @__PURE__ */ new Set();
	const levels = [];
	for (const lvIn of o.levels) {
		if (lvIn === null || typeof lvIn !== "object") throw new Error("each level must be an object");
		const lv = lvIn;
		const rank = Number(lv.rank);
		if (!Number.isInteger(rank) || rank < 0) throw new Error(`level.rank must be a non-negative integer, got ${String(lv.rank)}`);
		if (seenRanks.has(rank)) throw new Error(`duplicate rank ${rank}`);
		seenRanks.add(rank);
		if (typeof lv.canonicalName !== "string") throw new TypeError(`level rank=${rank} canonicalName must be a string`);
		const canonicalName = lv.canonicalName.trim();
		if (!canonicalName) throw new Error(`level rank=${rank} missing canonicalName`);
		const aliases = Array.isArray(lv.aliases) ? lv.aliases.map((a) => String(a)) : [];
		for (const n of [canonicalName, ...aliases]) {
			const norm = normalizeName(n);
			if (seenNames.has(norm)) throw new Error(`duplicate name across scheme: "${n}"`);
			seenNames.add(norm);
		}
		levels.push(makeLevel(rank, canonicalName, aliases));
	}
	const sorted = [...seenRanks].sort((a, b) => a - b);
	for (let i = 0; i < sorted.length; i++) if (sorted[i] !== i) throw new Error(`scheme ranks must be contiguous 0..${sorted.length - 1}, got ${JSON.stringify(sorted)}`);
	return freezeScheme({
		id,
		description,
		levels,
		validCompartments: Array.isArray(o.validCompartments) && o.validCompartments.length > 0 ? o.validCompartments.map((c) => String(c)) : void 0,
		validReleasability: Array.isArray(o.validReleasability) && o.validReleasability.length > 0 ? o.validReleasability.map((c) => String(c)) : void 0
	});
}
let activeScheme = DEFAULT_SCHEME;
function getActiveScheme() {
	return activeScheme;
}
function setActiveScheme(scheme) {
	activeScheme = scheme;
}
function levelByRank(rank, scheme = activeScheme) {
	return scheme.levels.find((lv) => lv.rank === rank);
}
function clearanceNameToRank(name, scheme = activeScheme) {
	const norm = normalizeName(name);
	for (const lv of scheme.levels) {
		if (normalizeName(lv.canonicalName) === norm) return lv.rank;
		for (const a of lv.aliases) if (normalizeName(a) === norm) return lv.rank;
	}
}
function maxRank(scheme = activeScheme) {
	return scheme.levels[scheme.levels.length - 1]?.rank ?? 0;
}
async function loadSchemeByName(name, opts = {}) {
	const built = BUILT_IN_SCHEMES[name];
	if (built) return built;
	const path = await import("node:path");
	if (Array.isArray(opts.allowedDirs) && opts.allowedDirs.length > 0) {
		const resolved = path.resolve(name);
		if (!opts.allowedDirs.some((d) => {
			const dr = path.resolve(d);
			const rel = path.relative(dr, resolved);
			return rel === "" || !rel.startsWith("..") && !path.isAbsolute(rel);
		})) throw new Error(`scheme path "${name}" is outside allowed directories`);
	}
	const { readFile } = await import("node:fs/promises");
	const raw = await readFile(name, "utf8");
	let parsed;
	try {
		parsed = JSON.parse(raw);
	} catch (e) {
		throw new Error(`scheme JSON parse failed at ${name}: ${e.message}`);
	}
	return parseClassificationScheme(parsed);
}
//#endregion
//#region src/enclawed/classification.ts
const TIER = Object.freeze({
	PUBLIC: 0,
	INTERNAL: 1,
	CONFIDENTIAL: 2,
	RESTRICTED: 3,
	RESTRICTED_PLUS: 4,
	SCI: 5
});
const LEVEL = Object.freeze({
	UNCLASSIFIED: TIER.PUBLIC,
	CUI: TIER.INTERNAL,
	CONFIDENTIAL: TIER.CONFIDENTIAL,
	SECRET: TIER.RESTRICTED,
	TOP_SECRET: TIER.RESTRICTED_PLUS,
	TOP_SECRET_SCI: TIER.SCI
});
const LEGACY_NAME_GENERIC = Object.freeze({
	0: "PUBLIC",
	1: "INTERNAL",
	2: "CONFIDENTIAL",
	3: "RESTRICTED",
	4: "RESTRICTED-PLUS",
	5: "RESTRICTED-PLUS//SCI"
});
const LEGACY_NAME_US_GOV = Object.freeze({
	0: "UNCLASSIFIED",
	1: "CUI",
	2: "CONFIDENTIAL",
	3: "SECRET",
	4: "TOP SECRET",
	5: "TOP SECRET//SCI"
});
makeLabel({
	level: TIER.RESTRICTED_PLUS,
	compartments: ["all-categories"]
});
const DOE_Q_TEMPLATE = makeLabel({
	level: TIER.RESTRICTED_PLUS,
	compartments: [
		"RD",
		"FRD",
		"NSI"
	],
	releasability: ["NOFORN"]
});
makeLabel({
	level: TIER.RESTRICTED,
	compartments: ["RD", "FRD"],
	releasability: ["NOFORN"]
});
makeLabel({ level: TIER.PUBLIC });
function normalizeFrozenList(arr) {
	if (!arr) return Object.freeze([]);
	const dedup = [...new Set([...arr].map(String))].sort();
	return Object.freeze(dedup);
}
function makeLabel(input) {
	const scheme = getActiveScheme();
	const max = maxRank(scheme);
	if (!Number.isInteger(input.level) || input.level < 0 || input.level > max) throw new TypeError(`invalid classification level ${String(input.level)}: scheme "${scheme.id}" supports ranks 0..${max}`);
	return Object.freeze({
		level: input.level,
		compartments: normalizeFrozenList(input.compartments),
		releasability: normalizeFrozenList(input.releasability)
	});
}
function format(label, opts) {
	let head;
	if (opts?.nameStyle === "us-gov") head = LEGACY_NAME_US_GOV[label.level] ?? `LEVEL_${label.level}`;
	else if (opts?.nameStyle === "generic") head = LEGACY_NAME_GENERIC[label.level] ?? `LEVEL_${label.level}`;
	else head = levelByRank(label.level)?.canonicalName ?? `LEVEL_${label.level}`;
	const parts = [head];
	if (label.compartments.length > 0) parts.push(label.compartments.join("/"));
	if (label.releasability.length > 0) parts.push(label.releasability.join("/"));
	return parts.join("//");
}
const FALLBACK_RELEASABILITY = new Set([
	"NDA",
	"EYES_ONLY",
	"VENDOR_ONLY",
	"INTERNAL_ONLY",
	"DO_NOT_FORWARD",
	"NOFORN",
	"REL TO USA",
	"FVEY",
	"ORCON",
	"PROPIN"
]);
function parse(input) {
	if (typeof input !== "string") throw new TypeError("parse expects a string");
	const scheme = getActiveScheme();
	const segments = input.trim().split("//").map((x) => x.trim()).filter(Boolean);
	if (segments.length === 0) throw new Error("empty classification string");
	let head = segments[0] ?? "";
	let consumed = 1;
	let level;
	if (segments.length >= 2) {
		const combo = `${head}//${segments[1]}`;
		const comboLevel = clearanceNameToRank(combo, scheme);
		if (comboLevel !== void 0) {
			level = comboLevel;
			consumed = 2;
			head = combo;
		}
	}
	if (level === void 0) level = clearanceNameToRank(head, scheme);
	if (level === void 0) throw new Error(`unrecognized classification head: "${head}" (scheme "${scheme.id}")`);
	const releasabilitySet = scheme.validReleasability ? new Set(scheme.validReleasability.map((t) => t.toUpperCase())) : FALLBACK_RELEASABILITY;
	const compartments = [];
	const releasability = [];
	for (let i = consumed; i < segments.length; i++) {
		const tokens = (segments[i] ?? "").split("/").map((t) => t.trim()).filter(Boolean);
		if (tokens.length > 0 && tokens.every((t) => releasabilitySet.has(t.toUpperCase()))) tokens.forEach((t) => releasability.push(t));
		else tokens.forEach((t) => compartments.push(t));
	}
	return makeLabel({
		level,
		compartments,
		releasability
	});
}
//#endregion
//#region src/enclawed/policy.ts
function freezeAllowlist(list) {
	return new Set([...list ?? []].map(String));
}
function createPolicy(input) {
	if (!input.maxOutputClearance) throw new Error("createPolicy: maxOutputClearance is required");
	if (!input.defaultDataLabel) throw new Error("createPolicy: defaultDataLabel is required");
	return Object.freeze({
		enforceAllowlists: input.enforceAllowlists ?? true,
		allowedChannels: freezeAllowlist(input.allowedChannels),
		allowedProviders: freezeAllowlist(input.allowedProviders),
		allowedTools: freezeAllowlist(input.allowedTools),
		allowedHosts: freezeAllowlist(input.allowedHosts),
		maxOutputClearance: input.maxOutputClearance,
		defaultDataLabel: input.defaultDataLabel
	});
}
function checkChannel(policy, id) {
	if (!policy.enforceAllowlists) return { allowed: true };
	return policy.allowedChannels.has(id) ? { allowed: true } : {
		allowed: false,
		reason: `channel "${id}" not on allowlist`
	};
}
function checkProvider(policy, id) {
	if (!policy.enforceAllowlists) return { allowed: true };
	return policy.allowedProviders.has(id) ? { allowed: true } : {
		allowed: false,
		reason: `provider "${id}" not on allowlist`
	};
}
function defaultEnclavedPolicy(opts) {
	const localModelProviderId = opts?.localModelProviderId ?? "local-model";
	return createPolicy({
		enforceAllowlists: true,
		allowedChannels: [opts?.controlChannelId ?? "web-loopback"],
		allowedProviders: [localModelProviderId],
		allowedTools: [],
		allowedHosts: [
			"127.0.0.1",
			"::1",
			"localhost"
		],
		maxOutputClearance: makeLabel(DOE_Q_TEMPLATE),
		defaultDataLabel: makeLabel({
			level: LEVEL.SECRET,
			compartments: ["RD"]
		})
	});
}
function defaultOpenPolicy() {
	return createPolicy({
		enforceAllowlists: false,
		maxOutputClearance: makeLabel({ level: LEVEL.UNCLASSIFIED }),
		defaultDataLabel: makeLabel({ level: LEVEL.UNCLASSIFIED })
	});
}
//#endregion
export { defaultOpenPolicy as a, makeLabel as c, loadSchemeByName as d, setActiveScheme as f, defaultEnclavedPolicy as i, parse as l, checkProvider as n, LEVEL as o, createPolicy as r, format as s, checkChannel as t, clearanceNameToRank as u };
