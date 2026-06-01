import "./subsystem-DTyALtnK.js";
import "./provider-env-vars-DV0ZZ1ed.js";
import "./failover-error-D2xeI4Un.js";
import "./provider-registry-yIIyWwXh.js";
import "./runtime-shared-DlqXEqhU.js";
import "./provider-model-shared-B5LoHGGO.js";
import "./provider-model-defaults-D4rAz44K.js";
//#region src/plugin-sdk/image-generation-core.ts
let imageGenerationCoreAuthRuntimePromise;
async function loadImageGenerationCoreAuthRuntime() {
	imageGenerationCoreAuthRuntimePromise ??= import("./image-generation-core.auth.runtime-D_DJt_0V.js");
	return imageGenerationCoreAuthRuntimePromise;
}
async function resolveApiKeyForProvider(...args) {
	return (await loadImageGenerationCoreAuthRuntime()).resolveApiKeyForProvider(...args);
}
//#endregion
export { resolveApiKeyForProvider as t };
