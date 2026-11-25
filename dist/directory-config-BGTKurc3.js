import { f as listResolvedDirectoryGroupEntriesFromMapKeys, p as listResolvedDirectoryUserEntriesFromAllowFrom } from "./directory-config-helpers-BwQGF00n.js";
import { t as resolveMergedWhatsAppAccountConfig } from "./account-config-J_p_Q7eJ.js";
import { o as normalizeWhatsAppTarget, t as isWhatsAppGroupJid } from "./normalize-target-no2icesP.js";
import "./normalize-DqCitseu.js";
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
