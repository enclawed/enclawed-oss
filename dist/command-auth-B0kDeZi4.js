import { i as normalizeLowercaseStringOrEmpty } from "./string-coerce-BUSzWgUA.js";
import "./command-registration-BrZ550Sp.js";
import "./command-detection-NsqHQ9n5.js";
import "./commands-registry-iu6F5JHJ.js";
import { o as resolveDmGroupAccessWithLists } from "./dm-policy-shared-B7zI6pKu.js";
import "./command-auth-DX6z69Mp.js";
import "./stored-model-override-tFHPk8pk.js";
import { n as buildCommandsMessagePaginated$1, r as buildHelpMessage$1, t as buildCommandsMessage$1 } from "./command-status-builders-BtlJ4gFP.js";
import "./direct-dm-Cm7TOc9z.js";
import "./skill-commands-sj5SeOu4.js";
import "./commands-models-5AKatbe7.js";
//#region src/plugin-sdk/telegram-command-ui.ts
function buildCommandsPaginationKeyboard(currentPage, totalPages, agentId) {
	const buttons = [];
	const suffix = agentId ? `:${agentId}` : "";
	if (currentPage > 1) buttons.push({
		text: "◀ Prev",
		callback_data: `commands_page_${currentPage - 1}${suffix}`
	});
	buttons.push({
		text: `${currentPage}/${totalPages}`,
		callback_data: `commands_page_noop${suffix}`
	});
	if (currentPage < totalPages) buttons.push({
		text: "Next ▶",
		callback_data: `commands_page_${currentPage + 1}${suffix}`
	});
	return [buttons];
}
//#endregion
//#region src/channels/native-command-session-targets.ts
function resolveNativeCommandSessionTargets(params) {
	const rawSessionKey = params.boundSessionKey ?? `agent:${params.agentId}:${params.sessionPrefix}:${params.userId}`;
	return {
		sessionKey: params.lowercaseSessionKey ? normalizeLowercaseStringOrEmpty(rawSessionKey) : rawSessionKey,
		commandTargetSessionKey: params.boundSessionKey ?? params.targetSessionKey
	};
}
//#endregion
//#region src/plugin-sdk/command-auth.ts
/** Fast-path DM command authorization when only policy and sender allowlist state matter. */
function resolveDirectDmAuthorizationOutcome(params) {
	if (params.isGroup) return "allowed";
	if (params.dmPolicy === "disabled") return "disabled";
	if (params.dmPolicy !== "open" && !params.senderAllowedForCommands) return "unauthorized";
	return "allowed";
}
/** Runtime-backed wrapper around sender command authorization for grouped helper surfaces. */
async function resolveSenderCommandAuthorizationWithRuntime(params) {
	return resolveSenderCommandAuthorization({
		...params,
		shouldComputeCommandAuthorized: params.runtime.shouldComputeCommandAuthorized,
		resolveCommandAuthorizedFromAuthorizers: params.runtime.resolveCommandAuthorizedFromAuthorizers
	});
}
/** Compute effective allowlists and command authorization for one inbound sender. */
async function resolveSenderCommandAuthorization(params) {
	const shouldComputeAuth = params.shouldComputeCommandAuthorized(params.rawBody, params.cfg);
	const storeAllowFrom = !params.isGroup && params.dmPolicy !== "allowlist" && (params.dmPolicy !== "open" || shouldComputeAuth) ? await params.readAllowFromStore().catch(() => []) : [];
	const access = resolveDmGroupAccessWithLists({
		isGroup: params.isGroup,
		dmPolicy: params.dmPolicy,
		groupPolicy: "allowlist",
		allowFrom: params.configuredAllowFrom,
		groupAllowFrom: params.configuredGroupAllowFrom ?? [],
		storeAllowFrom,
		isSenderAllowed: (allowFrom) => params.isSenderAllowed(params.senderId, allowFrom)
	});
	const effectiveAllowFrom = access.effectiveAllowFrom;
	const effectiveGroupAllowFrom = access.effectiveGroupAllowFrom;
	const useAccessGroups = params.cfg.commands?.useAccessGroups !== false;
	const senderAllowedForCommands = params.isSenderAllowed(params.senderId, params.isGroup ? effectiveGroupAllowFrom : effectiveAllowFrom);
	const ownerAllowedForCommands = params.isSenderAllowed(params.senderId, effectiveAllowFrom);
	const groupAllowedForCommands = params.isSenderAllowed(params.senderId, effectiveGroupAllowFrom);
	return {
		shouldComputeAuth,
		effectiveAllowFrom,
		effectiveGroupAllowFrom,
		senderAllowedForCommands,
		commandAuthorized: shouldComputeAuth ? params.resolveCommandAuthorizedFromAuthorizers({
			useAccessGroups,
			authorizers: [{
				configured: effectiveAllowFrom.length > 0,
				allowed: ownerAllowedForCommands
			}, {
				configured: effectiveGroupAllowFrom.length > 0,
				allowed: groupAllowedForCommands
			}]
		}) : void 0
	};
}
/** @deprecated Use `@enclawed/plugin-sdk/command-status` instead. */
function buildCommandsMessage(...args) {
	return buildCommandsMessage$1(...args);
}
/** @deprecated Use `@enclawed/plugin-sdk/command-status` instead. */
function buildCommandsMessagePaginated(...args) {
	return buildCommandsMessagePaginated$1(...args);
}
/** @deprecated Use `@enclawed/plugin-sdk/command-status` instead. */
function buildHelpMessage(...args) {
	return buildHelpMessage$1(...args);
}
//#endregion
export { resolveSenderCommandAuthorization as a, buildCommandsPaginationKeyboard as c, resolveDirectDmAuthorizationOutcome as i, buildCommandsMessagePaginated as n, resolveSenderCommandAuthorizationWithRuntime as o, buildHelpMessage as r, resolveNativeCommandSessionTargets as s, buildCommandsMessage as t };
