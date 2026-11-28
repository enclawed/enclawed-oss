import { n as getRuntime } from "./runtime-Dt7e6nAN.js";
import { a as adminAllowsGatewayAuthNone, i as adminAllowsDangerousFlag, t as getFlavor } from "./flavor-CPDBgn8D.js";
import { t as collectEnabledInsecureOrDangerousFlags } from "./dangerous-config-flags-CireJapA.js";
//#region src/plugins/security-stage.ts
/**
* A security-stage plugin (manifest `securityStage`, or one a security profile
* enables by default) failed validation, load or registration. Skipping it
* would leave the gateway running without that defense, so start is refused.
*/
var PluginSecurityStageError = class extends Error {
	constructor(failed) {
		const summary = failed.map((entry) => `${entry.id}: ${entry.error ?? "unknown plugin load error"}`).join("; ");
		super(`refusing to start: security plugin(s) failed to load (${summary}). Fix plugins.entries.<id>.config (see \`enclawed config validate\`) or the plugin install; a security stage is never skipped.`);
		this.name = "PluginSecurityStageError";
		this.pluginIds = failed.map((entry) => entry.id);
	}
};
/** Throws {@link PluginSecurityStageError} when any security-stage plugin is in error. */
function assertSecurityStagePluginsLoaded(registry) {
	const failed = registry.plugins.filter((entry) => entry.securityStage === true && entry.status === "error");
	if (failed.length > 0) throw new PluginSecurityStageError(failed);
}
//#endregion
//#region src/security/enclaved-escape-hatches.ts
const ESCAPE_HATCH_KEY = /^(dangerously[A-Z]\w*|allowInsecure\w*|allowUnsafe\w*)$/;
/**
* Weakening settings whose key name does not match ESCAPE_HATCH_KEY (settings
* audit X3). Matched by key name anywhere in the tree, with the exact
* weakening value; the safe value and an absent key are never refused.
*/
const WEAKENING_KEYS = new Map([
	["insecureSkipVerify", true],
	["allowPrivateNetwork", true],
	["allowRfc2544BenchmarkRange", true],
	["strictHostKeyChecking", false],
	["skipSignatureVerification", true],
	["allowNgrokFreeTierLoopbackBypass", true],
	["trustForwardingHeaders", true],
	["allowRealIpFallback", true],
	["allowPrivateMemoryCoreAccess", true],
	["allowRemoteViewer", true]
]);
/**
* Weakening settings matched by the end of their path, so the per-agent
* copies (`agents.list[i].tools.exec.security`, ...) are refused as well.
*/
const WEAKENING_PATH_SUFFIXES = [
	["tools.exec.security", "full"],
	["tools.exec.ask", "off"],
	["tools.exec.askFallback", "full"],
	["tools.exec.strictInlineEval", false],
	["tools.elevated.enabled", true],
	["tools.fs.workspaceOnly", false]
];
/** Weakening settings at one exact path from the config root. */
const WEAKENING_EXACT_PATHS = [
	["logging.redactSensitive", "off"],
	["enclawed.hpc.enforce", false],
	["gateway.auth.rateLimit.exemptLoopback", true]
];
/** Drop array indices so `agents.list[3].tools.exec.ask` ends in `tools.exec.ask`. */
function pathWithoutIndices(path) {
	return path.replace(/\[\d+\]/g, "");
}
function isWeakeningSetting(key, path, value) {
	if (WEAKENING_KEYS.has(key) && Object.is(WEAKENING_KEYS.get(key), value)) return true;
	const bare = pathWithoutIndices(path);
	for (const [suffix, bad] of WEAKENING_PATH_SUFFIXES) if ((bare === suffix || bare.endsWith(`.${suffix}`)) && Object.is(bad, value)) return true;
	for (const [exact, bad] of WEAKENING_EXACT_PATHS) if (bare === exact && Object.is(bad, value)) return true;
	return false;
}
function renderValue(value) {
	return typeof value === "string" ? value : String(value);
}
function walkEscapeHatches(node, path, out, depth) {
	if (depth > 32 || node === null || typeof node !== "object") return;
	if (Array.isArray(node)) {
		node.forEach((child, index) => walkEscapeHatches(child, `${path}[${index}]`, out, depth + 1));
		return;
	}
	for (const [key, value] of Object.entries(node)) {
		const childPath = path ? `${path}.${key}` : key;
		if (value === true && ESCAPE_HATCH_KEY.test(key)) {
			out.add(`${childPath}=true`);
			continue;
		}
		if (isWeakeningSetting(key, childPath, value)) {
			out.add(`${childPath}=${renderValue(value)}`);
			continue;
		}
		walkEscapeHatches(value, childPath, out, depth + 1);
	}
}
/**
* Every escape hatch set in `cfg`, rendered as `path=value` (sorted). Combines
* the curated list (including plugin-declared dangerous flags) with a generic
* walk for `dangerously*` / `allowInsecure*` / `allowUnsafe*` keys set to true.
*/
function collectConfigEscapeHatches(cfg) {
	const out = new Set(collectEnabledInsecureOrDangerousFlags(cfg));
	walkEscapeHatches(cfg, "", out, 0);
	return [...out].toSorted();
}
/** The admin allow-list key for a rendered flag: its path without `=value`. */
function escapeHatchKey(rendered) {
	const eq = rendered.indexOf("=");
	return eq === -1 ? rendered : rendered.slice(0, eq);
}
/**
* Escape hatches the enclaved flavor refuses for this config (empty in the
* open flavor, or when the admin policy allows each one).
*/
function findRefusedEscapeHatches(cfg, opts = {}) {
	if ((opts.flavor ?? getRuntime()?.flavor ?? getFlavor()) !== "enclaved") return [];
	const refused = [];
	for (const flag of collectConfigEscapeHatches(cfg)) if (!adminAllowsDangerousFlag(escapeHatchKey(flag))) refused.push({
		flag,
		reason: "escape-hatch flags are admin-only in the enclaved flavor"
	});
	if ((opts.authMode ?? cfg.gateway?.auth?.mode) === "none" && !adminAllowsGatewayAuthNone()) refused.push({
		flag: "gateway.auth.mode=none",
		reason: "an unauthenticated gateway is admin-only in the enclaved flavor"
	});
	return refused;
}
var EnclavedEscapeHatchError = class extends Error {
	constructor(refused, context) {
		super(`enclaved flavor: refusing ${context}: ${refused.map((r) => r.flag).join(", ")} (remove the setting, or allow it in the admin policy /etc/enclawed/policy.json under "allow.dangerousConfigFlags" / "allow.gatewayAuthNone")`);
		this.name = "EnclavedEscapeHatchError";
		this.refused = refused;
	}
};
/**
* Throw EnclavedEscapeHatchError when the enclaved flavor refuses any escape
* hatch in `cfg`. Each refusal goes to stderr and to the audit log.
*/
function assertEnclavedEscapeHatchesAllowed(cfg, opts = {}) {
	const refused = findRefusedEscapeHatches(cfg, opts);
	if (refused.length === 0) return;
	const context = opts.context ?? "gateway start";
	for (const r of refused) process.stderr.write(`enclawed: refused ${r.flag} (${context}): ${r.reason}\n`);
	const audit = getRuntime()?.audit;
	if (audit) audit.append({
		type: "enclawed.escape-hatch.refused",
		actor: "process",
		level: null,
		payload: {
			context,
			refused: refused.map((r) => r.flag)
		}
	}).catch(() => {});
	throw new EnclavedEscapeHatchError(refused, context);
}
//#endregion
export { findRefusedEscapeHatches as n, assertSecurityStagePluginsLoaded as r, assertEnclavedEscapeHatchesAllowed as t };
