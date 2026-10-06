import { n as resolvePluginProviders } from "./providers.runtime-C4agMF7-.js";
import { a as runProviderModelSelectedHook, r as resolveProviderPluginChoice } from "./provider-wizard-BS_xf2yC.js";
import { n as resolveProviderModelPickerFlowEntries, t as resolveProviderModelPickerFlowContributions } from "./provider-flow-5TuCJGM5.js";
import { n as runProviderPluginAuthMethod } from "./provider-auth-choice-Dp8DxwCY.js";
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
