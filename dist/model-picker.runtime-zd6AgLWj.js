import { n as resolvePluginProviders } from "./providers.runtime-Byo7sFMf.js";
import { a as runProviderModelSelectedHook, r as resolveProviderPluginChoice } from "./provider-wizard-CDzK2kAZ.js";
import { n as resolveProviderModelPickerFlowEntries, t as resolveProviderModelPickerFlowContributions } from "./provider-flow-AB3XNr8f.js";
import { n as runProviderPluginAuthMethod } from "./provider-auth-choice-BsUcMRDW.js";
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
