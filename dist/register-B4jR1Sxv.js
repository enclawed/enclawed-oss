import { c as createActionBatcher, f as resolveActionBatcherOptions, u as registerActionBatcher } from "./src-Bv_GP2Sj.js";
//#region extensions/egress-action-batcher/src/register.ts
function registerConfiguredActionBatcher(pluginConfig) {
	if ((pluginConfig && typeof pluginConfig === "object" ? pluginConfig : {}).enabled === false) return null;
	const batcher = createActionBatcher(resolveActionBatcherOptions(pluginConfig));
	registerActionBatcher(batcher);
	return batcher;
}
//#endregion
export { registerConfiguredActionBatcher as t };
