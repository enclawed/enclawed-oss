import { i as normalizeLowercaseStringOrEmpty, o as normalizeOptionalLowercaseString, s as normalizeOptionalString } from "./string-coerce-BUSzWgUA.js";
import "./sessions-D71lwKID.js";
import { t as loadSessionStore } from "./store-load-NgoHF_53.js";
import { r as getSessionBindingService } from "./session-binding-service-Cl5qdJHJ.js";
import { i as toAcpRuntimeError } from "./errors-CNt98fXd.js";
import { a as getAcpRuntimeBackend, n as getAcpSessionManager, s as requireAcpRuntimeBackend } from "./manager-3fLGPJ_h.js";
import { r as resolveSessionStorePathForAcp } from "./session-meta-B_1_OTUs.js";
import { t as formatAcpRuntimeErrorText } from "./error-text-YpPshIfQ.js";
import { C as stopWithText, E as resolveAcpCommandBindingContext, n as ACP_DOCTOR_USAGE, p as formatAcpCapabilitiesText, r as ACP_INSTALL_USAGE, s as ACP_SESSIONS_USAGE } from "./shared-BpFRj3wq.js";
import { r as resolveBundledPluginInstallCommandHint } from "./bundled-sources-zuOJzWs2.js";
import { n as resolveBoundAcpThreadSessionKey } from "./targets-C7aFaVMb.js";
import { existsSync } from "node:fs";
import path from "node:path";
//#region src/auto-reply/reply/commands-acp/install-hints.ts
function resolveAcpInstallCommandHint(cfg) {
	const configured = normalizeOptionalString(cfg.acp?.runtime?.installCommand);
	if (configured) return configured;
	const workspaceDir = process.cwd();
	const backendId = normalizeOptionalLowercaseString(cfg.acp?.backend) ?? "acpx";
	if (backendId === "acpx") {
		const workspaceLocalPath = path.join(workspaceDir, "extensions", "acpx");
		if (existsSync(workspaceLocalPath)) return `enclawed plugins install ${workspaceLocalPath}`;
		const bundledInstallHint = resolveBundledPluginInstallCommandHint({
			pluginId: backendId,
			workspaceDir
		});
		if (bundledInstallHint) {
			const localPath = bundledInstallHint.replace(/^enclawed plugins install /u, "");
			const resolvedLocalPath = path.resolve(localPath);
			const relativeToWorkspace = path.relative(workspaceDir, resolvedLocalPath);
			if ((relativeToWorkspace.length === 0 || !relativeToWorkspace.startsWith("..") && !path.isAbsolute(relativeToWorkspace)) && existsSync(resolvedLocalPath)) return bundledInstallHint;
		}
		return "enclawed plugins install acpx";
	}
	return `Install and enable the plugin that provides ACP backend "${backendId}".`;
}
//#endregion
//#region src/auto-reply/reply/commands-acp/diagnostics.ts
async function handleAcpDoctorAction(params, restTokens) {
	if (restTokens.length > 0) return stopWithText(`⚠️ ${ACP_DOCTOR_USAGE}`);
	const backendId = normalizeOptionalString(params.cfg.acp?.backend) ?? "acpx";
	const installHint = resolveAcpInstallCommandHint(params.cfg);
	const registeredBackend = getAcpRuntimeBackend(backendId);
	const managerSnapshot = getAcpSessionManager().getObservabilitySnapshot(params.cfg);
	const lines = [
		"ACP doctor:",
		"-----",
		`configuredBackend: ${backendId}`
	];
	lines.push(`activeRuntimeSessions: ${managerSnapshot.runtimeCache.activeSessions}`);
	lines.push(`runtimeIdleTtlMs: ${managerSnapshot.runtimeCache.idleTtlMs}`);
	lines.push(`evictedIdleRuntimes: ${managerSnapshot.runtimeCache.evictedTotal}`);
	lines.push(`activeTurns: ${managerSnapshot.turns.active}`);
	lines.push(`queueDepth: ${managerSnapshot.turns.queueDepth}`);
	lines.push(`turnLatencyMs: avg=${managerSnapshot.turns.averageLatencyMs}, max=${managerSnapshot.turns.maxLatencyMs}`);
	lines.push(`turnCounts: completed=${managerSnapshot.turns.completed}, failed=${managerSnapshot.turns.failed}`);
	const errorStatsText = Object.entries(managerSnapshot.errorsByCode).map(([code, count]) => `${code}=${count}`).join(", ") || "(none)";
	lines.push(`errorCodes: ${errorStatsText}`);
	if (registeredBackend) lines.push(`registeredBackend: ${registeredBackend.id}`);
	else lines.push("registeredBackend: (none)");
	if (registeredBackend?.runtime.doctor) try {
		const report = await registeredBackend.runtime.doctor();
		lines.push(`runtimeDoctor: ${report.ok ? "ok" : "error"} (${report.message})`);
		if (report.code) lines.push(`runtimeDoctorCode: ${report.code}`);
		if (report.installCommand) lines.push(`runtimeDoctorInstall: ${report.installCommand}`);
		for (const detail of report.details ?? []) lines.push(`runtimeDoctorDetail: ${detail}`);
	} catch (error) {
		lines.push(`runtimeDoctor: error (${toAcpRuntimeError({
			error,
			fallbackCode: "ACP_TURN_FAILED",
			fallbackMessage: "Runtime doctor failed."
		}).message})`);
	}
	try {
		const backend = requireAcpRuntimeBackend(backendId);
		const capabilities = backend.runtime.getCapabilities ? await backend.runtime.getCapabilities({}) : {
			controls: [],
			configOptionKeys: []
		};
		lines.push("healthy: yes");
		lines.push(`capabilities: ${formatAcpCapabilitiesText(capabilities.controls ?? [])}`);
		if ((capabilities.configOptionKeys?.length ?? 0) > 0) lines.push(`configKeys: ${capabilities.configOptionKeys?.join(", ")}`);
		return stopWithText(lines.join("\n"));
	} catch (error) {
		const acpError = toAcpRuntimeError({
			error,
			fallbackCode: "ACP_TURN_FAILED",
			fallbackMessage: "ACP backend doctor failed."
		});
		lines.push("healthy: no");
		lines.push(formatAcpRuntimeErrorText(acpError));
		lines.push(`next: ${installHint}`);
		lines.push(`next: enclawed config set plugins.entries.${backendId}.enabled true`);
		if (normalizeLowercaseStringOrEmpty(backendId) === "acpx") lines.push("next: verify acpx is installed (`acpx --help`).");
		return stopWithText(lines.join("\n"));
	}
}
function handleAcpInstallAction(params, restTokens) {
	if (restTokens.length > 0) return stopWithText(`⚠️ ${ACP_INSTALL_USAGE}`);
	const backendId = normalizeOptionalString(params.cfg.acp?.backend) ?? "acpx";
	const installHint = resolveAcpInstallCommandHint(params.cfg);
	return stopWithText([
		"ACP install:",
		"-----",
		`configuredBackend: ${backendId}`,
		`run: ${installHint}`,
		`then: enclawed config set plugins.entries.${backendId}.enabled true`,
		"then: /acp doctor"
	].join("\n"));
}
function formatAcpSessionLine(params) {
	const acp = params.entry.acp;
	if (!acp) return "";
	const marker = params.currentSessionKey === params.key ? "*" : " ";
	const label = normalizeOptionalString(params.entry.label) || acp.agent;
	const threadText = params.threadId ? `, thread:${params.threadId}` : "";
	return `${marker} ${label} (${acp.mode}, ${acp.state}, backend:${acp.backend}${threadText}) -> ${params.key}`;
}
function handleAcpSessionsAction(params, restTokens) {
	if (restTokens.length > 0) return stopWithText(ACP_SESSIONS_USAGE);
	const currentSessionKey = resolveBoundAcpThreadSessionKey(params) || params.sessionKey;
	if (!currentSessionKey) return stopWithText("⚠️ Missing session key.");
	const { storePath } = resolveSessionStorePathForAcp({
		cfg: params.cfg,
		sessionKey: currentSessionKey
	});
	let store;
	try {
		store = loadSessionStore(storePath);
	} catch {
		store = {};
	}
	const bindingContext = resolveAcpCommandBindingContext(params);
	const normalizedChannel = bindingContext.channel;
	const normalizedAccountId = bindingContext.accountId || void 0;
	const bindingService = getSessionBindingService();
	const rows = Object.entries(store).filter(([, entry]) => Boolean(entry?.acp)).toSorted(([, a], [, b]) => (b?.updatedAt ?? 0) - (a?.updatedAt ?? 0)).slice(0, 20).map(([key, entry]) => {
		const bindingThreadId = bindingService.listBySession(key).find((binding) => (!normalizedChannel || binding.conversation.channel === normalizedChannel) && (!normalizedAccountId || binding.conversation.accountId === normalizedAccountId))?.conversation.conversationId;
		return formatAcpSessionLine({
			key,
			entry,
			currentSessionKey,
			threadId: bindingThreadId
		});
	}).filter(Boolean);
	if (rows.length === 0) return stopWithText("ACP sessions:\n-----\n(none)");
	return stopWithText([
		"ACP sessions:",
		"-----",
		...rows
	].join("\n"));
}
//#endregion
export { handleAcpDoctorAction, handleAcpInstallAction, handleAcpSessionsAction };
