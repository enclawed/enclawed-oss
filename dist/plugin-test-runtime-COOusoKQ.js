import { t as loadBundledPluginPublicArtifactModuleSync } from "./public-surface-loader-CSNnpnbU.js";
import "./manifest-registry-DwVSF2gb.js";
import "./registry-Bj1z72i4.js";
import "./hook-runner-global-B18jmw-H.js";
import "./runtime-v-gfCtZv.js";
import "./provider-discovery-CNqhRIkd.js";
import "./facade-runtime-Oph1J7lc.js";
import "./registry-BATJ3eS5.js";
import "./web-provider-public-artifacts.explicit-CgfO3JVb.js";
import "./runtime-taskflow-B24e23Fv.js";
import { n as vi } from "./test.D1JkM1w4-D13rLkG2.js";
import "./channel-test-registry-Cvv4nXJq.js";
import "./provider-wizard-CStaJN_F.js";
import "./provider-auth-choice.runtime-BWlZLFLw.js";
import "./hooks.test-helpers-BHtl4-IC.js";
import { r as createRuntimeEnv } from "./plugin-runtime-env-BQ5BBPPv.js";
import { t as buildChannelSetupWizardAdapterFromSetupWizard } from "./setup-wizard-DLMUkzaD.js";
//#region src/plugins/provider-contract-public-artifacts.ts
function isRecord(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isProviderPlugin(value) {
	return isRecord(value) && typeof value.id === "string" && typeof value.label === "string" && Array.isArray(value.auth);
}
function tryLoadProviderContractApi(pluginId) {
	try {
		return loadBundledPluginPublicArtifactModuleSync({
			dirName: pluginId,
			artifactBasename: "provider-contract-api.js"
		});
	} catch (error) {
		if (error instanceof Error && error.message.startsWith("Unable to resolve bundled plugin public surface ")) return null;
		throw error;
	}
}
function collectProviderContractEntries(params) {
	const providers = [];
	for (const [name, exported] of Object.entries(params.mod).toSorted(([left], [right]) => left.localeCompare(right))) {
		if (typeof exported !== "function" || exported.length !== 0 || !name.startsWith("create") || !name.endsWith("Provider")) continue;
		const candidate = exported();
		if (isProviderPlugin(candidate)) providers.push({
			pluginId: params.pluginId,
			provider: candidate
		});
	}
	return providers;
}
function resolveBundledExplicitProviderContractsFromPublicArtifacts(params) {
	const providers = [];
	for (const pluginId of [...new Set(params.onlyPluginIds)].toSorted((left, right) => left.localeCompare(right))) {
		const mod = tryLoadProviderContractApi(pluginId);
		if (!mod) return null;
		const entries = collectProviderContractEntries({
			pluginId,
			mod
		});
		if (entries.length === 0) return null;
		providers.push(...entries);
	}
	return providers;
}
//#endregion
//#region src/test-utils/plugin-setup-wizard.ts
async function selectFirstWizardOption(params) {
	const first = params.options[0];
	if (!first) throw new Error("no options");
	return first.value;
}
function createTestWizardPrompter(overrides = {}) {
	return {
		intro: vi.fn(async () => {}),
		outro: vi.fn(async () => {}),
		note: vi.fn(async () => {}),
		select: selectFirstWizardOption,
		multiselect: vi.fn(async () => []),
		text: vi.fn(async () => ""),
		confirm: vi.fn(async () => false),
		progress: vi.fn(() => ({
			update: vi.fn(),
			stop: vi.fn()
		})),
		...overrides
	};
}
function createQueuedWizardPrompter(params) {
	const selectValues = [...params?.selectValues ?? []];
	const textValues = [...params?.textValues ?? []];
	const confirmValues = [...params?.confirmValues ?? []];
	const intro = vi.fn(async () => void 0);
	const outro = vi.fn(async () => void 0);
	const note = vi.fn(async () => void 0);
	const select = vi.fn(async () => selectValues.shift() ?? "");
	const multiselect = vi.fn(async () => []);
	const text = vi.fn(async () => textValues.shift() ?? "");
	const confirm = vi.fn(async () => confirmValues.shift() ?? false);
	const progress = vi.fn(() => ({
		update: vi.fn(),
		stop: vi.fn()
	}));
	return {
		intro,
		outro,
		note,
		select,
		multiselect,
		text,
		confirm,
		progress,
		prompter: createTestWizardPrompter({
			intro,
			outro,
			note,
			select,
			multiselect,
			text,
			confirm,
			progress
		})
	};
}
function isDeclarativeSetupWizard(setupWizard) {
	return Boolean(setupWizard && typeof setupWizard === "object" && "status" in setupWizard && "credentials" in setupWizard);
}
function requireDeclarativeSetupWizard(plugin) {
	const { setupWizard } = plugin;
	if (!setupWizard) throw new Error(`${plugin.id} is missing setupWizard`);
	if (!isDeclarativeSetupWizard(setupWizard)) throw new Error(`${plugin.id} setupWizard is adapter-shaped; test helper expects a wizard`);
	return setupWizard;
}
function resolveSetupWizardAccountContext(params) {
	return {
		cfg: params.cfg ?? {},
		accountId: params.accountId ?? "default",
		credentialValues: params.credentialValues ?? {}
	};
}
function resolveSetupWizardRuntime(runtime) {
	return runtime ?? createRuntimeEnv({ throwOnExit: false });
}
function resolveSetupWizardPrompter(prompter) {
	return prompter ?? createTestWizardPrompter();
}
function resolveSetupWizardNotePrompter(prompter) {
	return prompter ?? { note: vi.fn(async () => void 0) };
}
function createSetupWizardAdapter(params) {
	return buildChannelSetupWizardAdapterFromSetupWizard(params);
}
function createPluginSetupWizardAdapter(plugin) {
	return createSetupWizardAdapter({
		plugin,
		wizard: requireDeclarativeSetupWizard(plugin)
	});
}
function createPluginSetupWizardConfigure(plugin) {
	return createPluginSetupWizardAdapter(plugin).configure;
}
function createPluginSetupWizardStatus(plugin) {
	return createPluginSetupWizardAdapter(plugin).getStatus;
}
async function runSetupWizardConfigure(params) {
	return await params.configure({
		cfg: params.cfg ?? {},
		runtime: params.runtime ?? createRuntimeEnv(),
		prompter: params.prompter,
		options: params.options ?? {},
		accountOverrides: params.accountOverrides ?? {},
		shouldPromptAccountIds: params.shouldPromptAccountIds ?? false,
		forceAllowFrom: params.forceAllowFrom ?? false
	});
}
async function runSetupWizardPrepare(params) {
	const context = resolveSetupWizardAccountContext({
		cfg: params.cfg,
		accountId: params.accountId,
		credentialValues: params.credentialValues
	});
	return await params.prepare?.({
		...context,
		runtime: resolveSetupWizardRuntime(params.runtime),
		prompter: resolveSetupWizardPrompter(params.prompter),
		options: params.options
	});
}
async function runSetupWizardFinalize(params) {
	const context = resolveSetupWizardAccountContext({
		cfg: params.cfg,
		accountId: params.accountId,
		credentialValues: params.credentialValues
	});
	return await params.finalize?.({
		...context,
		runtime: resolveSetupWizardRuntime(params.runtime),
		prompter: resolveSetupWizardPrompter(params.prompter),
		options: params.options,
		forceAllowFrom: params.forceAllowFrom ?? false
	});
}
async function promptSetupWizardAllowFrom(params) {
	const context = resolveSetupWizardAccountContext({
		cfg: params.cfg,
		accountId: params.accountId
	});
	return await params.promptAllowFrom?.({
		cfg: context.cfg,
		accountId: context.accountId,
		prompter: resolveSetupWizardPrompter(params.prompter)
	});
}
async function resolveSetupWizardAllowFromEntries(params) {
	const context = resolveSetupWizardAccountContext({
		cfg: params.cfg,
		accountId: params.accountId,
		credentialValues: params.credentialValues
	});
	return await params.resolveEntries?.({
		...context,
		entries: params.entries
	});
}
async function resolveSetupWizardGroupAllowlist(params) {
	const context = resolveSetupWizardAccountContext({
		cfg: params.cfg,
		accountId: params.accountId,
		credentialValues: params.credentialValues
	});
	return await params.resolveAllowlist?.({
		...context,
		entries: params.entries,
		prompter: resolveSetupWizardNotePrompter(params.prompter)
	});
}
//#endregion
export { createSetupWizardAdapter as a, resolveSetupWizardAllowFromEntries as c, runSetupWizardFinalize as d, runSetupWizardPrepare as f, createQueuedWizardPrompter as i, resolveSetupWizardGroupAllowlist as l, resolveBundledExplicitProviderContractsFromPublicArtifacts as m, createPluginSetupWizardConfigure as n, createTestWizardPrompter as o, selectFirstWizardOption as p, createPluginSetupWizardStatus as r, promptSetupWizardAllowFrom as s, createPluginSetupWizardAdapter as t, runSetupWizardConfigure as u };
