import "./subsystem-WGqvYWrS.js";
import "./provider-env-vars-Clirdqjr.js";
import "./failover-error-DwwfFRmS.js";
import "./provider-registry-Ci1YFa0U.js";
import "./runtime-shared-D1lOrHKS.js";
import "./provider-model-shared-Cw7Df4po.js";
import "./provider-model-defaults-C7HCVTQo.js";
//#region src/plugin-sdk/image-generation-core.ts
let imageGenerationCoreAuthRuntimePromise;
async function loadImageGenerationCoreAuthRuntime() {
	imageGenerationCoreAuthRuntimePromise ??= import("./image-generation-core.auth.runtime-FD56fX5J.js");
	return imageGenerationCoreAuthRuntimePromise;
}
async function resolveApiKeyForProvider(...args) {
	return (await loadImageGenerationCoreAuthRuntime()).resolveApiKeyForProvider(...args);
}
//#endregion
export { resolveApiKeyForProvider as t };
