import "./subsystem-BCgIuXto.js";
import "./provider-env-vars-CGgXrTCs.js";
import "./failover-error-B67zbAXx.js";
import "./provider-registry-DKDX5fOo.js";
import "./runtime-shared-f_HZ3MYU.js";
import "./provider-model-shared-BHjQaIH0.js";
import "./provider-model-defaults-Ct8cdBcL.js";
//#region src/plugin-sdk/image-generation-core.ts
let imageGenerationCoreAuthRuntimePromise;
async function loadImageGenerationCoreAuthRuntime() {
	imageGenerationCoreAuthRuntimePromise ??= import("./image-generation-core.auth.runtime-N-TkluhQ.js");
	return imageGenerationCoreAuthRuntimePromise;
}
async function resolveApiKeyForProvider(...args) {
	return (await loadImageGenerationCoreAuthRuntime()).resolveApiKeyForProvider(...args);
}
//#endregion
export { resolveApiKeyForProvider as t };
