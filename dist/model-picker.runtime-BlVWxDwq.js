import { n as resolvePluginProviders } from "./providers.runtime-Bq4Whzz2.js";
import { a as runProviderModelSelectedHook, r as resolveProviderPluginChoice } from "./provider-wizard-KRwgXCPZ.js";
import { n as resolveProviderModelPickerFlowEntries, t as resolveProviderModelPickerFlowContributions } from "./provider-flow-B2vexQ4g.js";
import { n as runProviderPluginAuthMethod } from "./provider-auth-choice-zRhKwtad.js";
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
