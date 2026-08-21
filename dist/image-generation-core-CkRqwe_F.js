import "./subsystem-DMryAe7X.js";
import "./provider-env-vars-DV0ZZ1ed.js";
import "./failover-error-Cy4poLEJ.js";
import "./provider-registry-BzIlGxkn.js";
import "./runtime-shared-L9M_iW_F.js";
import "./provider-model-shared-Cw7Df4po.js";
import "./provider-model-defaults-BiwvrDpx.js";
//#region src/plugin-sdk/image-generation-core.ts
let imageGenerationCoreAuthRuntimePromise;
async function loadImageGenerationCoreAuthRuntime() {
	imageGenerationCoreAuthRuntimePromise ??= import("./image-generation-core.auth.runtime-C5FTrVOA.js");
	return imageGenerationCoreAuthRuntimePromise;
}
async function resolveApiKeyForProvider(...args) {
	return (await loadImageGenerationCoreAuthRuntime()).resolveApiKeyForProvider(...args);
}
//#endregion
export { resolveApiKeyForProvider as t };
