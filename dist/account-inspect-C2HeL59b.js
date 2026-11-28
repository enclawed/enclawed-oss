import { s as normalizeOptionalString } from "./string-coerce-BUSzWgUA.js";
import { a as hasConfiguredSecretInput, i as coerceSecretRef, l as normalizeSecretInputString } from "./types.secrets-5qZ-WD40.js";
import { l as resolveDefaultSecretProviderAlias } from "./ref-contract-BcsMy7In.js";
import { n as normalizeAccountId } from "./account-id-D21PQgB3.js";
import { i as tryReadSecretFileSync } from "./secret-file-BgN_hgHh.js";
import "./routing-BPZr5gOS.js";
import "./text-runtime-a81Cxtqz.js";
import { n as resolveAccountWithDefaultFallback } from "./account-core-CKXtszhc.js";
import "./channel-core-DBUc1lC4.js";
import "./provider-auth-YDU2Mel6.js";
import "./secret-input-BNveMuv1.js";
import "./secret-input-runtime-CBpV9UVr.js";
import { n as resolveTelegramAccountConfig, t as mergeTelegramAccountConfig } from "./account-config-CgBTUxyT.js";
import { a as resolveDefaultTelegramAccountId } from "./accounts-CSiI7zpz.js";
//#region extensions/telegram/src/account-inspect.ts
function inspectTokenFile(pathValue) {
	const tokenFile = normalizeOptionalString(pathValue) ?? "";
	if (!tokenFile) return null;
	const token = tryReadSecretFileSync(tokenFile, "Telegram bot token", { rejectSymlink: true });
	return {
		token: token ?? "",
		tokenSource: "tokenFile",
		tokenStatus: token ? "available" : "configured_unavailable"
	};
}
function canResolveEnvSecretRefInReadOnlyPath(params) {
	const providerConfig = params.cfg.secrets?.providers?.[params.provider];
	if (!providerConfig) return params.provider === resolveDefaultSecretProviderAlias(params.cfg, "env");
	if (providerConfig.source !== "env") return false;
	const allowlist = providerConfig.allowlist;
	return !allowlist || allowlist.includes(params.id);
}
function inspectTokenValue(params) {
	const ref = coerceSecretRef(params.value, params.cfg.secrets?.defaults);
	if (ref?.source === "env") {
		if (!canResolveEnvSecretRefInReadOnlyPath({
			cfg: params.cfg,
			provider: ref.provider,
			id: ref.id
		})) return {
			token: "",
			tokenSource: "env",
			tokenStatus: "configured_unavailable"
		};
		const envValue = normalizeOptionalString(process.env[ref.id]);
		if (envValue) return {
			token: envValue,
			tokenSource: "env",
			tokenStatus: "available"
		};
		return {
			token: "",
			tokenSource: "env",
			tokenStatus: "configured_unavailable"
		};
	}
	const token = normalizeSecretInputString(params.value);
	if (token) return {
		token,
		tokenSource: "config",
		tokenStatus: "available"
	};
	if (hasConfiguredSecretInput(params.value, params.cfg.secrets?.defaults)) return {
		token: "",
		tokenSource: "config",
		tokenStatus: "configured_unavailable"
	};
	return null;
}
function inspectTelegramAccountPrimary(params) {
	const accountId = normalizeAccountId(params.accountId);
	const merged = mergeTelegramAccountConfig(params.cfg, accountId);
	const enabled = params.cfg.channels?.telegram?.enabled !== false && merged.enabled !== false;
	const accountConfig = resolveTelegramAccountConfig(params.cfg, accountId);
	const accountTokenFile = inspectTokenFile(accountConfig?.tokenFile);
	if (accountTokenFile) return {
		accountId,
		enabled,
		name: normalizeOptionalString(merged.name),
		token: accountTokenFile.token,
		tokenSource: accountTokenFile.tokenSource,
		tokenStatus: accountTokenFile.tokenStatus,
		configured: accountTokenFile.tokenStatus !== "missing",
		config: merged
	};
	const accountToken = inspectTokenValue({
		cfg: params.cfg,
		value: accountConfig?.botToken
	});
	if (accountToken) return {
		accountId,
		enabled,
		name: normalizeOptionalString(merged.name),
		token: accountToken.token,
		tokenSource: accountToken.tokenSource,
		tokenStatus: accountToken.tokenStatus,
		configured: accountToken.tokenStatus !== "missing",
		config: merged
	};
	const channelTokenFile = inspectTokenFile(params.cfg.channels?.telegram?.tokenFile);
	if (channelTokenFile) return {
		accountId,
		enabled,
		name: normalizeOptionalString(merged.name),
		token: channelTokenFile.token,
		tokenSource: channelTokenFile.tokenSource,
		tokenStatus: channelTokenFile.tokenStatus,
		configured: channelTokenFile.tokenStatus !== "missing",
		config: merged
	};
	const channelToken = inspectTokenValue({
		cfg: params.cfg,
		value: params.cfg.channels?.telegram?.botToken
	});
	if (channelToken) return {
		accountId,
		enabled,
		name: normalizeOptionalString(merged.name),
		token: channelToken.token,
		tokenSource: channelToken.tokenSource,
		tokenStatus: channelToken.tokenStatus,
		configured: channelToken.tokenStatus !== "missing",
		config: merged
	};
	const envToken = accountId === "default" ? normalizeOptionalString(params.envToken) ?? normalizeOptionalString(process.env.TELEGRAM_BOT_TOKEN) ?? "" : "";
	if (envToken) return {
		accountId,
		enabled,
		name: normalizeOptionalString(merged.name),
		token: envToken,
		tokenSource: "env",
		tokenStatus: "available",
		configured: true,
		config: merged
	};
	return {
		accountId,
		enabled,
		name: normalizeOptionalString(merged.name),
		token: "",
		tokenSource: "none",
		tokenStatus: "missing",
		configured: false,
		config: merged
	};
}
function inspectTelegramAccount(params) {
	return resolveAccountWithDefaultFallback({
		accountId: params.accountId,
		normalizeAccountId,
		resolvePrimary: (accountId) => inspectTelegramAccountPrimary({
			cfg: params.cfg,
			accountId,
			envToken: params.envToken
		}),
		hasCredential: (account) => account.tokenSource !== "none",
		resolveDefaultAccountId: () => resolveDefaultTelegramAccountId(params.cfg)
	});
}
//#endregion
export { inspectTelegramAccount as t };
