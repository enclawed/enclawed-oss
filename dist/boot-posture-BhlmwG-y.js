import { r as parseHardwareRootMode } from "./root-mode-E_ZWjW5y.js";
import { a as createPolicy, d as makeLabel, f as parse$1, l as dominates, o as defaultEnclavedPolicy, s as defaultOpenPolicy, u as format } from "./policy-DkHRIVB7.js";
import { r as validateOperatorPathEntry } from "./history-paths-DhTjGYwI.js";
import path from "node:path";
//#region src/enclawed/policy-loader.ts
const HISTORY_KEYS = new Set([
	"maxFileBytes",
	"maxTotalBytes",
	"maxAgeDays",
	"noHistoryPaths",
	"noHistoryTools"
]);
function normalizeToolIds(ids, field) {
	const out = ids?.map((id) => id.trim().toLowerCase());
	for (const id of out ?? []) if (id.length === 0 || id === "*") throw new TypeError(`${field} entries must be tool ids (no empty ids or "*")`);
	return out;
}
function normalizeList(values) {
	return values?.map((v) => v.trim().toLowerCase());
}
function parseHistoryJson(raw) {
	if (raw === void 0) return;
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new TypeError("enclawed.policy.history must be an object");
	const cfg = raw;
	for (const key of Object.keys(cfg)) if (!HISTORY_KEYS.has(key)) throw new TypeError(`enclawed.policy.history.${key} is not a known setting`);
	for (const key of ["maxFileBytes", "maxTotalBytes"]) {
		const v = cfg[key];
		if (v !== void 0 && !(typeof v === "number" && Number.isSafeInteger(v) && v > 0)) throw new TypeError(`enclawed.policy.history.${key} must be a positive integer`);
	}
	const age = cfg.maxAgeDays;
	if (age !== void 0 && !(typeof age === "number" && Number.isFinite(age) && age >= 7 && age <= 365)) throw new TypeError(`enclawed.policy.history.maxAgeDays must be a number from 7 to 365`);
	for (const key of ["noHistoryPaths", "noHistoryTools"]) if (cfg[key] !== void 0 && !isStringArray(cfg[key])) throw new TypeError(`enclawed.policy.history.${key} must be a string array`);
	return {
		maxFileBytes: cfg.maxFileBytes,
		maxTotalBytes: cfg.maxTotalBytes,
		maxAgeDays: age,
		noHistoryPaths: cfg.noHistoryPaths?.map((p) => validateOperatorPathEntry(p, "enclawed.policy.history.noHistoryPaths", { allowGlob: true })),
		noHistoryTools: normalizeToolIds(cfg.noHistoryTools, "enclawed.policy.history.noHistoryTools")
	};
}
function isStringArray(v) {
	return Array.isArray(v) && v.every((x) => typeof x === "string");
}
function parseLabel(input, fieldName) {
	if (typeof input === "string") return parse$1(input);
	if (input && typeof input === "object" && !Array.isArray(input)) {
		const obj = input;
		if (typeof obj.level !== "number") throw new TypeError(`${fieldName}.level must be a number`);
		const compartments = obj.compartments;
		if (compartments !== void 0 && !isStringArray(compartments)) throw new TypeError(`${fieldName}.compartments must be a string array`);
		const releasability = obj.releasability;
		if (releasability !== void 0 && !isStringArray(releasability)) throw new TypeError(`${fieldName}.releasability must be a string array`);
		return makeLabel({
			level: obj.level,
			compartments,
			releasability
		});
	}
	throw new TypeError(`${fieldName} must be a classification string or label object`);
}
function parsePolicyJson(raw, defaults) {
	if (raw === void 0 || raw === null) return createPolicy({
		enforceAllowlists: defaults.enforceAllowlists ?? true,
		maxOutputClearance: defaults.maxOutputClearance,
		defaultDataLabel: defaults.defaultDataLabel
	});
	if (typeof raw !== "object" || Array.isArray(raw)) throw new TypeError("enclawed.policy must be an object");
	const cfg = raw;
	for (const key of [
		"allowedHosts",
		"allowedChannels",
		"allowedProviders",
		"allowedTools",
		"preApprovedIrreversibleTools",
		"scratchPaths"
	]) {
		const value = cfg[key];
		if (value !== void 0 && !isStringArray(value)) throw new TypeError(`enclawed.policy.${key} must be a string array`);
	}
	if (cfg.enforceAllowlists !== void 0 && typeof cfg.enforceAllowlists !== "boolean") throw new TypeError("enclawed.policy.enforceAllowlists must be a boolean");
	if (cfg.commandNetwork !== void 0 && cfg.commandNetwork !== "none" && cfg.commandNetwork !== "host") throw new TypeError("enclawed.policy.commandNetwork must be \"none\" or \"host\"");
	const preApprovedIrreversibleTools = normalizeToolIds(cfg.preApprovedIrreversibleTools, "enclawed.policy.preApprovedIrreversibleTools");
	const scratchPaths = cfg.scratchPaths?.map((p) => validateOperatorPathEntry(p, "enclawed.policy.scratchPaths", { allowGlob: false }));
	const history = parseHistoryJson(cfg.history);
	const maxOutputClearance = cfg.maxOutputClearance !== void 0 ? parseLabel(cfg.maxOutputClearance, "enclawed.policy.maxOutputClearance") : defaults.maxOutputClearance;
	const defaultDataLabel = cfg.defaultDataLabel !== void 0 ? parseLabel(cfg.defaultDataLabel, "enclawed.policy.defaultDataLabel") : defaults.defaultDataLabel;
	return createPolicy({
		enforceAllowlists: cfg.enforceAllowlists ?? defaults.enforceAllowlists ?? true,
		allowedChannels: cfg.allowedChannels,
		allowedProviders: cfg.allowedProviders,
		allowedTools: normalizeList(cfg.allowedTools),
		allowedHosts: normalizeList(cfg.allowedHosts),
		commandNetwork: cfg.commandNetwork,
		preApprovedIrreversibleTools,
		scratchPaths,
		history,
		maxOutputClearance,
		defaultDataLabel
	});
}
function extractPolicyBlock(rawDocument) {
	if (!rawDocument || typeof rawDocument !== "object" || Array.isArray(rawDocument)) return;
	const enclawed = rawDocument.enclawed;
	if (!enclawed || typeof enclawed !== "object" || Array.isArray(enclawed)) return;
	return enclawed.policy;
}
function loadPolicyFromJson(rawDocument, defaults) {
	return parsePolicyJson(extractPolicyBlock(rawDocument), defaults);
}
//#endregion
//#region src/enclawed/policy-tighten.ts
function tightenPolicy(base, userBlock) {
	if (userBlock === void 0 || userBlock === null) return {
		policy: base,
		refused: []
	};
	const user = parsePolicyJson(userBlock, {
		maxOutputClearance: base.maxOutputClearance,
		defaultDataLabel: base.defaultDataLabel,
		enforceAllowlists: base.enforceAllowlists
	});
	const raw = userBlock;
	const rawHistory = raw.history ?? {};
	const refused = [];
	const enforce = (() => {
		if (raw.enforceAllowlists === false && base.enforceAllowlists) {
			refused.push("enclawed.policy.enforceAllowlists=false (would turn every allowlist off)");
			return true;
		}
		return base.enforceAllowlists || user.enforceAllowlists;
	})();
	const list = (key) => {
		if (raw[key] === void 0) return new Set(base[key]);
		if (!base.enforceAllowlists) return new Set(user[key]);
		const out = /* @__PURE__ */ new Set();
		for (const v of user[key]) if (base[key].has(v)) out.add(v);
		else refused.push(`enclawed.policy.${key} += ${JSON.stringify(v)}`);
		return out;
	};
	const intersect = (key, baseVals, userVals) => {
		if (raw[key] === void 0) return [...baseVals];
		const b = new Set(baseVals);
		const out = [];
		for (const v of userVals) if (b.has(v)) out.push(v);
		else refused.push(`enclawed.policy.${key} += ${JSON.stringify(v)}`);
		return out;
	};
	let commandNetwork = base.commandNetwork;
	if (raw.commandNetwork !== void 0) if (user.commandNetwork === "host" && base.commandNetwork === "none") refused.push("enclawed.policy.commandNetwork=\"host\" (would take exec out of the network cage)");
	else commandNetwork = user.commandNetwork;
	const cap = (key) => {
		if (rawHistory[key] === void 0) return base.history[key];
		if (key === "maxAgeDays" && user.history[key] !== base.history[key]) {
			refused.push(`enclawed.policy.history.maxAgeDays=${user.history[key]} (only the admin policy may change ${base.history[key]})`);
			return base.history[key];
		}
		if (user.history[key] > base.history[key]) {
			refused.push(`enclawed.policy.history.${key}=${user.history[key]} (above ${base.history[key]})`);
			return base.history[key];
		}
		return user.history[key];
	};
	let maxOutputClearance = base.maxOutputClearance;
	if (raw.maxOutputClearance !== void 0) if (dominates(base.maxOutputClearance, user.maxOutputClearance)) maxOutputClearance = user.maxOutputClearance;
	else refused.push(`enclawed.policy.maxOutputClearance=${format(user.maxOutputClearance)} (above ${format(base.maxOutputClearance)})`);
	let defaultDataLabel = base.defaultDataLabel;
	if (raw.defaultDataLabel !== void 0) if (dominates(user.defaultDataLabel, base.defaultDataLabel)) defaultDataLabel = user.defaultDataLabel;
	else refused.push(`enclawed.policy.defaultDataLabel=${format(user.defaultDataLabel)} (below ${format(base.defaultDataLabel)})`);
	return {
		policy: createPolicy({
			enforceAllowlists: enforce,
			allowedChannels: list("allowedChannels"),
			allowedProviders: list("allowedProviders"),
			allowedTools: list("allowedTools"),
			allowedHosts: list("allowedHosts"),
			commandNetwork,
			preApprovedIrreversibleTools: intersect("preApprovedIrreversibleTools", base.preApprovedIrreversibleTools, user.preApprovedIrreversibleTools),
			scratchPaths: intersect("scratchPaths", base.scratchPaths, user.scratchPaths),
			history: {
				maxFileBytes: cap("maxFileBytes"),
				maxTotalBytes: cap("maxTotalBytes"),
				maxAgeDays: cap("maxAgeDays"),
				noHistoryPaths: [...new Set([...base.history.noHistoryPaths, ...user.history.noHistoryPaths])],
				noHistoryTools: new Set([...base.history.noHistoryTools, ...user.history.noHistoryTools])
			},
			maxOutputClearance,
			defaultDataLabel
		}),
		refused
	};
}
//#endregion
//#region src/enclawed/boot-posture.ts
function formatRefusal(r) {
	return `enclawed: REFUSED: ${r.setting} (from ${r.source}); it would loosen the deployment and only the admin policy (root-owned /etc/enclawed/policy.json or an org-signed policy) may do that. Recorded in the audit log.`;
}
/**
* FIPS requirement: option > admin policy > flavor default (on in enclaved);
* ENCLAWED_FIPS_REQUIRED may turn it on, never off.
*/
function resolveFipsRequirement(p) {
	if (p.optionValue !== void 0) return {
		required: p.optionValue,
		source: "option",
		refused: null
	};
	const adminValue = p.admin?.doc.fipsRequired;
	const base = adminValue ?? p.flavor === "enclaved";
	const baseSource = adminValue !== void 0 ? "admin-policy" : "flavor-default";
	const raw = p.env.ENCLAWED_FIPS_REQUIRED;
	if (raw === void 0 || raw.trim() === "") return {
		required: base,
		source: baseSource,
		refused: null
	};
	if (raw !== "0") return {
		required: true,
		source: base ? baseSource : "env",
		refused: null
	};
	if (base) return {
		required: true,
		source: baseSource,
		refused: {
			source: "ENCLAWED_FIPS_REQUIRED",
			setting: "ENCLAWED_FIPS_REQUIRED=0"
		}
	};
	return {
		required: false,
		source: baseSource,
		refused: null
	};
}
function flavorDefault(flavor) {
	return flavor === "enclaved" ? defaultEnclavedPolicy() : defaultOpenPolicy();
}
/**
* Policy: option > admin `policy` block (over the flavor default) > flavor
* default, with the user config's `enclawed.policy` block layered on top
* tighten-only. Exception: the open flavor without an admin policy keeps the
* historic behavior (the user block is authoritative) because the open flavor
* is not a security boundary unless an admin policy says otherwise.
*
* Throws (TypeError) on an invalid admin or user block; the caller decides
* whether that refuses startup.
*/
function resolveBootPolicy(p) {
	if (p.optionPolicy) return {
		policy: p.optionPolicy,
		source: "option",
		refused: []
	};
	const fallback = flavorDefault(p.flavor);
	const labels = {
		maxOutputClearance: fallback.maxOutputClearance,
		defaultDataLabel: fallback.defaultDataLabel,
		enforceAllowlists: fallback.enforceAllowlists
	};
	if (!p.admin && p.flavor === "open") {
		if (p.userBlock === void 0) return {
			policy: fallback,
			source: "flavor-default",
			refused: []
		};
		return {
			policy: parsePolicyJson(p.userBlock, labels),
			source: "user-config",
			refused: []
		};
	}
	const adminBlock = p.admin?.doc.policy;
	const { policy, refused } = tightenPolicy(adminBlock !== void 0 ? parsePolicyJson(adminBlock, labels) : fallback, p.userBlock);
	return {
		policy,
		source: adminBlock !== void 0 ? "admin-policy" : "flavor-default",
		refused: refused.map((setting) => ({
			source: "the user config file",
			setting
		}))
	};
}
/**
* In the enclaved flavor (and whenever the admin policy names a path) the
* audit log goes to the admin path or the system path: ENCLAWED_AUDIT_PATH and
* enclawed.audit.path are user-writable and could point the evidence anywhere
* (even /dev/null), so they are refused. A user-owned fallback is allowed only
* when the admin policy says `audit.allowUserFallback: true`.
*/
function resolveAuditPathInputs(p) {
	const adminPath = p.admin?.doc.audit?.path;
	const restricted = p.flavor === "enclaved" || adminPath !== void 0;
	const allowUserFallback = p.admin?.doc.audit?.allowUserFallback ?? p.flavor !== "enclaved";
	if (!restricted) return {
		optionPath: p.optionPath,
		adminPath,
		envPath: p.envPath,
		configPath: p.configPath,
		allowUserFallback,
		refused: []
	};
	const refused = [];
	const envPath = p.envPath?.trim() ? p.envPath : void 0;
	if (envPath) refused.push({
		source: "ENCLAWED_AUDIT_PATH",
		setting: `ENCLAWED_AUDIT_PATH=${envPath}`
	});
	if (p.configPath) refused.push({
		source: "the user config file",
		setting: `enclawed.audit.path=${p.configPath}`
	});
	return {
		optionPath: p.optionPath,
		adminPath,
		allowUserFallback,
		refused
	};
}
/**
* Loud, every-start warnings for an enclaved posture the admin chose to
* weaken. They are legitimate (root-owned policy), but never silent.
*/
function enclavedPostureWarnings(flavor, policy) {
	if (flavor !== "enclaved") return [];
	const out = [];
	if (!policy.enforceAllowlists) out.push("enclawed: WARNING: enclawed.policy.enforceAllowlists is false in the enclaved flavor: channel, provider, tool and host allowlists are NOT enforced. Set by the admin policy; recorded in the audit log.");
	if (policy.commandNetwork === "host") out.push("enclawed: WARNING: enclawed.policy.commandNetwork is \"host\" in the enclaved flavor: commands the model runs share the host network (no network cage). Set by the admin policy; recorded in the audit log.");
	return out;
}
/**
* Environment variables that relocate or switch off hardware-root evidence,
* latches and the device broker, or remove the bundled (security) plugin
* tree. They are user-writable, so in the enclaved flavor any value refuses
* startup (settings audit #7, #10-#13).
*/
const ENCLAVED_REFUSED_ENV_VARS = [
	"ENCLAWED_DISABLE_BUNDLED_PLUGINS",
	"ENCLAWEDER_STATE",
	"ENCLAWEDER_STATE_DIR",
	"ENCLAWEDER_FORENSIC_WEBHOOK",
	"ENCLAWEDER_FORENSIC_LOG",
	"ENCLAWEDER_AUDIT_PATH",
	"ENCLAWEDER_QUEUE_LOG"
];
/**
* Environment knobs refused at startup. In every flavor ENCLAWEDER_ROOT must
* parse strictly (see ./hardware-root/root-mode.ts). In the enclaved flavor
* the variables in ENCLAVED_REFUSED_ENV_VARS are refused whenever set,
* ENCLAWEDER_BROKER=off is refused (the socket-path form stays, it is checked
* for ownership), and ENCLAWEDER_ROOT=optional is refused unless the admin
* policy sets `allow.hardwareRootOptional: true` (device retirement), and
* ENCLAWED_BUNDLED_PLUGINS_DIR is refused unless it is the directory the
* admin policy names in `allow.bundledPluginsDir`.
* A non-empty result means bootstrap refuses to start.
*/
function findRefusedEnvKnobs(p) {
	const refused = [];
	let mode = null;
	try {
		mode = parseHardwareRootMode(p.env.ENCLAWEDER_ROOT);
	} catch (err) {
		refused.push({
			source: "ENCLAWEDER_ROOT",
			setting: err instanceof Error ? err.message : String(err)
		});
	}
	if (p.flavor !== "enclaved") return refused;
	for (const name of ENCLAVED_REFUSED_ENV_VARS) {
		const value = p.env[name];
		if (value !== void 0 && value !== "") refused.push({
			source: name,
			setting: `${name}=${value}`
		});
	}
	const broker = (p.env.ENCLAWEDER_BROKER ?? "").trim().toLowerCase();
	if (broker === "off" || broker === "0" || broker === "false") refused.push({
		source: "ENCLAWEDER_BROKER",
		setting: `ENCLAWEDER_BROKER=${p.env.ENCLAWEDER_BROKER}`
	});
	if (mode === "optional" && p.admin?.doc.allow?.hardwareRootOptional !== true) refused.push({
		source: "ENCLAWEDER_ROOT",
		setting: "ENCLAWEDER_ROOT=optional"
	});
	const bundledDir = p.env.ENCLAWED_BUNDLED_PLUGINS_DIR?.trim();
	if (bundledDir) {
		const allowed = p.admin?.doc.allow?.bundledPluginsDir;
		if (allowed === void 0 || path.resolve(bundledDir) !== path.resolve(allowed)) refused.push({
			source: "ENCLAWED_BUNDLED_PLUGINS_DIR",
			setting: `ENCLAWED_BUNDLED_PLUGINS_DIR=${bundledDir}`
		});
	}
	return refused;
}
//#endregion
export { resolveBootPolicy as a, extractPolicyBlock as c, resolveAuditPathInputs as i, loadPolicyFromJson as l, findRefusedEnvKnobs as n, resolveFipsRequirement as o, formatRefusal as r, tightenPolicy as s, enclavedPostureWarnings as t, parsePolicyJson as u };
