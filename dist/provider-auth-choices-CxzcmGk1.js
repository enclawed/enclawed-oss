import { t as loadPluginManifestRegistry } from "./manifest-registry-DwVSF2gb.js";
import "./provider-auth-aliases-BedcKmsr.js";
import { a as normalizePluginsConfig, o as resolveEffectiveEnableState } from "./config-state-BmxTP58e.js";
//#region src/plugins/provider-auth-choices.ts
const PROVIDER_AUTH_CHOICE_ORIGIN_PRIORITY = {
	config: 0,
	bundled: 1,
	global: 2,
	workspace: 3
};
function resolveProviderAuthChoiceOriginPriority(origin) {
	if (!origin) return Number.MAX_SAFE_INTEGER;
	return PROVIDER_AUTH_CHOICE_ORIGIN_PRIORITY[origin] ?? Number.MAX_SAFE_INTEGER;
}
function toProviderAuthChoiceCandidate(params) {
	const { pluginId, origin, choice } = params;
	return {
		pluginId,
		origin,
		providerId: choice.provider,
		methodId: choice.method,
		choiceId: choice.choiceId,
		choiceLabel: choice.choiceLabel ?? choice.choiceId,
		...choice.choiceHint ? { choiceHint: choice.choiceHint } : {},
		...choice.assistantPriority !== void 0 ? { assistantPriority: choice.assistantPriority } : {},
		...choice.assistantVisibility ? { assistantVisibility: choice.assistantVisibility } : {},
		...choice.deprecatedChoiceIds ? { deprecatedChoiceIds: choice.deprecatedChoiceIds } : {},
		...choice.groupId ? { groupId: choice.groupId } : {},
		...choice.groupLabel ? { groupLabel: choice.groupLabel } : {},
		...choice.groupHint ? { groupHint: choice.groupHint } : {},
		...choice.optionKey ? { optionKey: choice.optionKey } : {},
		...choice.cliFlag ? { cliFlag: choice.cliFlag } : {},
		...choice.cliOption ? { cliOption: choice.cliOption } : {},
		...choice.cliDescription ? { cliDescription: choice.cliDescription } : {},
		...choice.onboardingScopes ? { onboardingScopes: choice.onboardingScopes } : {}
	};
}
function stripChoiceOrigin(choice) {
	const { origin: _origin, ...metadata } = choice;
	return metadata;
}
function resolveManifestProviderAuthChoiceCandidates(params) {
	const registry = loadPluginManifestRegistry({
		config: params?.config,
		workspaceDir: params?.workspaceDir,
		env: params?.env
	});
	const normalizedConfig = normalizePluginsConfig(params?.config?.plugins);
	return registry.plugins.flatMap((plugin) => {
		if (plugin.origin === "workspace" && params?.includeUntrustedWorkspacePlugins === false && !resolveEffectiveEnableState({
			id: plugin.id,
			origin: plugin.origin,
			config: normalizedConfig,
			rootConfig: params?.config
		}).enabled) return [];
		return (plugin.providerAuthChoices ?? []).map((choice) => toProviderAuthChoiceCandidate({
			pluginId: plugin.id,
			origin: plugin.origin,
			choice
		}));
	});
}
function pickPreferredManifestAuthChoice(candidates) {
	let preferred;
	for (const candidate of candidates) {
		if (!preferred) {
			preferred = candidate;
			continue;
		}
		if (resolveProviderAuthChoiceOriginPriority(candidate.origin) < resolveProviderAuthChoiceOriginPriority(preferred.origin)) preferred = candidate;
	}
	return preferred;
}
function resolvePreferredManifestAuthChoicesByChoiceId(candidates) {
	const preferredByChoiceId = /* @__PURE__ */ new Map();
	for (const candidate of candidates) {
		const normalizedChoiceId = candidate.choiceId.trim();
		if (!normalizedChoiceId) continue;
		const existing = preferredByChoiceId.get(normalizedChoiceId);
		if (!existing || resolveProviderAuthChoiceOriginPriority(candidate.origin) < resolveProviderAuthChoiceOriginPriority(existing.origin)) preferredByChoiceId.set(normalizedChoiceId, candidate);
	}
	return [...preferredByChoiceId.values()];
}
function resolveManifestProviderAuthChoices(params) {
	return resolvePreferredManifestAuthChoicesByChoiceId(resolveManifestProviderAuthChoiceCandidates(params)).map(stripChoiceOrigin);
}
function resolveManifestProviderAuthChoice(choiceId, params) {
	const normalized = choiceId.trim();
	if (!normalized) return;
	const preferred = pickPreferredManifestAuthChoice(resolveManifestProviderAuthChoiceCandidates(params).filter((choice) => choice.choiceId === normalized));
	return preferred ? stripChoiceOrigin(preferred) : void 0;
}
function resolveManifestDeprecatedProviderAuthChoice(choiceId, params) {
	const normalized = choiceId.trim();
	if (!normalized) return;
	const preferred = pickPreferredManifestAuthChoice(resolveManifestProviderAuthChoiceCandidates(params).filter((choice) => choice.deprecatedChoiceIds?.includes(normalized)));
	return preferred ? stripChoiceOrigin(preferred) : void 0;
}
function resolveManifestProviderOnboardAuthFlags(params) {
	const preferredByFlag = /* @__PURE__ */ new Map();
	for (const choice of resolveManifestProviderAuthChoiceCandidates(params)) {
		if (!choice.optionKey || !choice.cliFlag || !choice.cliOption) continue;
		const normalizedChoice = {
			...choice,
			optionKey: choice.optionKey,
			cliFlag: choice.cliFlag,
			cliOption: choice.cliOption
		};
		const dedupeKey = `${choice.optionKey}::${choice.cliFlag}`;
		const existing = preferredByFlag.get(dedupeKey);
		if (existing && resolveProviderAuthChoiceOriginPriority(normalizedChoice.origin) >= resolveProviderAuthChoiceOriginPriority(existing.origin)) continue;
		preferredByFlag.set(dedupeKey, normalizedChoice);
	}
	const flags = [];
	for (const choice of preferredByFlag.values()) flags.push({
		optionKey: choice.optionKey,
		authChoice: choice.choiceId,
		cliFlag: choice.cliFlag,
		cliOption: choice.cliOption,
		description: choice.cliDescription ?? choice.choiceLabel
	});
	return flags;
}
//#endregion
export { resolveManifestProviderOnboardAuthFlags as i, resolveManifestProviderAuthChoice as n, resolveManifestProviderAuthChoices as r, resolveManifestDeprecatedProviderAuthChoice as t };
