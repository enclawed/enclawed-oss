import { P as createPluginConfigReader, nt as STAGE_IDS, rt as STAGE_PRIORITY } from "./src-Bv_GP2Sj.js";
//#region extensions/egress-taint-tracker/src/secrets.ts
const CREDENTIAL_PATTERNS = [
	{
		kind: "openai-key",
		re: /sk-[A-Za-z0-9]{20,}/g
	},
	{
		kind: "github-token",
		re: /gh[pousr]_[A-Za-z0-9]{30,}/g
	},
	{
		kind: "slack-token",
		re: /xox[baprs]-[A-Za-z0-9-]{10,}/g
	},
	{
		kind: "aws-access-key",
		re: /AKIA[0-9A-Z]{16}/g
	},
	{
		kind: "google-api-key",
		re: /AIza[0-9A-Za-z_-]{35}/g
	},
	{
		kind: "private-key-block",
		re: /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/g
	},
	{
		kind: "jwt",
		re: /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g
	},
	{
		kind: "bearer-token",
		re: /Bearer\s+[A-Za-z0-9._~+/-]{20,}={0,2}/g
	}
];
const PII_PATTERNS = [{
	kind: "email",
	re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
}, {
	kind: "ipv4",
	re: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g
}];
const CARD_RE = /\b(?:\d[ -]?){13,19}\b/g;
/** Luhn checksum — filters credit-card false positives. */
function luhnValid(raw) {
	const digits = raw.replace(/\D/g, "");
	if (digits.length < 13 || digits.length > 19) return false;
	let sum = 0;
	let double = false;
	for (let i = digits.length - 1; i >= 0; i--) {
		let d = digits.charCodeAt(i) - 48;
		if (double) {
			d *= 2;
			if (d > 9) d -= 9;
		}
		sum += d;
		double = !double;
	}
	return sum % 10 === 0;
}
/** Scan text for credential and PII patterns. */
function scanSecrets(text) {
	const out = [];
	for (const { kind, re } of CREDENTIAL_PATTERNS) for (const match of text.matchAll(re)) out.push({
		kind,
		severity: "high",
		index: match.index ?? 0,
		length: match[0].length
	});
	for (const match of text.matchAll(CARD_RE)) if (luhnValid(match[0])) out.push({
		kind: "credit-card",
		severity: "high",
		index: match.index ?? 0,
		length: match[0].length
	});
	for (const { kind, re } of PII_PATTERNS) for (const match of text.matchAll(re)) out.push({
		kind,
		severity: "low",
		index: match.index ?? 0,
		length: match[0].length
	});
	return out.toSorted((a, b) => a.index - b.index);
}
//#endregion
//#region extensions/egress-taint-tracker/src/taint-store.ts
/** FNV-1a 32-bit hash — compact, fast, good enough for shingle fingerprints. */
function hashShingle(s) {
	let h = 2166136261;
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return h >>> 0;
}
function shingleSet(value, k) {
	const norm = value.toLowerCase();
	const set = /* @__PURE__ */ new Set();
	if (norm.length <= k) {
		set.add(hashShingle(norm));
		return set;
	}
	for (let i = 0; i + k <= norm.length; i++) set.add(hashShingle(norm.slice(i, i + k)));
	return set;
}
function createTaintStore(options) {
	const k = options?.shingleSize ?? 8;
	const minValueLength = options?.minValueLength ?? 8;
	const matchThreshold = options?.matchThreshold ?? .85;
	const maxScopes = options?.maxScopes ?? 1024;
	const maxValuesPerScope = options?.maxValuesPerScope ?? 256;
	const scopes = /* @__PURE__ */ new Map();
	return {
		tag(scope, value, label = "tainted-value") {
			if (value.length < minValueLength) return;
			if (!scopes.has(scope) && scopes.size >= maxScopes) scopes.clear();
			const list = scopes.get(scope) ?? [];
			if (list.length >= maxValuesPerScope) list.shift();
			list.push({
				label,
				shingles: shingleSet(value, k)
			});
			scopes.set(scope, list);
		},
		check(scope, text) {
			const list = scopes.get(scope);
			if (!list || list.length === 0) return {
				tainted: false,
				overlap: 0,
				matched: []
			};
			const textShingles = shingleSet(text, k);
			let best = 0;
			const matched = [];
			for (const entry of list) {
				if (entry.shingles.size === 0) continue;
				let hit = 0;
				for (const sh of entry.shingles) if (textShingles.has(sh)) hit++;
				const overlap = hit / entry.shingles.size;
				best = Math.max(best, overlap);
				if (overlap >= matchThreshold) matched.push(entry.label);
			}
			return {
				tainted: matched.length > 0,
				overlap: best,
				matched
			};
		},
		clear() {
			scopes.clear();
		},
		size() {
			return scopes.size;
		}
	};
}
const STORE_KEY = Symbol.for("enclawed.egress-taint.shared-store");
/**
* Scope whose tagged values are checked at every sink. Use it for a value
* that must never leave, whatever the conversation (a session's canary
* secret, a deployment credential).
*/
const TAINT_SCOPE_ALL = "*";
function sharedTaintStore() {
	const globals = globalThis;
	let store = globals[STORE_KEY];
	if (!store) {
		store = createTaintStore();
		globals[STORE_KEY] = store;
	}
	return store;
}
/**
* Mark a value as sensitive in the shared taint store, so the taint-tracker
* stage blocks (in enforce mode) any egress payload that carries it, even
* lightly reformatted. Values shorter than 8 characters are ignored: their
* fingerprints would match ordinary text.
*/
function tagSensitiveValue(value, options = {}) {
	sharedTaintStore().tag(options.scope ?? "*", value, options.label);
}
//#endregion
//#region extensions/egress-taint-tracker/src/stage.ts
/**
* Build the taint-tracker stage (priority 20). It blocks (in enforce mode) when
* the payload carries credential material or a value previously tagged as
* sensitive for this conversation; generic PII is reported but never blocks.
*/
function buildTaintTrackerStage(deps = {}) {
	const store = deps.store ?? sharedTaintStore();
	return {
		id: STAGE_IDS.taint,
		priority: STAGE_PRIORITY[STAGE_IDS.taint],
		kinds: [
			"channel",
			"tool-call",
			"model-input"
		],
		apply(content, ctx) {
			const matches = scanSecrets(content);
			const credentials = matches.filter((m) => m.severity === "high");
			const pii = matches.filter((m) => m.severity === "low");
			for (const p of pii) ctx.audit({
				stageId: STAGE_IDS.taint,
				severity: "low",
				code: `pii-${p.kind}`,
				message: `possible ${p.kind} in outbound payload`
			});
			if (credentials.length > 0) {
				const kinds = [...new Set(credentials.map((c) => c.kind))];
				ctx.audit({
					stageId: STAGE_IDS.taint,
					severity: "high",
					code: "credential",
					message: `credential material in outbound payload: ${kinds.join(", ")}`,
					estimatedBits: credentials.reduce((n, c) => n + c.length * 6, 0)
				});
				if (ctx.mode === "enforce") return {
					action: "cancel",
					reason: `credential material in outbound payload (${kinds[0]})`
				};
			}
			const scope = ctx.sink.conversationId ?? ctx.sink.id;
			const scoped = store.check(scope, content);
			const global = scope === "*" ? scoped : store.check("*", content);
			const taint = {
				tainted: scoped.tainted || global.tainted,
				overlap: Math.max(scoped.overlap, global.overlap),
				matched: [...new Set([...scoped.matched, ...global.matched])]
			};
			if (taint.tainted) {
				ctx.audit({
					stageId: STAGE_IDS.taint,
					severity: "high",
					code: "taint-match",
					message: `payload matches tagged sensitive value(s): ${taint.matched.join(", ")}`,
					detail: { overlap: taint.overlap }
				});
				if (ctx.mode === "enforce") return {
					action: "cancel",
					reason: "tainted sensitive value in outbound payload"
				};
			}
			return { action: "pass" };
		}
	};
}
//#endregion
//#region extensions/egress-taint-tracker/src/config.ts
function resolveTaintTrackerConfig(raw) {
	const r = createPluginConfigReader("egress-taint-tracker", raw, ["enabled"]);
	if (!r.bool("enabled", true)) r.fail("enabled is fixed on; false is refused");
	return { enabled: true };
}
//#endregion
export { sharedTaintStore as a, scanSecrets as c, createTaintStore as i, buildTaintTrackerStage as n, tagSensitiveValue as o, TAINT_SCOPE_ALL as r, luhnValid as s, resolveTaintTrackerConfig as t };
