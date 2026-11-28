import { f as listResolvedDirectoryGroupEntriesFromMapKeys, p as listResolvedDirectoryUserEntriesFromAllowFrom } from "./directory-config-helpers-BOMsgFuG.js";
import { t as resolveMergedWhatsAppAccountConfig } from "./account-config-Ca7bnLDW.js";
import { o as normalizeWhatsAppTarget, t as isWhatsAppGroupJid } from "./normalize-target-Cg7-rk-p.js";
import "./normalize-CkGGOSfX.js";
//#region extensions/whatsapp/src/directory-config.ts
function resolveWhatsAppDirectoryAccount(cfg, accountId) {
	return resolveMergedWhatsAppAccountConfig({
		cfg,
		accountId
	});
}
async function listWhatsAppDirectoryPeersFromConfig(params) {
	return listResolvedDirectoryUserEntriesFromAllowFrom({
		...params,
		resolveAccount: resolveWhatsAppDirectoryAccount,
		resolveAllowFrom: (account) => account.allowFrom,
		normalizeId: (entry) => {
			const normalized = normalizeWhatsAppTarget(entry);
			if (!normalized || isWhatsAppGroupJid(normalized)) return null;
			return normalized;
		}
	});
}
async function listWhatsAppDirectoryGroupsFromConfig(params) {
	return listResolvedDirectoryGroupEntriesFromMapKeys({
		...params,
		resolveAccount: resolveWhatsAppDirectoryAccount,
		resolveGroups: (account) => account.groups
	});
}
//#endregion
export { listWhatsAppDirectoryPeersFromConfig as n, listWhatsAppDirectoryGroupsFromConfig as t };
