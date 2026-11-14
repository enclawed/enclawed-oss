import { n as resolvePluginProviders } from "./providers.runtime-ClZUJ99x.js";
import { a as runProviderModelSelectedHook, r as resolveProviderPluginChoice } from "./provider-wizard-3BCx5gC6.js";
import { n as resolveProviderModelPickerFlowEntries, t as resolveProviderModelPickerFlowContributions } from "./provider-flow-C9asGJsE.js";
import { n as runProviderPluginAuthMethod } from "./provider-auth-choice-DLFwe3b1.js";
//#region src/commands/model-picker.runtime.ts
const modelPickerRuntime = {
	resolveProviderModelPickerContributions: resolveProviderModelPickerFlowContributions,
	resolveProviderModelPickerEntries: resolveProviderModelPickerFlowEntries,
	resolveProviderPluginChoice,
	runProviderModelSelectedHook,
	resolvePluginProviders,
	runProviderPluginAuthMethod
};
//#endregion
export { modelPickerRuntime };
