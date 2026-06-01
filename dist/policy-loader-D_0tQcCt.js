import { c as makeLabel, l as parse, r as createPolicy } from "./policy-wE3FfoUy.js";
//#region src/enclawed/policy-loader.ts
function isStringArray(v) {
	return Array.isArray(v) && v.every((x) => typeof x === "string");
}
function parseLabel(input, fieldName) {
	if (typeof input === "string") return parse(input);
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
		"allowedTools"
	]) {
		const value = cfg[key];
		if (value !== void 0 && !isStringArray(value)) throw new TypeError(`enclawed.policy.${key} must be a string array`);
	}
	if (cfg.enforceAllowlists !== void 0 && typeof cfg.enforceAllowlists !== "boolean") throw new TypeError("enclawed.policy.enforceAllowlists must be a boolean");
	const maxOutputClearance = cfg.maxOutputClearance !== void 0 ? parseLabel(cfg.maxOutputClearance, "enclawed.policy.maxOutputClearance") : defaults.maxOutputClearance;
	const defaultDataLabel = cfg.defaultDataLabel !== void 0 ? parseLabel(cfg.defaultDataLabel, "enclawed.policy.defaultDataLabel") : defaults.defaultDataLabel;
	return createPolicy({
		enforceAllowlists: cfg.enforceAllowlists ?? defaults.enforceAllowlists ?? true,
		allowedChannels: cfg.allowedChannels,
		allowedProviders: cfg.allowedProviders,
		allowedTools: cfg.allowedTools,
		allowedHosts: cfg.allowedHosts,
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
export { loadPolicyFromJson as t };
