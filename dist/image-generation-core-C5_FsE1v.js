import "./subsystem-DMryAe7X.js";
import "./provider-env-vars-DV0ZZ1ed.js";
import "./failover-error-Cy4poLEJ.js";
import "./provider-registry-RaIZUzQm.js";
import "./runtime-shared-CRiS2nv-.js";
import "./provider-model-shared-B5LoHGGO.js";
import "./provider-model-defaults-DJj-vkT1.js";
//#region src/plugin-sdk/image-generation-core.ts
let imageGenerationCoreAuthRuntimePromise;
async function loadImageGenerationCoreAuthRuntime() {
	imageGenerationCoreAuthRuntimePromise ??= import("./image-generation-core.auth.runtime-DFr_VQH_.js");
	return imageGenerationCoreAuthRuntimePromise;
}
async function resolveApiKeyForProvider(...args) {
	return (await loadImageGenerationCoreAuthRuntime()).resolveApiKeyForProvider(...args);
}
//#endregion
export { resolveApiKeyForProvider as t };
