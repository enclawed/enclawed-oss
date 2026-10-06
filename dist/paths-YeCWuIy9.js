import { i as normalizeLowercaseStringOrEmpty, s as normalizeOptionalString } from "./string-coerce-BUSzWgUA.js";
import path from "node:path";
//#region src/daemon/constants.ts
const GATEWAY_LAUNCH_AGENT_LABEL = "ai.enclawed.gateway";
const GATEWAY_SYSTEMD_SERVICE_NAME = "enclawed-gateway";
const GATEWAY_WINDOWS_TASK_NAME = "Enclawed Gateway";
const GATEWAY_SERVICE_MARKER = "enclawed";
const GATEWAY_SERVICE_KIND = "gateway";
const NODE_LAUNCH_AGENT_LABEL = "ai.enclawed.node";
const NODE_SYSTEMD_SERVICE_NAME = "enclawed-node";
const NODE_WINDOWS_TASK_NAME = "Enclawed Node";
const NODE_SERVICE_MARKER = "enclawed";
const NODE_SERVICE_KIND = "node";
const NODE_WINDOWS_TASK_SCRIPT_NAME = "node.cmd";
/**
* Legacy systemd unit names we still detect during boot. As with the
* launch-agent labels above, this is detection-only; the operator must run
* the migration command (TBD follow-up task) to stop the old unit, remove
* the unit file, and install the new "enclawed-gateway" unit. The
* pre-existing "clawdbot-gateway" entry stays in this list.
*/
const LEGACY_GATEWAY_SYSTEMD_SERVICE_NAMES = ["openclaw-gateway", "clawdbot-gateway"];
function normalizeGatewayProfile(profile) {
	const trimmed = profile?.trim();
	if (!trimmed || normalizeLowercaseStringOrEmpty(trimmed) === "default") return null;
	return trimmed;
}
function resolveGatewayProfileSuffix(profile) {
	const normalized = normalizeGatewayProfile(profile);
	return normalized ? `-${normalized}` : "";
}
function resolveGatewayLaunchAgentLabel(profile) {
	const normalized = normalizeGatewayProfile(profile);
	if (!normalized) return GATEWAY_LAUNCH_AGENT_LABEL;
	return `ai.enclawed.${normalized}`;
}
function resolveLegacyGatewayLaunchAgentLabels(profile) {
	return [];
}
function resolveGatewaySystemdServiceName(profile) {
	const suffix = resolveGatewayProfileSuffix(profile);
	if (!suffix) return GATEWAY_SYSTEMD_SERVICE_NAME;
	return `enclawed-gateway${suffix}`;
}
function resolveGatewayWindowsTaskName(profile) {
	const normalized = normalizeGatewayProfile(profile);
	if (!normalized) return GATEWAY_WINDOWS_TASK_NAME;
	return `Enclawed Gateway (${normalized})`;
}
function formatGatewayServiceDescription(params) {
	const profile = normalizeGatewayProfile(params?.profile);
	const version = params?.version?.trim();
	const parts = [];
	if (profile) parts.push(`profile: ${profile}`);
	if (version) parts.push(`v${version}`);
	if (parts.length === 0) return "Enclawed Gateway";
	return `Enclawed Gateway (${parts.join(", ")})`;
}
function resolveGatewayServiceDescription(params) {
	return params.description ?? formatGatewayServiceDescription({
		profile: params.env.ENCLAWED_PROFILE,
		version: params.environment?.ENCLAWED_SERVICE_VERSION ?? params.env.ENCLAWED_SERVICE_VERSION
	});
}
function resolveNodeLaunchAgentLabel() {
	return NODE_LAUNCH_AGENT_LABEL;
}
function resolveNodeSystemdServiceName() {
	return NODE_SYSTEMD_SERVICE_NAME;
}
function resolveNodeWindowsTaskName() {
	return NODE_WINDOWS_TASK_NAME;
}
function formatNodeServiceDescription(params) {
	const version = params?.version?.trim();
	if (!version) return "Enclawed Node Host";
	return `Enclawed Node Host (v${version})`;
}
//#endregion
//#region src/daemon/paths.ts
const windowsAbsolutePath = /^[a-zA-Z]:[\\/]/;
const windowsUncPath = /^\\\\/;
function resolveHomeDir(env) {
	const home = normalizeOptionalString(env.HOME) || normalizeOptionalString(env.USERPROFILE);
	if (!home) throw new Error("Missing HOME");
	return home;
}
function resolveUserPathWithHome(input, home) {
	const trimmed = input.trim();
	if (!trimmed) return trimmed;
	if (trimmed.startsWith("~")) {
		if (!home) throw new Error("Missing HOME");
		const expanded = trimmed.replace(/^~(?=$|[\\/])/, home);
		return path.resolve(expanded);
	}
	if (windowsAbsolutePath.test(trimmed) || windowsUncPath.test(trimmed)) return trimmed;
	return path.resolve(trimmed);
}
function resolveGatewayStateDir(env) {
	const override = normalizeOptionalString(env.ENCLAWED_STATE_DIR);
	if (override) return resolveUserPathWithHome(override, override.startsWith("~") ? resolveHomeDir(env) : void 0);
	const home = resolveHomeDir(env);
	const suffix = resolveGatewayProfileSuffix(env.ENCLAWED_PROFILE);
	return path.join(home, `.enclawed${suffix}`);
}
//#endregion
export { resolveNodeSystemdServiceName as _, GATEWAY_SERVICE_MARKER as a, NODE_SERVICE_MARKER as c, resolveGatewayLaunchAgentLabel as d, resolveGatewayServiceDescription as f, resolveNodeLaunchAgentLabel as g, resolveLegacyGatewayLaunchAgentLabels as h, GATEWAY_SERVICE_KIND as i, NODE_WINDOWS_TASK_SCRIPT_NAME as l, resolveGatewayWindowsTaskName as m, resolveHomeDir as n, LEGACY_GATEWAY_SYSTEMD_SERVICE_NAMES as o, resolveGatewaySystemdServiceName as p, GATEWAY_LAUNCH_AGENT_LABEL as r, NODE_SERVICE_KIND as s, resolveGatewayStateDir as t, formatNodeServiceDescription as u, resolveNodeWindowsTaskName as v };
