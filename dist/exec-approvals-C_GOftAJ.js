import { i as normalizeLowercaseStringOrEmpty, s as normalizeOptionalString } from "./string-coerce-BUSzWgUA.js";
import { n as normalizeAccountId } from "./account-id-BV5xNTUp.js";
import "./text-runtime-CAI4yT_W.js";
import "./routing-Cs1E5kjm.js";
import { t as resolveApprovalApprovers } from "./approval-approvers-lm6t_PZT.js";
import { t as matchesApprovalRequestFilters } from "./approval-request-filters-saH_q6zI.js";
import { n as isChannelExecApprovalClientEnabledFromConfig, r as isChannelExecApprovalTargetRecipient, t as createChannelExecApprovalProfile } from "./approval-client-helpers-8goGntsm.js";
import "./approval-client-runtime-C9E4H_3L.js";
import { s as resolveApprovalRequestChannelAccountId } from "./exec-approval-session-target-CN1Mvdh8.js";
import "./approval-native-runtime-Dxwwp1fR.js";
import { o as resolveTelegramAccount, r as listTelegramAccountIds } from "./accounts-CAk0pc6z.js";
import { vt as normalizeTelegramChatId, xt as resolveTelegramTargetChatType } from "./send-CLXL5Hjy.js";
import { n as resolveTelegramInlineButtonsConfigScope } from "./inline-buttons-Cm2IN4OA.js";
//#region extensions/telegram/src/exec-approvals.ts
function normalizeApproverId(value) {
	return normalizeOptionalString(String(value)) ?? "";
}
function normalizeTelegramDirectApproverId(value) {
	const chatId = normalizeTelegramChatId(normalizeApproverId(value));
	if (!chatId || chatId.startsWith("-")) return;
	return chatId;
}
function resolveTelegramOwnerApprovers(cfg) {
	const ownerAllowFrom = cfg.commands?.ownerAllowFrom;
	return Array.isArray(ownerAllowFrom) ? ownerAllowFrom : [];
}
function resolveTelegramExecApprovalConfig(params) {
	const account = resolveTelegramAccount(params);
	const config = account.config.execApprovals;
	const enabled = account.enabled && account.tokenSource !== "none" ? config?.enabled ?? "auto" : false;
	return {
		...config,
		enabled
	};
}
function getTelegramExecApprovalApprovers(params) {
	return resolveApprovalApprovers({
		explicit: resolveTelegramExecApprovalConfig(params)?.approvers,
		allowFrom: resolveTelegramOwnerApprovers(params.cfg),
		normalizeApprover: normalizeTelegramDirectApproverId
	});
}
function isTelegramExecApprovalTargetRecipient(params) {
	return isChannelExecApprovalTargetRecipient({
		...params,
		channel: "telegram",
		matchTarget: ({ target, normalizedSenderId }) => {
			const to = target.to ? normalizeTelegramChatId(target.to) : void 0;
			if (!to || to.startsWith("-")) return false;
			return to === normalizedSenderId;
		}
	});
}
function countTelegramExecApprovalEligibleAccounts(params) {
	return listTelegramAccountIds(params.cfg).filter((accountId) => {
		const account = resolveTelegramAccount({
			cfg: params.cfg,
			accountId
		});
		if (!account.enabled || account.tokenSource === "none") return false;
		const config = resolveTelegramExecApprovalConfig({
			cfg: params.cfg,
			accountId
		});
		return isChannelExecApprovalClientEnabledFromConfig({
			enabled: config?.enabled,
			approverCount: getTelegramExecApprovalApprovers({
				cfg: params.cfg,
				accountId
			}).length
		}) && matchesApprovalRequestFilters({
			request: params.request.request,
			agentFilter: config?.agentFilter,
			sessionFilter: config?.sessionFilter,
			fallbackAgentIdFromSessionKey: true
		});
	}).length;
}
function isExecApprovalRequest(request) {
	return "command" in request.request;
}
function isTargetForwardingMode(mode) {
	return mode === "targets" || mode === "both";
}
function matchesExplicitTelegramForwardTargetAccount(params) {
	const forwardingConfig = isExecApprovalRequest(params.request) ? params.cfg.approvals?.exec : params.cfg.approvals?.plugin;
	if (!forwardingConfig?.enabled || !isTargetForwardingMode(forwardingConfig.mode)) return;
	const telegramTargets = (forwardingConfig.targets ?? []).filter((target) => normalizeLowercaseStringOrEmpty(target.channel) === "telegram");
	if (telegramTargets.some((target) => !normalizeOptionalString(target.accountId))) return;
	const scopedTelegramAccountIds = telegramTargets.map((target) => normalizeOptionalString(target.accountId)).filter((accountId) => Boolean(accountId));
	if (scopedTelegramAccountIds.length === 0) return;
	const normalizedAccountId = params.accountId ? normalizeAccountId(params.accountId) : "";
	return Boolean(normalizedAccountId) && scopedTelegramAccountIds.some((accountId) => normalizeAccountId(accountId) === normalizedAccountId);
}
function matchesTelegramRequestAccount(params) {
	const explicitTargetMatch = matchesExplicitTelegramForwardTargetAccount(params);
	if (explicitTargetMatch !== void 0) return explicitTargetMatch;
	const turnSourceChannel = normalizeLowercaseStringOrEmpty(params.request.request.turnSourceChannel);
	const boundAccountId = resolveApprovalRequestChannelAccountId({
		cfg: params.cfg,
		request: params.request,
		channel: "telegram"
	});
	if (turnSourceChannel && turnSourceChannel !== "telegram" && !boundAccountId) return countTelegramExecApprovalEligibleAccounts({
		cfg: params.cfg,
		request: params.request
	}) <= 1;
	return !boundAccountId || !params.accountId || normalizeAccountId(boundAccountId) === normalizeAccountId(params.accountId);
}
const telegramExecApprovalProfile = createChannelExecApprovalProfile({
	resolveConfig: resolveTelegramExecApprovalConfig,
	resolveApprovers: getTelegramExecApprovalApprovers,
	isTargetRecipient: isTelegramExecApprovalTargetRecipient,
	matchesRequestAccount: matchesTelegramRequestAccount,
	fallbackAgentIdFromSessionKey: true,
	requireClientEnabledForLocalPromptSuppression: false
});
const isTelegramExecApprovalClientEnabled = telegramExecApprovalProfile.isClientEnabled;
const isTelegramExecApprovalApprover = telegramExecApprovalProfile.isApprover;
const isTelegramExecApprovalAuthorizedSender = telegramExecApprovalProfile.isAuthorizedSender;
const resolveTelegramExecApprovalTarget = telegramExecApprovalProfile.resolveTarget;
const shouldHandleTelegramExecApprovalRequest = telegramExecApprovalProfile.shouldHandleRequest;
function shouldInjectTelegramExecApprovalButtons(params) {
	if (!isTelegramExecApprovalClientEnabled(params)) return false;
	const target = resolveTelegramExecApprovalTarget(params);
	const chatType = resolveTelegramTargetChatType(params.to);
	if (chatType === "direct") return target === "dm" || target === "both";
	if (chatType === "group") return target === "channel" || target === "both";
	return target === "both";
}
function resolveExecApprovalButtonsExplicitlyDisabled(params) {
	const capabilities = resolveTelegramAccount(params).config.capabilities;
	return resolveTelegramInlineButtonsConfigScope(capabilities) === "off";
}
function shouldEnableTelegramExecApprovalButtons(params) {
	if (!shouldInjectTelegramExecApprovalButtons(params)) return false;
	return !resolveExecApprovalButtonsExplicitlyDisabled(params);
}
function shouldSuppressLocalTelegramExecApprovalPrompt(params) {
	return telegramExecApprovalProfile.shouldSuppressLocalPrompt(params);
}
function isTelegramExecApprovalHandlerConfigured(params) {
	return isChannelExecApprovalClientEnabledFromConfig({
		enabled: resolveTelegramExecApprovalConfig(params)?.enabled,
		approverCount: getTelegramExecApprovalApprovers(params).length
	});
}
//#endregion
export { isTelegramExecApprovalHandlerConfigured as a, resolveTelegramExecApprovalTarget as c, shouldInjectTelegramExecApprovalButtons as d, shouldSuppressLocalTelegramExecApprovalPrompt as f, isTelegramExecApprovalClientEnabled as i, shouldEnableTelegramExecApprovalButtons as l, isTelegramExecApprovalApprover as n, isTelegramExecApprovalTargetRecipient as o, isTelegramExecApprovalAuthorizedSender as r, resolveTelegramExecApprovalConfig as s, getTelegramExecApprovalApprovers as t, shouldHandleTelegramExecApprovalRequest as u };
