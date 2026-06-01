import { n as resolvePluginProviders } from "./providers.runtime-6enRkfCK.js";
import { a as runProviderModelSelectedHook, r as resolveProviderPluginChoice } from "./provider-wizard-CStaJN_F.js";
import { n as resolveProviderModelPickerFlowEntries, t as resolveProviderModelPickerFlowContributions } from "./provider-flow-DJadE8Sa.js";
import { n as runProviderPluginAuthMethod } from "./provider-auth-choice-BFCNlArO.js";
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
