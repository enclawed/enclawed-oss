import { s as normalizeOptionalString } from "./string-coerce-BUSzWgUA.js";
import { n as getBundledChannelPlugin } from "./bundled-CPcF5CPE.js";
import { n as normalizeAccountId, t as DEFAULT_ACCOUNT_ID } from "./account-id-BV5xNTUp.js";
import { t as getChannelPlugin } from "./registry-CI36HBCI.js";
//#region src/channels/plugins/setup-promotion-helpers.ts
const COMMON_SINGLE_ACCOUNT_KEYS_TO_MOVE = new Set([
	"name",
	"token",
	"tokenFile",
	"botToken",
	"appToken",
	"account",
	"signalNumber",
	"authDir",
	"cliPath",
	"dbPath",
	"httpUrl",
	"httpHost",
	"httpPort",
	"webhookPath",
	"webhookUrl",
	"webhookSecret",
	"service",
	"region",
	"homeserver",
	"userId",
	"accessToken",
	"password",
	"deviceName",
	"url",
	"code",
	"dmPolicy",
	"allowFrom",
	"groupPolicy",
	"groupAllowFrom",
	"defaultTo"
]);
const BUNDLED_SINGLE_ACCOUNT_PROMOTION_FALLBACKS = { telegram: ["streaming"] };
const BUNDLED_NAMED_ACCOUNT_PROMOTION_FALLBACKS = { telegram: ["botToken", "tokenFile"] };
function getChannelSetupPromotionSurface(channelKey) {
	const setup = getChannelPlugin(channelKey)?.setup ?? getBundledChannelPlugin(channelKey)?.setup;
	if (!setup || typeof setup !== "object") return null;
	return setup;
}
function isStaticSingleAccountPromotionKey(channelKey, key) {
	if (COMMON_SINGLE_ACCOUNT_KEYS_TO_MOVE.has(key)) return true;
	return BUNDLED_SINGLE_ACCOUNT_PROMOTION_FALLBACKS[channelKey]?.includes(key) ?? false;
}
function resolveSingleAccountKeysToMove(params) {
	const hasNamedAccounts = Object.keys(params.channel.accounts ?? {}).filter(Boolean).length > 0;
	const entries = Object.entries(params.channel).filter(([key, value]) => key !== "accounts" && key !== "enabled" && value !== void 0).map(([key]) => key);
	if (entries.length === 0) return [];
	let setupSurface;
	const resolveSetupSurface = () => {
		setupSurface ??= getChannelSetupPromotionSurface(params.channelKey);
		return setupSurface;
	};
	const keysToMove = entries.filter((key) => {
		if (isStaticSingleAccountPromotionKey(params.channelKey, key)) return true;
		return Boolean(resolveSetupSurface()?.singleAccountKeysToMove?.includes(key));
	});
	if (!hasNamedAccounts || keysToMove.length === 0) return keysToMove;
	const namedAccountPromotionKeys = resolveSetupSurface()?.namedAccountPromotionKeys ?? BUNDLED_NAMED_ACCOUNT_PROMOTION_FALLBACKS[params.channelKey];
	if (!namedAccountPromotionKeys) return keysToMove;
	return keysToMove.filter((key) => namedAccountPromotionKeys.includes(key));
}
function resolveSingleAccountPromotionTarget(params) {
	const accounts = params.channel.accounts ?? {};
	const resolveExistingAccountId = (targetAccountId) => {
		const normalizedTargetAccountId = normalizeAccountId(targetAccountId);
		return Object.keys(accounts).find((accountId) => normalizeAccountId(accountId) === normalizedTargetAccountId) ?? normalizedTargetAccountId;
	};
	const resolved = getChannelSetupPromotionSurface(params.channelKey)?.resolveSingleAccountPromotionTarget?.({ channel: params.channel });
	const normalizedResolved = normalizeOptionalString(resolved);
	if (normalizedResolved) return resolveExistingAccountId(normalizedResolved);
	return resolveExistingAccountId(DEFAULT_ACCOUNT_ID);
}
//#endregion
export { resolveSingleAccountPromotionTarget as n, resolveSingleAccountKeysToMove as t };
