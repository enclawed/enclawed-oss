import { r as normalizeProviderId } from "./provider-id-JqYiEozY.js";
import { n as ensureAuthProfileStore } from "./store-CFRep4YQ.js";
import "./model-selection-DYKhuAoE.js";
import { t as resolveEnvApiKey } from "./model-auth-env-uJYdkp-F.js";
import { t as resolveAuthProfileDisplayLabel } from "./auth-profiles-Dh_I1KC5.js";
import { n as resolveAuthProfileOrder } from "./order-CXBjWUf1.js";
import { l as resolveUsableCustomProviderApiKey } from "./model-auth-m8tj01Sr.js";
//#region src/agents/model-auth-label.ts
function resolveModelAuthLabel(params) {
	const resolvedProvider = params.provider?.trim();
	if (!resolvedProvider) return;
	const providerKey = normalizeProviderId(resolvedProvider);
	const store = ensureAuthProfileStore(params.agentDir, { allowKeychainPrompt: false });
	const profileOverride = params.sessionEntry?.authProfileOverride?.trim();
	const candidates = [profileOverride, ...resolveAuthProfileOrder({
		cfg: params.cfg,
		store,
		provider: providerKey,
		preferredProfile: profileOverride
	})].filter(Boolean);
	for (const profileId of candidates) {
		const profile = store.profiles[profileId];
		if (!profile || normalizeProviderId(profile.provider) !== providerKey) continue;
		const label = resolveAuthProfileDisplayLabel({
			cfg: params.cfg,
			store,
			profileId
		});
		if (profile.type === "oauth") return `oauth${label ? ` (${label})` : ""}`;
		if (profile.type === "token") return `token${label ? ` (${label})` : ""}`;
		return `api-key${label ? ` (${label})` : ""}`;
	}
	const envKey = resolveEnvApiKey(providerKey);
	if (envKey?.apiKey) {
		if (envKey.source.includes("OAUTH_TOKEN")) return `oauth (${envKey.source})`;
		return `api-key (${envKey.source})`;
	}
	if (resolveUsableCustomProviderApiKey({
		cfg: params.cfg,
		provider: providerKey
	})) return `api-key (models.json)`;
	return "unknown";
}
//#endregion
export { resolveModelAuthLabel as t };
